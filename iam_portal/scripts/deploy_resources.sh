#!/usr/bin/env bash
set -euo pipefail

# Standalone GCP deploy script for IAM Portal resources (no Terraform).
#
# Required env vars:
#   PROJECT_ID, REGION, DOMAIN, IAP_ADMIN_EMAIL
#
# Optional env vars:
#   FIRESTORE_DATABASE_NAME=iam-access
#   REQUEST_TOPIC_NAME=iam-request-topic
#   SERVICE_ACCOUNT_ID=iam-portal-run-sa
#   FUNCTION_SOURCE_BUCKET_NAME=<project>-function-source
#   ENABLE_IAP=false
#   IAP_OAUTH_CLIENT_ID=
#   IAP_OAUTH_CLIENT_SECRET=
#
# Example:
#   PROJECT_ID=my-project REGION=us-central1 DOMAIN=iam.example.com IAP_ADMIN_EMAIL=admin@example.com \
#   bash iam_portal/scripts/deploy_resources.sh

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-}"
DOMAIN="${DOMAIN:-}"
IAP_ADMIN_EMAIL="${IAP_ADMIN_EMAIL:-}"

FIRESTORE_DATABASE_NAME="${FIRESTORE_DATABASE_NAME:-iam-access}"
REQUEST_TOPIC_NAME="${REQUEST_TOPIC_NAME:-iam-request-topic}"
SERVICE_ACCOUNT_ID="${SERVICE_ACCOUNT_ID:-iam-portal-run-sa}"
FUNCTION_SOURCE_BUCKET_NAME="${FUNCTION_SOURCE_BUCKET_NAME:-${PROJECT_ID}-function-source}"
ENABLE_IAP="${ENABLE_IAP:-false}"
IAP_OAUTH_CLIENT_ID="${IAP_OAUTH_CLIENT_ID:-}"
IAP_OAUTH_CLIENT_SECRET="${IAP_OAUTH_CLIENT_SECRET:-}"
FORCE_DEPLOY_FUNCTIONS="${FORCE_DEPLOY_FUNCTIONS:-false}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IAM_PORTAL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC_BASE_DIR="${IAM_PORTAL_DIR}/terraform/src"

PORTAL_FN_NAME="iam-portal"
GRANTING_FN_NAME="iam-granting"
PARSER_FN_NAME="process-iam-request"

NEG_NAME="iam-portal-neg"
BACKEND_NAME="iam-portal-backend"
CERT_NAME="iam-portal-cert"
URL_MAP_NAME="iam-portal-url-map"
PROXY_NAME="iam-portal-https-proxy"
FWD_RULE_NAME="iam-portal-forwarding-rule"
IP_NAME="iam-portal-ip"

REQUIRED_APIS=(
  artifactregistry.googleapis.com
  cloudbuild.googleapis.com
  cloudfunctions.googleapis.com
  compute.googleapis.com
  eventarc.googleapis.com
  firestore.googleapis.com
  iap.googleapis.com
  pubsub.googleapis.com
  run.googleapis.com
)

log() {
  printf "\n[%s] %s\n" "$(date +"%Y-%m-%d %H:%M:%S")" "$*"
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_cmd() {
  command -v "$1" >/dev/null 2>&1 || die "Missing command: $1"
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || die "Required env var not set: $name"
}

prompt_if_empty() {
  local var_name="$1"
  local prompt_text="$2"
  local current_value="${!var_name:-}"

  if [[ -n "$current_value" ]]; then
    return
  fi

  read -r -p "$prompt_text: " current_value
  [[ -n "$current_value" ]] || die "$var_name cannot be empty"
  printf -v "$var_name" '%s' "$current_value"
}

safe_create() {
  local desc="$1"
  shift
  log "$desc"
  set +e
  "$@"
  local rc=$?
  set -e
  if [[ $rc -ne 0 ]]; then
    echo "WARN: command failed for '$desc'. Continuing (resource may already exist)." >&2
  fi
}

require_cmd gcloud
require_cmd curl

prompt_if_empty PROJECT_ID "Enter PROJECT_ID"
prompt_if_empty REGION "Enter REGION"
prompt_if_empty DOMAIN "Enter DOMAIN"
prompt_if_empty IAP_ADMIN_EMAIL "Enter IAP_ADMIN_EMAIL"

if [[ -z "${FUNCTION_SOURCE_BUCKET_NAME:-}" || "$FUNCTION_SOURCE_BUCKET_NAME" == "-function-source" ]]; then
  FUNCTION_SOURCE_BUCKET_NAME="${PROJECT_ID}-function-source"
fi

echo
echo "Deployment configuration:"
echo "  PROJECT_ID=${PROJECT_ID}"
echo "  REGION=${REGION}"
echo "  DOMAIN=${DOMAIN}"
echo "  IAP_ADMIN_EMAIL=${IAP_ADMIN_EMAIL}"
echo "  FIRESTORE_DATABASE_NAME=${FIRESTORE_DATABASE_NAME}"
echo "  REQUEST_TOPIC_NAME=${REQUEST_TOPIC_NAME}"
echo "  SERVICE_ACCOUNT_ID=${SERVICE_ACCOUNT_ID}"
echo "  FUNCTION_SOURCE_BUCKET_NAME=${FUNCTION_SOURCE_BUCKET_NAME}"
echo "  ENABLE_IAP=${ENABLE_IAP}"
echo
read -r -p "Proceed with deployment? (y/N): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  die "Deployment cancelled by user"
fi

gcloud config set project "$PROJECT_ID" >/dev/null

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_ID}@${PROJECT_ID}.iam.gserviceaccount.com"
EVENTARC_AGENT="service-${PROJECT_NUMBER}@gcp-sa-eventarc.iam.gserviceaccount.com"

log "Enabling required APIs"
for api in "${REQUIRED_APIS[@]}"; do
  safe_create "Enable API ${api}" gcloud services enable "$api" --project "$PROJECT_ID"
done

log "Creating/reusing service account ${SERVICE_ACCOUNT_EMAIL}"
if ! gcloud iam service-accounts describe "$SERVICE_ACCOUNT_EMAIL" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$SERVICE_ACCOUNT_ID" \
    --display-name "IAM Portal Custom Service Account" \
    --project "$PROJECT_ID"
fi

for role in \
  roles/datastore.owner \
  roles/logging.logWriter \
  roles/resourcemanager.projectIamAdmin \
  roles/aiplatform.user \
  roles/eventarc.eventReceiver; do
  safe_create "Grant ${role} to ${SERVICE_ACCOUNT_EMAIL}" \
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
      --member "serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
      --role "$role" \
      --quiet
done

safe_create "Grant Eventarc service agent role to ${EVENTARC_AGENT}" \
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:${EVENTARC_AGENT}" \
    --role roles/eventarc.serviceAgent \
    --quiet

log "Creating Firestore database ${FIRESTORE_DATABASE_NAME} (if missing)"
if ! gcloud firestore databases describe --database="$FIRESTORE_DATABASE_NAME" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud firestore databases create \
    --database="$FIRESTORE_DATABASE_NAME" \
    --location="$REGION" \
    --type=firestore-native \
    --project "$PROJECT_ID"
fi

log "Seeding admin user document in Firestore"
ACCESS_TOKEN="$(gcloud auth print-access-token)"
ADMIN_DOC_ID="${IAP_ADMIN_EMAIL//@/%40}"
FIRESTORE_DOC_URL="https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/${FIRESTORE_DATABASE_NAME}/documents/portal_users/${ADMIN_DOC_ID}"
curl -sS -X PATCH "$FIRESTORE_DOC_URL" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"fields":{"email":{"stringValue":"'"${IAP_ADMIN_EMAIL}"'"},"role":{"stringValue":"admin"}}}' >/dev/null

log "Creating Pub/Sub topic ${REQUEST_TOPIC_NAME} (if missing)"
if ! gcloud pubsub topics describe "$REQUEST_TOPIC_NAME" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud pubsub topics create "$REQUEST_TOPIC_NAME" --project "$PROJECT_ID"
fi

log "Creating function source bucket ${FUNCTION_SOURCE_BUCKET_NAME} (if missing)"
if ! gcloud storage buckets describe "gs://${FUNCTION_SOURCE_BUCKET_NAME}" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud storage buckets create "gs://${FUNCTION_SOURCE_BUCKET_NAME}" \
    --location "$REGION" \
    --uniform-bucket-level-access \
    --project "$PROJECT_ID"
fi

if gcloud functions describe "$PORTAL_FN_NAME" --gen2 --region "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1 && [[ "$FORCE_DEPLOY_FUNCTIONS" != "true" ]]; then
  log "Function ${PORTAL_FN_NAME} already exists. Skipping."
else
  log "Deploying function ${PORTAL_FN_NAME}"
  gcloud functions deploy "$PORTAL_FN_NAME" \
    --gen2 \
    --region "$REGION" \
    --runtime python311 \
    --entry-point portal \
    --source "${SRC_BASE_DIR}/portal" \
    --trigger-http \
    --service-account "$SERVICE_ACCOUNT_EMAIL" \
    --ingress-settings internal-and-gclb \
    --memory 256Mi \
    --timeout 60s \
    --max-instances 10 \
    --set-env-vars "FIRESTORE_DATABASE_ID=${FIRESTORE_DATABASE_NAME}" \
    --project "$PROJECT_ID" \
    --quiet
fi

if gcloud functions describe "$PARSER_FN_NAME" --gen2 --region "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1 && [[ "$FORCE_DEPLOY_FUNCTIONS" != "true" ]]; then
  log "Function ${PARSER_FN_NAME} already exists. Skipping."
else
  log "Deploying function ${PARSER_FN_NAME}"
  gcloud functions deploy "$PARSER_FN_NAME" \
    --gen2 \
    --region "$REGION" \
    --runtime python311 \
    --entry-point process_iam_request \
    --source "${SRC_BASE_DIR}/parser" \
    --trigger-topic "$REQUEST_TOPIC_NAME" \
    --service-account "$SERVICE_ACCOUNT_EMAIL" \
    --ingress-settings internal-only \
    --memory 512Mi \
    --timeout 60s \
    --max-instances 5 \
    --set-env-vars "FIRESTORE_DATABASE_ID=${FIRESTORE_DATABASE_NAME}" \
    --project "$PROJECT_ID" \
    --quiet
fi

if gcloud functions describe "$GRANTING_FN_NAME" --gen2 --region "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1 && [[ "$FORCE_DEPLOY_FUNCTIONS" != "true" ]]; then
  log "Function ${GRANTING_FN_NAME} already exists. Skipping."
else
  log "Deploying function ${GRANTING_FN_NAME}"
  gcloud functions deploy "$GRANTING_FN_NAME" \
    --gen2 \
    --region "$REGION" \
    --runtime python311 \
    --entry-point process_iam_grant \
    --source "${SRC_BASE_DIR}/granting" \
    --service-account "$SERVICE_ACCOUNT_EMAIL" \
    --ingress-settings internal-only \
    --memory 256Mi \
    --timeout 120s \
    --max-instances 5 \
    --trigger-location "$REGION" \
    --trigger-event-filters type=google.cloud.firestore.document.v1.updated \
    --trigger-event-filters database="$FIRESTORE_DATABASE_NAME" \
    --trigger-event-filters namespace="(default)" \
    --trigger-event-filters-path-pattern document='iam_requests/{requestId}' \
    --set-env-vars "FIRESTORE_DATABASE_ID=${FIRESTORE_DATABASE_NAME}" \
    --project "$PROJECT_ID" \
    --quiet
fi

log "Creating serverless NEG ${NEG_NAME} (if missing)"
if ! gcloud compute network-endpoint-groups describe "$NEG_NAME" --region "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute network-endpoint-groups create "$NEG_NAME" \
    --region "$REGION" \
    --network-endpoint-type serverless \
    --cloud-function-name "$PORTAL_FN_NAME" \
    --project "$PROJECT_ID"
fi

log "Creating backend service ${BACKEND_NAME} (if missing)"
if ! gcloud compute backend-services describe "$BACKEND_NAME" --global --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute backend-services create "$BACKEND_NAME" \
    --global \
    --protocol HTTP \
    --port-name http \
    --timeout 30s \
    --project "$PROJECT_ID"
fi

safe_create "Attach NEG ${NEG_NAME} to backend ${BACKEND_NAME}" \
  gcloud compute backend-services add-backend "$BACKEND_NAME" \
    --global \
    --network-endpoint-group "$NEG_NAME" \
    --network-endpoint-group-region "$REGION" \
    --project "$PROJECT_ID"

if [[ "$ENABLE_IAP" == "true" ]]; then
  if [[ -z "$IAP_OAUTH_CLIENT_ID" || -z "$IAP_OAUTH_CLIENT_SECRET" ]]; then
    die "ENABLE_IAP=true requires IAP_OAUTH_CLIENT_ID and IAP_OAUTH_CLIENT_SECRET"
  fi

  log "Enabling IAP on backend service"
  gcloud compute backend-services update "$BACKEND_NAME" \
    --global \
    --iap=enabled,oauth2-client-id="$IAP_OAUTH_CLIENT_ID",oauth2-client-secret="$IAP_OAUTH_CLIENT_SECRET" \
    --project "$PROJECT_ID"

  safe_create "Grant IAP access to ${IAP_ADMIN_EMAIL}" \
    gcloud iap web backend-services add-iam-policy-binding "$BACKEND_NAME" \
      --global \
      --member "user:${IAP_ADMIN_EMAIL}" \
      --role roles/iap.httpsResourceAccessor \
      --project "$PROJECT_ID"
fi

log "Creating managed SSL cert ${CERT_NAME} (if missing)"
if ! gcloud compute ssl-certificates describe "$CERT_NAME" --global --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute ssl-certificates create "$CERT_NAME" \
    --domains "$DOMAIN" \
    --global \
    --project "$PROJECT_ID"
fi

log "Creating URL map ${URL_MAP_NAME} (if missing)"
if ! gcloud compute url-maps describe "$URL_MAP_NAME" --global --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute url-maps create "$URL_MAP_NAME" \
    --default-service "$BACKEND_NAME" \
    --global \
    --project "$PROJECT_ID"
fi

log "Creating HTTPS proxy ${PROXY_NAME} (if missing)"
if ! gcloud compute target-https-proxies describe "$PROXY_NAME" --global --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute target-https-proxies create "$PROXY_NAME" \
    --url-map "$URL_MAP_NAME" \
    --ssl-certificates "$CERT_NAME" \
    --global \
    --project "$PROJECT_ID"
fi

log "Creating global IP ${IP_NAME} (if missing)"
if ! gcloud compute addresses describe "$IP_NAME" --global --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute addresses create "$IP_NAME" --global --project "$PROJECT_ID"
fi

LB_IP="$(gcloud compute addresses describe "$IP_NAME" --global --format='value(address)' --project "$PROJECT_ID")"

log "Creating forwarding rule ${FWD_RULE_NAME} (if missing)"
if ! gcloud compute forwarding-rules describe "$FWD_RULE_NAME" --global --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud compute forwarding-rules create "$FWD_RULE_NAME" \
    --global \
    --target-https-proxy "$PROXY_NAME" \
    --ports 443 \
    --address "$LB_IP" \
    --project "$PROJECT_ID"
fi

cat <<EOF

Deployment complete.
Project: ${PROJECT_ID}
Region: ${REGION}
Portal function: ${PORTAL_FN_NAME}
Parser function: ${PARSER_FN_NAME}
Granting function: ${GRANTING_FN_NAME}
Load balancer IP: ${LB_IP}
IAP enabled: ${ENABLE_IAP}

EOF

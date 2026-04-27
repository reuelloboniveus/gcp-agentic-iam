#!/usr/bin/env bash
set -euo pipefail

# Deploy only IAM Portal to Cloud Run (no Terraform).
#
# Prompts for required values if not set in environment.
# Supports both create and update of the Cloud Run service.

PROJECT_ID="${PROJECT_ID:-}"
REGION="${REGION:-}"
SERVICE_NAME="${SERVICE_NAME:-iam-portal}"
FIRESTORE_DATABASE_ID="${FIRESTORE_DATABASE_ID:-iam-access}"
ALLOW_UNAUTHENTICATED="${ALLOW_UNAUTHENTICATED:-false}"
ARTIFACT_REPO="${ARTIFACT_REPO:-cloud-run-images}"
ENABLE_LOAD_BALANCER="${ENABLE_LOAD_BALANCER:-true}"
DOMAIN="${DOMAIN:-}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IAM_PORTAL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGE_TAG="$(date +"%Y%m%d-%H%M%S")"

NEG_NAME="${SERVICE_NAME}-neg"
BACKEND_NAME="${SERVICE_NAME}-backend"
CERT_NAME="${SERVICE_NAME}-cert"
URL_MAP_NAME="${SERVICE_NAME}-url-map"
PROXY_NAME="${SERVICE_NAME}-https-proxy"
FWD_RULE_NAME="${SERVICE_NAME}-forwarding-rule"
IP_NAME="${SERVICE_NAME}-ip"

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

require_gcloud_auth() {
  local active_account
  active_account="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null || true)"
  [[ -n "$active_account" ]] || die "No active gcloud account. Run: gcloud auth login"
}

prompt_if_empty() {
  local var_name="$1"
  local prompt_text="$2"
  local value="${!var_name:-}"

  if [[ -n "$value" ]]; then
    return
  fi

  read -r -p "$prompt_text: " value
  [[ -n "$value" ]] || die "$var_name cannot be empty"
  printf -v "$var_name" '%s' "$value"
}

require_cmd gcloud
require_gcloud_auth

prompt_if_empty PROJECT_ID "Enter PROJECT_ID"
prompt_if_empty REGION "Enter REGION"

if [[ "$ENABLE_LOAD_BALANCER" == "true" ]]; then
  prompt_if_empty DOMAIN "Enter DOMAIN for HTTPS load balancer"
fi

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${SERVICE_NAME}:${IMAGE_TAG}"

echo
echo "Cloud Run deploy configuration:"
echo "  PROJECT_ID=${PROJECT_ID}"
echo "  REGION=${REGION}"
echo "  SERVICE_NAME=${SERVICE_NAME}"
echo "  FIRESTORE_DATABASE_ID=${FIRESTORE_DATABASE_ID}"
echo "  ALLOW_UNAUTHENTICATED=${ALLOW_UNAUTHENTICATED}"
echo "  ARTIFACT_REPO=${ARTIFACT_REPO}"
echo "  ENABLE_LOAD_BALANCER=${ENABLE_LOAD_BALANCER}"
if [[ "$ENABLE_LOAD_BALANCER" == "true" ]]; then
  echo "  DOMAIN=${DOMAIN}"
fi
echo "  IMAGE_URI=${IMAGE_URI}"
echo
read -r -p "Proceed with iam-portal Cloud Run deploy? (y/N): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
  die "Deployment cancelled by user"
fi

log "Setting active project"
gcloud config set project "$PROJECT_ID" >/dev/null

log "Enabling required APIs"
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  compute.googleapis.com \
  --project "$PROJECT_ID"

log "Ensuring Artifact Registry repository exists"
if ! gcloud artifacts repositories describe "$ARTIFACT_REPO" \
  --location "$REGION" \
  --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$ARTIFACT_REPO" \
    --location "$REGION" \
    --repository-format docker \
    --description "Docker repo for iam-portal Cloud Run images" \
    --project "$PROJECT_ID"
fi

log "Building container image with Cloud Build"
gcloud builds submit "$IAM_PORTAL_DIR" \
  --tag "$IMAGE_URI" \
  --project "$PROJECT_ID"

log "Deploying Cloud Run service ${SERVICE_NAME}"
DEPLOY_ARGS=(
  run deploy "$SERVICE_NAME"
  --image "$IMAGE_URI"
  --region "$REGION"
  --platform managed
  --set-env-vars "FIRESTORE_DATABASE_ID=${FIRESTORE_DATABASE_ID}"
  --project "$PROJECT_ID"
  --quiet
)

if [[ "$ALLOW_UNAUTHENTICATED" == "true" ]]; then
  DEPLOY_ARGS+=(--allow-unauthenticated)
else
  DEPLOY_ARGS+=(--no-allow-unauthenticated)
fi

gcloud "${DEPLOY_ARGS[@]}"

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)' --project "$PROJECT_ID")"

LB_IP=""
if [[ "$ENABLE_LOAD_BALANCER" == "true" ]]; then
  log "Creating serverless NEG ${NEG_NAME} (if missing)"
  if ! gcloud compute network-endpoint-groups describe "$NEG_NAME" --region "$REGION" --project "$PROJECT_ID" >/dev/null 2>&1; then
    gcloud compute network-endpoint-groups create "$NEG_NAME" \
      --region "$REGION" \
      --network-endpoint-type serverless \
      --cloud-run-service "$SERVICE_NAME" \
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
fi

cat <<EOF

Cloud Run deployment complete.
Service: ${SERVICE_NAME}
Region: ${REGION}
Image: ${IMAGE_URI}
URL: ${SERVICE_URL}
Load balancer enabled: ${ENABLE_LOAD_BALANCER}
Load balancer IP: ${LB_IP}

EOF

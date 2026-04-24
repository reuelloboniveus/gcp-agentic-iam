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

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IAM_PORTAL_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
IMAGE_TAG="$(date +"%Y%m%d-%H%M%S")"

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

IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${ARTIFACT_REPO}/${SERVICE_NAME}:${IMAGE_TAG}"

echo
echo "Cloud Run deploy configuration:"
echo "  PROJECT_ID=${PROJECT_ID}"
echo "  REGION=${REGION}"
echo "  SERVICE_NAME=${SERVICE_NAME}"
echo "  FIRESTORE_DATABASE_ID=${FIRESTORE_DATABASE_ID}"
echo "  ALLOW_UNAUTHENTICATED=${ALLOW_UNAUTHENTICATED}"
echo "  ARTIFACT_REPO=${ARTIFACT_REPO}"
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

cat <<EOF

Cloud Run deployment complete.
Service: ${SERVICE_NAME}
Region: ${REGION}
Image: ${IMAGE_URI}
URL: ${SERVICE_URL}

EOF

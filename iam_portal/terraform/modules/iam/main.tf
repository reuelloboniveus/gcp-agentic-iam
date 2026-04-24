locals {
  use_existing_service_account = trimspace(var.existing_service_account_email) != ""
  service_account_email        = local.use_existing_service_account ? var.existing_service_account_email : google_service_account.portal_sa[0].email
}

resource "google_service_account" "portal_sa" {
  count        = local.use_existing_service_account ? 0 : 1
  account_id   = var.service_account_id
  display_name = "IAM Portal Custom Service Account"
}

# Permissions for Firestore
resource "google_project_iam_member" "firestore_owner" {
  project = var.project_id
  role    = "roles/datastore.owner"
  member  = "serviceAccount:${local.service_account_email}"
}

# Permissions for Logging
resource "google_project_iam_member" "logging_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${local.service_account_email}"
}

# Permissions to manage IAM (for the granting function)
resource "google_project_iam_member" "iam_admin" {
  project = var.project_id
  role    = "roles/resourcemanager.projectIamAdmin"
  member  = "serviceAccount:${local.service_account_email}"
}

# Permissions for Vertex AI (for the parser function)
resource "google_project_iam_member" "vertex_ai" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${local.service_account_email}"
}

# Required for Cloud Functions 2nd gen Eventarc triggers
resource "google_project_iam_member" "eventarc_event_receiver" {
  project = var.project_id
  role    = "roles/eventarc.eventReceiver"
  member  = "serviceAccount:${local.service_account_email}"
}

output "service_account_email" {
  value = local.service_account_email
}

resource "google_service_account" "portal_sa" {
  account_id   = "iam-portal-sa"
  display_name = "IAM Portal Custom Service Account"
}

# Permissions for Firestore
resource "google_project_iam_member" "firestore_owner" {
  project = var.project_id
  role    = "roles/datastore.owner"
  member  = "serviceAccount:${google_service_account.portal_sa.email}"
}

# Permissions for Logging
resource "google_project_iam_member" "logging_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.portal_sa.email}"
}

# Permissions to manage IAM (for the granting function)
resource "google_project_iam_member" "iam_admin" {
  project = var.project_id
  role    = "roles/resourcemanager.projectIamAdmin"
  member  = "serviceAccount:${google_service_account.portal_sa.email}"
}

# Permissions for Vertex AI (for the parser function)
resource "google_project_iam_member" "vertex_ai" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.portal_sa.email}"
}

output "service_account_email" {
  value = google_service_account.portal_sa.email
}

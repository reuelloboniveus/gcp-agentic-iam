variable "project_id" { type = string }
variable "region" { type = string }

resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = "access-requests" # Or "(default)" if they prefer
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  # Setting deletion_policy to DELETE for development, but PROTECT is safer for production
  deletion_policy = "DELETE"
}

# Automatically seed the first admin user
resource "google_firestore_document" "admin_user" {
  project     = var.project_id
  database    = google_firestore_database.database.name
  collection  = "portal_users"
  document_id = var.admin_email
  fields      = jsonencode({
    email = { stringValue = var.admin_email }
    role  = { stringValue = "admin" }
  })
}

output "database_name" {
  value = google_firestore_database.database.name
}

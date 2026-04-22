resource "google_firestore_database" "database" {
  count       = var.create_firestore_database ? 1 : 0
  project     = var.project_id
  name        = "access-requests"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  # Setting deletion_policy to DELETE for development, but PROTECT is safer for production
  deletion_policy = "DELETE"
}

locals {
  firestore_database_name = var.create_firestore_database ? google_firestore_database.database[0].name : "access-requests"
}

# Automatically seed the first admin user
resource "google_firestore_document" "admin_user" {
  project     = var.project_id
  database    = local.firestore_database_name
  collection  = "portal_users"
  document_id = var.admin_email
  fields      = jsonencode({
    email = { stringValue = var.admin_email }
    role  = { stringValue = "admin" }
  })
}

output "database_name" {
  value = local.firestore_database_name
}

# --- Storage Bucket for Source ---
locals {
  requested_source_bucket_name = trimspace(var.function_source_bucket_name)
  candidate_source_bucket_name = local.requested_source_bucket_name != "" ? local.requested_source_bucket_name : "${var.project_id}-function-source"
  source_bucket_name           = lower(replace(replace(replace(replace(local.candidate_source_bucket_name, "\t", ""), "\\t", ""), " ", ""), "\"", ""))
}

resource "google_storage_bucket" "function_bucket" {
  name     = local.source_bucket_name
  location = var.region
  uniform_bucket_level_access = true
  force_destroy = true

  lifecycle {
    prevent_destroy = false
  }
}

# --- Portal Function ---
data "archive_file" "portal_source" {
  type        = "zip"
  source_dir  = "${path.module}/../../src/portal"
  output_path = "${path.module}/portal.zip"
}

resource "google_storage_bucket_object" "portal_zip" {
  name   = "portal-${data.archive_file.portal_source.output_md5}.zip"
  bucket = google_storage_bucket.function_bucket.name
  source = data.archive_file.portal_source.output_path

  depends_on = [google_storage_bucket.function_bucket]
}

resource "google_cloudfunctions2_function" "portal_function" {
  name        = "iam-portal"
  location    = var.region
  description = "IAM Portal Web Interface and API"

  build_config {
    runtime     = "python311"
    entry_point = "portal"
    source {
      storage_source {
        bucket = google_storage_bucket.function_bucket.name
        object = google_storage_bucket_object.portal_zip.name
      }
    }
  }

  service_config {
    max_instance_count = 10
    available_memory   = "256M"
    timeout_seconds    = 60
    service_account_email = var.service_account_id
    ingress_settings = "ALLOW_INTERNAL_AND_GCLB"
    environment_variables = {
      FIRESTORE_DATABASE_ID = var.firestore_database_name
    }
  }
}

# --- Granting Function ---
data "archive_file" "granting_source" {
  type        = "zip"
  source_dir  = "${path.module}/../../src/granting"
  output_path = "${path.module}/granting.zip"
}

resource "google_storage_bucket_object" "granting_zip" {
  name   = "granting-${data.archive_file.granting_source.output_md5}.zip"
  bucket = google_storage_bucket.function_bucket.name
  source = data.archive_file.granting_source.output_path

  depends_on = [google_storage_bucket.function_bucket]
}

resource "google_cloudfunctions2_function" "granting_function" {
  name        = "iam-granting"
  location    = var.region
  description = "IAM Granting Background Logic"

  build_config {
    runtime     = "python311"
    entry_point = "process_iam_grant"
    source {
      storage_source {
        bucket = google_storage_bucket.function_bucket.name
        object = google_storage_bucket_object.granting_zip.name
      }
    }
  }

  service_config {
    max_instance_count = 5
    available_memory   = "256M"
    timeout_seconds    = 120
    service_account_email = var.service_account_id
    ingress_settings = "ALLOW_INTERNAL_ONLY"
    environment_variables = {
      FIRESTORE_DATABASE_ID = var.firestore_database_name
    }
  }

  event_trigger {
    trigger_region = var.region
    event_type     = "google.cloud.firestore.document.v1.updated"
    event_filters {
      attribute = "database"
      value     = var.firestore_database_name
    }

    event_filters {
      attribute = "namespace"
      value     = "(default)"
    }

    event_filters {
      attribute = "document"
      operator  = "match-path-pattern"
      value     = "iam_requests/{requestId}"
    }
  }
}

# --- Parser Function ---
data "archive_file" "parser_source" {
  type        = "zip"
  source_dir  = "${path.module}/../../src/parser"
  output_path = "${path.module}/parser.zip"
}

resource "google_storage_bucket_object" "parser_zip" {
  name   = "parser-${data.archive_file.parser_source.output_md5}.zip"
  bucket = google_storage_bucket.function_bucket.name
  source = data.archive_file.parser_source.output_path

  depends_on = [google_storage_bucket.function_bucket]
}

resource "google_cloudfunctions2_function" "parser_function" {
  name        = "process-iam-request"
  location    = var.region
  description = "Parses raw IAM requests using Vertex AI"

  build_config {
    runtime     = "python311"
    entry_point = "process_iam_request"
    source {
      storage_source {
        bucket = google_storage_bucket.function_bucket.name
        object = google_storage_bucket_object.parser_zip.name
      }
    }
  }

  service_config {
    max_instance_count = 5
    available_memory   = "512M"
    timeout_seconds    = 60
    service_account_email = var.service_account_id
    ingress_settings = "ALLOW_INTERNAL_ONLY"
    environment_variables = {
      FIRESTORE_DATABASE_ID = var.firestore_database_name
    }
  }

  event_trigger {
    trigger_region = var.region
    event_type     = "google.cloud.pubsub.topic.v1.messagePublished"
    pubsub_topic   = var.request_topic_id
  }
}

output "portal_function_name" {
  value = google_cloudfunctions2_function.portal_function.name
}

output "portal_uri" {
  value = google_cloudfunctions2_function.portal_function.url
}

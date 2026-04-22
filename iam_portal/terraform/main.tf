terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    external = {
      source  = "hashicorp/external"
      version = "~> 2.3"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

data "external" "existing_resources" {
  count   = var.auto_detect_existing_resources ? 1 : 0
  program = ["powershell", "-ExecutionPolicy", "Bypass", "-File", "${path.module}/scripts/check_existing_resources.ps1"]

  query = {
    project_id              = var.project_id
    firestore_database_name = var.firestore_database_name
    request_topic_name      = var.request_topic_name
  }
}

locals {
  required_apis = toset([
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "cloudfunctions.googleapis.com",
    "compute.googleapis.com",
    "eventarc.googleapis.com",
    "firestore.googleapis.com",
    "iap.googleapis.com",
    "pubsub.googleapis.com",
    "run.googleapis.com"
  ])

  firestore_db_exists    = var.auto_detect_existing_resources ? try(data.external.existing_resources[0].result.firestore_exists, "false") == "true" : false
  request_topic_exists   = var.auto_detect_existing_resources ? try(data.external.existing_resources[0].result.topic_exists, "false") == "true" : false
  create_firestore_final = var.create_firestore_database && !local.firestore_db_exists
  create_topic_final     = var.create_request_topic && !local.request_topic_exists
}

resource "google_project_service" "required" {
  for_each           = local.required_apis
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

# --- IAM Module ---
module "iam" {
  source                         = "./modules/iam"
  project_id                     = var.project_id
  service_account_id             = var.cloud_run_service_account_id
  existing_service_account_email = var.existing_service_account_email
  depends_on                     = [google_project_service.required]
}

# --- Database Module ---
module "database" {
  source                    = "./modules/database"
  project_id                = var.project_id
  region                    = var.region
  admin_email               = var.iap_admin_email
  firestore_database_name   = var.firestore_database_name
  create_firestore_database = local.create_firestore_final
  depends_on                = [google_project_service.required]
}

# --- Pub/Sub Module ---
module "pubsub" {
  source               = "./modules/pubsub"
  project_id           = var.project_id
  create_request_topic = local.create_topic_final
  request_topic_name   = var.request_topic_name
  depends_on           = [google_project_service.required]
}

# --- Functions Module ---
module "functions" {
  source                        = "./modules/functions"
  project_id                    = var.project_id
  region                        = var.region
  service_account_id            = module.iam.service_account_email
  request_topic_id              = module.pubsub.topic_id
  create_function_source_bucket = var.create_function_source_bucket
  function_source_bucket_name   = var.function_source_bucket_name
  depends_on                    = [module.iam, module.database, module.pubsub]
}

# --- Networking Module ---
module "networking" {
  source             = "./modules/networking"
  project_id         = var.project_id
  region             = var.region
  domain             = var.domain
  portal_function_name = module.functions.portal_function_name
  iap_admin_email    = var.iap_admin_email
  depends_on         = [module.functions]
}

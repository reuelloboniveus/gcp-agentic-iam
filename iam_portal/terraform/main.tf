terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
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
  create_firestore_database = var.create_firestore_database
  depends_on                = [google_project_service.required]
}

# --- Pub/Sub Module ---
module "pubsub" {
  source               = "./modules/pubsub"
  project_id           = var.project_id
  create_request_topic = var.create_request_topic
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

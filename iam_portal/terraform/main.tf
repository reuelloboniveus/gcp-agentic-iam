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

# --- IAM Module ---
module "iam" {
  source     = "./modules/iam"
  project_id = var.project_id
}

# --- Database Module ---
module "database" {
  source      = "./modules/database"
  project_id  = var.project_id
  region      = var.region
  admin_email = var.iap_admin_email
}

# --- Pub/Sub Module ---
module "pubsub" {
  source     = "./modules/pubsub"
  project_id = var.project_id
}

# --- Functions Module ---
module "functions" {
  source             = "./modules/functions"
  project_id         = var.project_id
  region             = var.region
  service_account_id = module.iam.service_account_email
  request_topic_id   = module.pubsub.topic_id
}

# --- Networking Module ---
module "networking" {
  source             = "./modules/networking"
  project_id         = var.project_id
  region             = var.region
  domain             = var.domain
  portal_function_name = module.functions.portal_function_name
  iap_admin_email    = var.iap_admin_email
}

variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The region to deploy resources"
  type        = string
  default     = "us-central1"
}

variable "domain" {
  description = "The custom domain for the portal"
  type        = string
}

variable "iap_admin_email" {
  description = "Email address for IAP administration"
  type        = string
}

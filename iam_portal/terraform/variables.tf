variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The region to deploy resources"
  type        = string
}

variable "domain" {
  description = "The custom domain for the portal"
  type        = string
}

variable "iap_admin_email" {
  description = "Email address for IAP administration"
  type        = string
}

variable "existing_service_account_email" {
  description = "Existing service account email to reuse. Leave empty to create iam-portal-sa."
  type        = string
  default     = ""
}

variable "cloud_run_service_account_id" {
  description = "Account ID for the Cloud Run/Cloud Functions execution service account when creating one."
  type        = string
  default     = "iam-portal-run-sa"
}

variable "create_firestore_database" {
  description = "Whether Terraform should create the Firestore database. Set false when the database already exists."
  type        = bool
  default     = false
}

variable "firestore_database_name" {
  description = "Firestore database name to create or reuse. Use (default) for standard Firestore."
  type        = string
  default     = "(default)"
}

variable "create_request_topic" {
  description = "Whether Terraform should create the IAM request Pub/Sub topic. Set false if it already exists."
  type        = bool
  default     = true
}

variable "request_topic_name" {
  description = "Name of the IAM request Pub/Sub topic to create or reuse."
  type        = string
  default     = "iam-request-topic"
}

variable "create_function_source_bucket" {
  description = "Whether Terraform should create the Cloud Functions source bucket. Set false if it already exists."
  type        = bool
  default     = true
}

variable "function_source_bucket_name" {
  description = "Existing or desired Cloud Functions source bucket name. Leave empty to use <project>-function-source."
  type        = string
  default     = ""
}

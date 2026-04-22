variable "project_id" {
  type = string
}

variable "existing_service_account_email" {
  type    = string
  default = ""
}

variable "service_account_id" {
  type    = string
  default = "iam-portal-run-sa"
}

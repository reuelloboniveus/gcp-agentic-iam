variable "project_id" { type = string }
variable "region" { type = string }
variable "service_account_id" { type = string }
variable "request_topic_id" { type = string }
variable "create_function_source_bucket" {
	type    = bool
	default = true
}
variable "function_source_bucket_name" {
	type    = string
	default = ""
}

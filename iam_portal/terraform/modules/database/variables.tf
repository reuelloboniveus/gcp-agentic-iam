variable "project_id" { type = string }
variable "region" { type = string }
variable "admin_email" { type = string }
variable "firestore_database_name" {
	type    = string
	default = "(default)"
}
variable "create_firestore_database" {
	type    = bool
	default = false
}

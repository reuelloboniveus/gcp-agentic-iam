variable "project_id" { type = string }

variable "create_request_topic" {
	type    = bool
	default = true
}

variable "request_topic_name" {
	type    = string
	default = "iam-request-topic"
}

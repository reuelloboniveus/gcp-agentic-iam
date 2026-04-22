resource "google_pubsub_topic" "request_topic" {
  count = var.create_request_topic ? 1 : 0
  name  = var.request_topic_name
}

locals {
  topic_name = var.request_topic_name
  topic_id   = "projects/${var.project_id}/topics/${local.topic_name}"
}

output "topic_id" {
  value = var.create_request_topic ? google_pubsub_topic.request_topic[0].id : local.topic_id
}

output "topic_name" {
  value = local.topic_name
}

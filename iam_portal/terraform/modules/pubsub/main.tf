variable "project_id" { type = string }

resource "google_pubsub_topic" "request_topic" {
  name = "iam-request-topic"
}

output "topic_id" {
  value = google_pubsub_topic.request_topic.id
}

output "topic_name" {
  value = google_pubsub_topic.request_topic.name
}

variable "project_id" { type = string }
variable "region" { type = string }
variable "domain" { type = string }
variable "portal_function_name" { type = string }
variable "iap_admin_email" { type = string }

# --- Serverless NEG ---
resource "google_compute_region_network_endpoint_group" "portal_neg" {
  name                  = "iam-portal-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  cloud_function {
    function = var.portal_function_name
  }
}

# --- Backend Service ---
resource "google_compute_backend_service" "portal_backend" {
  name        = "iam-portal-backend"
  protocol    = "HTTP"
  port_name   = "http"
  timeout_sec = 30

  backend {
    group = google_compute_region_network_endpoint_group.portal_neg.id
  }

  iap {
    enabled              = true
    oauth2_client_id     = google_iap_client.project_client.client_id
    oauth2_client_secret = google_iap_client.project_client.secret
  }
}

# --- IAP Branding & Client ---
resource "google_iap_brand" "project_brand" {
  support_email     = var.iap_admin_email
  application_title = "IAM Portal"
  project           = var.project_id
}

resource "google_iap_client" "project_client" {
  display_name = "IAM Portal Client"
  brand        = google_iap_brand.project_brand.name
}

# --- IAP IAM Policy ---
resource "google_iap_web_backend_service_iam_member" "iap_admin" {
  project = var.project_id
  web_backend_service = google_compute_backend_service.portal_backend.name
  role = "roles/iap.httpsResourceAccessor"
  member = "user:${var.iap_admin_email}"
}

# --- Load Balancer Components ---
resource "google_compute_managed_ssl_certificate" "portal_cert" {
  name = "iam-portal-cert"
  managed {
    domains = [var.domain]
  }
}

resource "google_compute_url_map" "portal_url_map" {
  name            = "iam-portal-url-map"
  default_service = google_compute_backend_service.portal_backend.id
}

resource "google_compute_target_https_proxy" "portal_proxy" {
  name             = "iam-portal-https-proxy"
  url_map          = google_compute_url_map.portal_url_map.id
  ssl_certificates = [google_compute_managed_ssl_certificate.portal_cert.id]
}

resource "google_compute_global_forwarding_rule" "portal_forwarding_rule" {
  name       = "iam-portal-forwarding-rule"
  target     = google_compute_target_https_proxy.portal_proxy.id
  port_range = "443"
  ip_address = google_compute_global_address.portal_ip.address
}

resource "google_compute_global_address" "portal_ip" {
  name = "iam-portal-ip"
}

output "load_balancer_ip" {
  value = google_compute_global_address.portal_ip.address
}

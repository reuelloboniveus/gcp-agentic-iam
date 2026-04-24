# Backend configuration for GCP IAM Portal
# 
# This Terraform configuration is designed for RESOURCE CREATION ONLY
# and does NOT persist state files to version control or remote storage.
#
# State files are stored locally in .terraform/ directory during each apply
# and should NOT be committed to git (already in .gitignore).
#
# Usage:
# 1. Run: terraform init
# 2. Run: terraform plan -out=tfplan
# 3. Run: terraform apply tfplan
# 4. To clean up state after creation: rm -rf .terraform terraform.tfstate*
#
# If you need to re-apply or modify resources, keep the state file.
# If you want one-time creation only, delete state after apply completes.

terraform {
  # Local backend - state stored in .terraform/terraform.tfstate (not committed to git)
  # This is the default backend and does not require explicit configuration
  
  # IMPORTANT: Do NOT configure a cloud backend here if you want state to remain temporary
  # If you add a backend block with remote storage, state will persist
}

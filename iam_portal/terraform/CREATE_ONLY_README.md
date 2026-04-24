# GCP IAM Portal Terraform - Create-Only Mode

## Overview
This Terraform configuration is designed for **resource creation only** and does not persist state files beyond the creation process.

## State Management
- **Local State Only**: State files (`.tfstate`) are stored locally in the `.terraform/` directory
- **Not Committed to Git**: All state files are in `.gitignore` and never committed to version control
- **Temporary by Design**: After successful resource creation, you can safely delete state files with no impact to existing resources

## Usage

### One-Time Resource Creation
```bash
# Initialize Terraform (downloads providers, no persistent state)
terraform init

# Plan resources to be created
terraform plan -out=tfplan

# Create resources
terraform apply tfplan

# Optional: Clean up local state after creation succeeds
rm -rf .terraform terraform.tfstate*
```

### If You Need to Modify or Destroy Resources
Keep the state file (don't delete it) and run:
```bash
terraform plan    # See what will change
terraform apply   # Apply changes
```

## Important Notes

1. **No State = No Tracking**: Once you delete the state file, Terraform cannot track or manage these resources anymore
2. **Manual Management**: After state deletion, resources must be managed manually via GCP Console or gcloud CLI
3. **Idempotent Creation**: The configuration is designed to handle existing resources gracefully:
   - Service account reuse via `existing_service_account_email`
   - Firestore DB skip via `create_firestore_database` flag
   - Pub/Sub topic skip via `create_request_topic` flag
   - Function source bucket reuse via `function_source_bucket_name`

## Configuration Files

- `backend.tf`: Backend configuration (local state, not remote)
- `main.tf`: Root module with API enablement and sub-module orchestration
- `variables.tf`: Input variables (project_id, region, domain, etc.)
- `terraform.tfvars.example`: Example values for all variables
- `modules/`: Sub-modules for IAM, Database, Pub/Sub, Functions, Networking

## Workflow Recommendation

```bash
# Setup
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your project details

# Create resources (one-time)
terraform init
terraform plan -out=tfplan
terraform apply tfplan

# Verify resources created in GCP Console
# Then optionally clean up state
rm -rf .terraform terraform.tfstate*

# Resources remain in GCP and continue functioning
# without Terraform management
```

# GCP IAM Portal Terraform Create-Only Helper Script
#
# This script manages the create-only Terraform workflow:
# 1. Initialize Terraform (local state only)
# 2. Plan resources
# 3. Apply resources
# 4. Optionally clean up state after successful creation
#
# Usage:
#   .\terraform_create_only.ps1 -Apply              # Init + Plan + Apply
#   .\terraform_create_only.ps1 -Apply -Cleanup     # Apply + delete state files
#   .\terraform_create_only.ps1 -Plan               # Plan only
#   .\terraform_create_only.ps1 -Init               # Init only
#   .\terraform_create_only.ps1 -Cleanup            # Delete local state only

param(
    [switch]$Init,
    [switch]$Plan,
    [switch]$Apply,
    [switch]$Cleanup
)

function RunCommand {
    param(
        [string]$Command,
        [string]$Description
    )
    
    Write-Host "`n$('='*60)" -ForegroundColor Cyan
    Write-Host "  $Description" -ForegroundColor Cyan
    Write-Host "$('='*60)" -ForegroundColor Cyan
    
    try {
        Invoke-Expression $Command
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`n✅ $Description succeeded" -ForegroundColor Green
            return $true
        } else {
            Write-Host "`n❌ $Description failed with exit code $LASTEXITCODE" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "`n❌ Error: $_" -ForegroundColor Red
        return $false
    }
}

function CleanupState {
    Write-Host "`n$('='*60)" -ForegroundColor Cyan
    Write-Host "  Cleaning up local state files..." -ForegroundColor Cyan
    Write-Host "$('='*60)" -ForegroundColor Cyan
    
    $stateFiles = @("terraform.tfstate", "terraform.tfstate.backup")
    $dirsToRemove = @(".terraform")
    
    foreach ($file in $stateFiles) {
        if (Test-Path $file) {
            Remove-Item $file -Force
            Write-Host "  ✓ Removed $file" -ForegroundColor Green
        }
    }
    
    foreach ($dir in $dirsToRemove) {
        if (Test-Path $dir) {
            Remove-Item $dir -Recurse -Force
            Write-Host "  ✓ Removed $dir" -ForegroundColor Green
        }
    }
    
    Write-Host "✅ State cleanup complete" -ForegroundColor Green
}

# Default to apply if no action specified
if (-not ($Init -or $Plan -or $Apply -or $Cleanup)) {
    $Apply = $true
}

$terraformDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$originalDir = Get-Location

try {
    Set-Location $terraformDir
    Write-Host "Working directory: $terraformDir" -ForegroundColor Cyan
    
    if ($Init -or $Apply) {
        if (-not (RunCommand "terraform init" "Terraform Init")) {
            exit 1
        }
    }
    
    if ($Plan -or $Apply) {
        if (-not (RunCommand "terraform plan -out=tfplan" "Terraform Plan")) {
            exit 1
        }
    }
    
    if ($Apply) {
        if (-not (RunCommand "terraform apply tfplan" "Terraform Apply")) {
            exit 1
        }
    }
    
    if ($Cleanup) {
        CleanupState
    }
    
    Write-Host "`n$('='*60)" -ForegroundColor Green
    Write-Host "  ✅ Terraform create-only workflow complete!" -ForegroundColor Green
    Write-Host "$('='*60)`n" -ForegroundColor Green
    
    if ($Apply -and -not $Cleanup) {
        Write-Host "💡 Resources created successfully!" -ForegroundColor Yellow
        Write-Host "   To manage these resources later, keep the state files." -ForegroundColor Yellow
        Write-Host "   To stop managing with Terraform, run:" -ForegroundColor Yellow
        Write-Host "   .\terraform_create_only.ps1 -Cleanup`n" -ForegroundColor Yellow
    }
    
} finally {
    Set-Location $originalDir
}

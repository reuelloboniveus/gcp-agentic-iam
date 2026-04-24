#!/usr/bin/env python3
"""
GCP IAM Portal Terraform Create-Only Helper Script

This script manages the create-only Terraform workflow:
1. Initialize Terraform (local state only)
2. Plan resources
3. Apply resources
4. Optionally clean up state after successful creation

Usage:
    python3 terraform_create_only.py --apply              # Init + Plan + Apply
    python3 terraform_create_only.py --apply --cleanup    # Apply + delete state files
    python3 terraform_create_only.py --plan               # Plan only
    python3 terraform_create_only.py --init               # Init only
    python3 terraform_create_only.py --cleanup            # Delete local state only
"""

import os
import sys
import subprocess
import argparse
from pathlib import Path

def run_command(cmd, description):
    """Run a shell command and report status."""
    print(f"\n{'='*60}")
    print(f"  {description}")
    print(f"{'='*60}")
    try:
        result = subprocess.run(cmd, shell=True)
        if result.returncode != 0:
            print(f"\n❌ {description} failed with exit code {result.returncode}")
            return False
        print(f"\n✅ {description} succeeded")
        return True
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def cleanup_state(terraform_dir):
    """Remove local state files."""
    print(f"\n{'='*60}")
    print("  Cleaning up local state files...")
    print(f"{'='*60}")
    
    state_files = [
        "terraform.tfstate",
        "terraform.tfstate.backup",
    ]
    
    dirs_to_remove = [
        ".terraform",
    ]
    
    for f in state_files:
        filepath = os.path.join(terraform_dir, f)
        if os.path.exists(filepath):
            os.remove(filepath)
            print(f"  ✓ Removed {f}")
    
    for d in dirs_to_remove:
        dirpath = os.path.join(terraform_dir, d)
        if os.path.exists(dirpath):
            import shutil
            shutil.rmtree(dirpath)
            print(f"  ✓ Removed {d}")
    
    print("✅ State cleanup complete")

def main():
    parser = argparse.ArgumentParser(
        description="Terraform create-only helper for GCP IAM Portal"
    )
    parser.add_argument(
        "--init",
        action="store_true",
        help="Run terraform init only"
    )
    parser.add_argument(
        "--plan",
        action="store_true",
        help="Run terraform plan only"
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Run init + plan + apply"
    )
    parser.add_argument(
        "--cleanup",
        action="store_true",
        help="Delete local state files after creation"
    )
    
    args = parser.parse_args()
    
    # Default to apply if no action specified
    if not any([args.init, args.plan, args.apply, args.cleanup]):
        args.apply = True
    
    terraform_dir = os.path.dirname(os.path.abspath(__file__))
    original_dir = os.getcwd()
    
    try:
        os.chdir(terraform_dir)
        print(f"Working directory: {terraform_dir}")
        
        if args.init or args.apply:
            if not run_command("terraform init", "Terraform Init"):
                return 1
        
        if args.plan or args.apply:
            if not run_command("terraform plan -out=tfplan", "Terraform Plan"):
                return 1
        
        if args.apply:
            if not run_command("terraform apply tfplan", "Terraform Apply"):
                return 1
        
        if args.cleanup:
            cleanup_state(terraform_dir)
        
        print(f"\n{'='*60}")
        print("  ✅ Terraform create-only workflow complete!")
        print(f"{'='*60}\n")
        
        if args.apply and not args.cleanup:
            print("💡 Resources created successfully!")
            print("   To manage these resources later, keep the state files.")
            print("   To stop managing with Terraform, run:")
            print("   python3 terraform_create_only.py --cleanup\n")
        
        return 0
        
    finally:
        os.chdir(original_dir)

if __name__ == "__main__":
    sys.exit(main())

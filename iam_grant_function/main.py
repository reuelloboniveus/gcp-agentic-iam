import functions_framework
from google.cloud import resourcemanager_v3
from google.cloud import firestore
from datetime import datetime

PROJECT_ID = "prj-int-test-edg-cloudops-23"
DATABASE_ID = "access-requests"
COLLECTION = "iam_requests"

db = firestore.Client(project=PROJECT_ID, database=DATABASE_ID)


def grant_project_iam_access(project_id: str, member: str, role: str):
    """Grant an IAM role to a member on a GCP project."""
    client = resourcemanager_v3.ProjectsClient()
    resource = f"projects/{project_id}"

    if not any(member.startswith(p) for p in ["user:", "serviceAccount:", "group:", "domain:"]):
        member = f"user:{member}"

    policy = client.get_iam_policy(request={"resource": resource})

    binding_found = False
    for binding in policy.bindings:
        if binding.role == role:
            if member not in binding.members:
                binding.members.append(member)
            binding_found = True
            break

    if not binding_found:
        new_binding = policy.bindings.add()
        new_binding.role = role
        new_binding.members.append(member)

    client.set_iam_policy(request={"resource": resource, "policy": policy})
    return {"status": "success", "message": f"Granted {role} to {member} on {project_id}"}


@functions_framework.cloud_event
def on_iam_request_update(cloud_event):
    """Triggered by Firestore document update in iam_requests collection.
    When status is 'approved', grants the IAM role."""

    # cloud_event["subject"] usually looks like: "documents/iam_requests/DOC_ID"
    try:
        subject = cloud_event["subject"]
        doc_id = subject.split("/")[-1]
    except Exception as e:
        print(f"ERROR: Could not parse document ID from subject '{cloud_event.get('subject')}': {e}")
        return

    # Fetch the latest data from Firestore
    doc_ref = db.collection(COLLECTION).document(doc_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        print(f"ERROR: Document {doc_id} not found in Firestore.")
        return

    data = doc.to_dict()
    status = data.get("status", "")
    iam_granted = data.get("iam_granted", False)

    # Only act if status is approved and we haven't granted it yet
    if status != "approved" or iam_granted:
        print(f"Skipping doc {doc_id}: status='{status}', iam_granted={iam_granted}")
        return

    email = data.get("email", "")
    project_id = data.get("project_id", "")
    role = data.get("role", "")

    if not all([email, project_id, role]):
        print(f"ERROR: Missing fields in doc {doc_id}: email={email}, project={project_id}, role={role}")
        return

    if "UNKNOWN" in project_id or "UNKNOWN" in role:
        print(f"ERROR: Cannot grant access with UNKNOWN fields in doc {doc_id}.")
        doc_ref.update({
            "status": "error",
            "error_message": "Cannot grant: project_id or role is UNKNOWN. Edit and re-approve.",
            "updated_at": datetime.utcnow(),
        })
        return

    print(f"Granting {role} to {email} on {project_id} (triggered by doc {doc_id})...")

    try:
        result = grant_project_iam_access(project_id, email, role)
        print(f"SUCCESS: {result}")

        # Update Firestore with grant confirmation
        doc_ref.update({
            "iam_granted": True,
            "grant_message": result["message"],
            "granted_at": datetime.utcnow(),
        })
    except Exception as e:
        print(f"ERROR: Failed to grant IAM access: {e}")
        doc_ref.update({
            "status": "error",
            "error_message": f"IAM grant failed: {str(e)}",
            "updated_at": datetime.utcnow(),
        })

import functions_framework
from google.cloud import firestore
from google.cloud import resourcemanager_v3
from datetime import datetime
import os

# Initialize Firestore
db = firestore.Client(project=os.getenv("GOOGLE_CLOUD_PROJECT"))
COLLECTION_NAME = "iam_requests"

def grant_project_iam_access(project_id: str, member: str, role: str):
    client = resourcemanager_v3.ProjectsClient()
    resource = f"projects/{project_id}"
    
    if not any(member.startswith(p) for p in ["user:", "serviceAccount:", "group:", "domain:"]):
        member = f"user:{member}"

    try:
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
        return {"status": "success", "message": f"Successfully granted {role} to {member} on project {project_id}"}
    except Exception as e:
        print(f"Error granting IAM: {str(e)}")
        return {"status": "error", "message": str(e)}

@functions_framework.cloud_event
def process_iam_grant(cloud_event):
    """Triggered on Firestore document update."""
    # cloud_event.data contains the Firestore event data
    # For Firestore 1st Gen triggers, it's a bit different, but for 2nd Gen:
    data = cloud_event.data
    
    # We only care about approvals
    new_value = data.get("value", {}).get("fields", {})
    old_value = data.get("oldValue", {}).get("fields", {})
    
    status = new_value.get("status", {}).get("stringValue")
    old_status = old_value.get("status", {}).get("stringValue")
    
    if status == "approved" and old_status != "approved":
        project_id = new_value.get("project_id", {}).get("stringValue")
        email = new_value.get("email", {}).get("stringValue")
        role = new_value.get("role", {}).get("stringValue")
        
        # Get request ID from the resource path
        # Format: projects/{project}/databases/{db}/documents/iam_requests/{requestId}
        resource_path = data.get("value", {}).get("name", "")
        request_id = resource_path.split("/")[-1]
        
        print(f"Processing approval for {request_id}: {email} on {project_id}")
        
        result = grant_project_iam_access(project_id, email, role)
        
        # Update Firestore with the result
        doc_ref = db.collection(COLLECTION_NAME).document(request_id)
        if result["status"] == "success":
            doc_ref.update({
                "iam_granted": True,
                "grant_message": result["message"],
                "updated_at": datetime.now()
            })
        else:
            doc_ref.update({
                "iam_granted": False,
                "error_message": result["message"],
                "updated_at": datetime.now()
            })

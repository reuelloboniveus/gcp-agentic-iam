from google.cloud import resourcemanager_v3
from google.iam.v1 import policy_pb2

def grant_project_iam_access(project_id: str, member: str, role: str) -> str:
    """
    Grants a specific IAM role to a member on a Google Cloud project.
    
    Args:
        project_id: The ID of the Google Cloud project.
        member: The member to grant access to (e.g., 'user:email@example.com', 'serviceAccount:sa@project.iam.gserviceaccount.com').
        role: The role to grant (e.g., 'roles/viewer', 'roles/editor', 'roles/storage.admin').
        
    Returns:
        A success message or an error message.
    """
    try:
        client = resourcemanager_v3.ProjectsClient()
        resource = f"projects/{project_id}"
        
        # Get the current policy
        policy = client.get_iam_policy(request={"resource": resource})
        
        # Modify the policy
        binding_found = False
        for binding in policy.bindings:
            if binding.role == role:
                if member not in binding.members:
                    binding.members.append(member)
                binding_found = True
                break
        
        if not binding_found:
            new_binding = policy_pb2.Binding(role=role, members=[member])
            policy.bindings.append(new_binding)
            
        # Set the updated policy
        client.set_iam_policy(request={"resource": resource, "policy": policy})
        
        return f"Successfully granted {role} to {member} on project {project_id}."
    except Exception as e:
        return f"Error granting IAM access: {str(e)}"

def list_project_iam_policy(project_id: str) -> str:
    """
    Lists the current IAM policy bindings for a Google Cloud project.
    
    Args:
        project_id: The ID of the Google Cloud project.
        
    Returns:
        A string representation of the IAM policy bindings.
    """
    try:
        client = resourcemanager_v3.ProjectsClient()
        resource = f"projects/{project_id}"
        policy = client.get_iam_policy(request={"resource": resource})
        
        results = [f"IAM Policy for project: {project_id}"]
        for binding in policy.bindings:
            results.append(f"Role: {binding.role}")
            for member in binding.members:
                results.append(f"  - {member}")
        
        return "\n".join(results)
    except Exception as e:
        return f"Error listing IAM policy: {str(e)}"

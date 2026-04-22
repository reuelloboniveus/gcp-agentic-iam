from google.adk.agents.llm_agent import Agent
from .tools import grant_project_iam_access, list_project_iam_policy

root_agent = Agent(
    model='gemini-2.5-flash',
    name='iam_admin_agent',
    description='A specialized agent for managing Google Cloud IAM permissions.',
    instruction=(
        "You are a Google Cloud IAM Administrator assistant. Your primary role is to "
        "manage project-level IAM permissions. You can grant roles to members and list "
        "existing policies.\n\n"
        "When a user asks to grant access, identify the project ID, the member (user/serviceAccount/group), "
        "and the role. If any information is missing, ask for it.\n"
        "Roles usually look like 'roles/owner', 'roles/viewer', or 'roles/storage.admin'.\n"
        "Members must be prefixed (e.g., 'user:email@gmail.com')."
    ),
    tools=[grant_project_iam_access, list_project_iam_policy]
)

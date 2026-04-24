import base64
import json
import os
import functions_framework
from google.cloud import firestore
from datetime import datetime
from google import genai

# Config
PROJECT_ID = "prj-int-test-edg-cloudops-23"
LOCATION = "us-central1"
DATABASE_ID = os.getenv("FIRESTORE_DATABASE_ID", "iam-access")
COLLECTION = "iam_requests"

# Initialize clients
db = firestore.Client(project=PROJECT_ID, database=DATABASE_ID)
client = genai.Client(vertexai=True, project=PROJECT_ID, location=LOCATION)

PARSE_PROMPT = """You are an IAM request parser. Given a raw access request message, extract the structured fields.

You MUST return ONLY valid JSON with these exact keys:
- "email": the requestor's email address
- "project_id": the GCP project ID they need access to (use the full project ID format like "prj-xxx-xxx")
- "role": the GCP IAM role in "roles/xxx" format (e.g. "roles/editor", "roles/viewer", "roles/cloudsql.admin")

If the project name is informal (e.g. "cloudops project", "the test project"), map it to the closest known project ID: "prj-int-test-edg-cloudops-23".

If the role is described informally (e.g. "read access" -> "roles/viewer", "edit access" -> "roles/editor", "admin access" -> "roles/owner", "storage access" -> "roles/storage.admin", "bigquery access" -> "roles/bigquery.dataEditor"), map it to the correct IAM role.

Raw message:
Email: {email}
Comments: {comments}

Return ONLY the JSON object, no markdown fences, no explanation."""


@functions_framework.cloud_event
def process_iam_request(cloud_event):
    """Triggered by a Pub/Sub message. Parses with Vertex AI and writes to Firestore."""

    # 1. Decode the Pub/Sub message
    raw_data = base64.b64decode(cloud_event.data["message"]["data"]).decode("utf-8")
    print(f"Received raw message: {raw_data}")

    try:
        message = json.loads(raw_data)
    except json.JSONDecodeError:
        print(f"ERROR: Could not parse message as JSON: {raw_data}")
        return

    email = message.get("email", "unknown@unknown.com")
    comments = message.get("comments", "")

    if not comments:
        print("ERROR: No comments provided in message")
        return

    # 2. Use Vertex AI to parse the request
    prompt = PARSE_PROMPT.format(email=email, comments=comments)

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt
        )
        response_text = response.text.strip()
        # Clean potential markdown fences
        if response_text.startswith("```"):
            response_text = response_text.split("\n", 1)[1].rsplit("```", 1)[0].strip()

        parsed = json.loads(response_text)
        print(f"Vertex AI parsed result: {parsed}")
    except Exception as e:
        print(f"ERROR: Vertex AI parsing failed: {e}")  
        # Fallback: store raw data
        parsed = {
            "email": email,
            "project_id": "UNKNOWN - review comments",
            "role": "UNKNOWN - review comments",
        }

    # 3. Write to Firestore
    doc_data = {
        "email": parsed.get("email", email),
        "project_id": parsed.get("project_id", "unknown"),
        "role": parsed.get("role", "unknown"),
        "status": "pending",
        "raw_comments": comments,
        "requested_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }

    _, doc_ref = db.collection(COLLECTION).add(doc_data)
    print(f"SUCCESS: Created Firestore doc {doc_ref.id} -> {doc_data}")

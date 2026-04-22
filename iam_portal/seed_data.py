"""Seed dummy data into the access-requests Firestore database."""
from google.cloud import firestore
from datetime import datetime, timedelta

db = firestore.Client(project="prj-int-test-edg-cloudops-23", database="access-requests")

COLLECTION = "iam_requests"

dummy_requests = [
    {
        "email": "alice.dev@example.com",
        "project_id": "prj-int-test-edg-cloudops-23",
        "role": "roles/viewer",
        "status": "pending",
        "requested_at": datetime.now() - timedelta(hours=2),
        "updated_at": datetime.now() - timedelta(hours=2),
    },
    {
        "email": "bob.ops@example.com",
        "project_id": "prj-int-test-edg-cloudops-23",
        "role": "roles/editor",
        "status": "pending",
        "requested_at": datetime.now() - timedelta(hours=1),
        "updated_at": datetime.now() - timedelta(hours=1),
    },
    {
        "email": "charlie.sre@example.com",
        "project_id": "prj-int-test-edg-cloudops-23",
        "role": "roles/cloudsql.admin",
        "status": "approved",
        "requested_at": datetime.now() - timedelta(days=1),
        "updated_at": datetime.now() - timedelta(hours=12),
    },
    {
        "email": "diana.sec@example.com",
        "project_id": "prj-int-test-edg-cloudops-23",
        "role": "roles/iam.securityAdmin",
        "status": "declined",
        "requested_at": datetime.now() - timedelta(days=2),
        "updated_at": datetime.now() - timedelta(days=1),
    },
    {
        "email": "eve.analyst@example.com",
        "project_id": "prj-int-test-edg-cloudops-23",
        "role": "roles/bigquery.dataViewer",
        "status": "pending",
        "requested_at": datetime.now() - timedelta(minutes=30),
        "updated_at": datetime.now() - timedelta(minutes=30),
    },
]

for req in dummy_requests:
    _, doc_ref = db.collection(COLLECTION).add(req)
    print(f"✅ Added: {req['email']} -> {req['role']} ({req['status']}) [ID: {doc_ref.id}]")

print(f"\n🎉 Seeded {len(dummy_requests)} dummy requests into '{COLLECTION}' collection.")

from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import os
from google.cloud import firestore
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

# Initialize FastAPI
app = FastAPI(title="IAM Operations Portal API")

import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.middleware("http")
async def log_iap_headers(request: Request, call_next):
    # Log important headers for IAP debugging
    iap_email = request.headers.get("X-Goog-Authenticated-User-Email")
    proto = request.headers.get("X-Forwarded-Proto")
    host = request.headers.get("Host")
    
    logger.info(f"Request: {request.method} {request.url.path} | Host: {host} | Proto: {proto} | IAP-Email: {iap_email}")
    
    if proto == "http":
        logger.warning(f"UNSECURE REQUEST RECEIVED: {request.url}")
        
    response = await call_next(request)
    return response

# Initialize Firestore
db = firestore.Client(
    project=os.getenv("GOOGLE_CLOUD_PROJECT", "prj-int-test-edg-cloudops-23"),
    database="access-requests"
)
COLLECTION_NAME = "iam_requests"
USER_ROLES_COLLECTION = "portal_users"

class IAMRequest(BaseModel):
    id: Optional[str] = None
    email: str
    project_id: str
    role: str
    status: str = "pending"
    raw_comments: Optional[str] = None
    iam_granted: Optional[bool] = False
    grant_message: Optional[str] = None
    error_message: Optional[str] = None
    requested_at: Optional[datetime] = None

class PortalUser(BaseModel):
    email: str
    role: str # 'admin' or 'user'
    granted_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

# --- Endpoints ---

@app.get("/api/me")
async def get_me(request: Request):
    # IAP sends the user's email in this header
    # Format: "accounts.google.com:user@example.com"
    email_header = request.headers.get("X-Goog-Authenticated-User-Email")
    
    email = None
    if email_header and ":" in email_header:
        email = email_header.split(":")[1]
    
    # For local development where IAP isn't present, return a dummy user
    # In production, IAP would have already blocked the request if unauthenticated
    if not email:
        email = os.getenv("DEV_USER_EMAIL", "developer@example.com")
        
    # Check role in Firestore
    user_doc = db.collection(USER_ROLES_COLLECTION).document(email).get()
    role = user_doc.to_dict().get("role", "user") if user_doc.exists else "user"
        
    return {
        "email": email,
        "displayName": email.split("@")[0].capitalize(),
        "photoURL": None,
        "role": role
    }

@app.get("/api/requests", response_model=List[IAMRequest])
async def get_requests():
    try:
        docs = db.collection(COLLECTION_NAME).order_by("requested_at", direction=firestore.Query.DESCENDING).stream()
        requests = []
        for doc in docs:
            data = doc.to_dict()
            data["id"] = doc.id
            requests.append(IAMRequest(**data))
        return requests
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/requests", response_model=IAMRequest)
async def create_request(request: IAMRequest):
    request.requested_at = datetime.now()
    request.updated_at = datetime.now()
    request.status = "pending"
    
    try:
        _, doc_ref = db.collection(COLLECTION_NAME).add(request.dict(exclude={"id"}))
        request.id = doc_ref.id
        return request
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/api/requests/{request_id}", response_model=IAMRequest)
async def update_request(request_id: str, request: IAMRequest):
    request.updated_at = datetime.now()
    try:
        db.collection(COLLECTION_NAME).document(request_id).update(request.dict(exclude={"id", "requested_at"}))
        return request
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/requests/{request_id}/approve")
async def approve_request(request_id: str):
    """Updates status to 'approved'. The iam-grant-function Cloud Function
    listens for this Firestore change and handles the actual IAM grant."""
    doc_ref = db.collection(COLLECTION_NAME).document(request_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Request not found")
    
    data = doc.to_dict()
    if data["status"] == "approved":
        return {"message": "Request already approved"}
    
    # Only update Firestore status — the iam-grant-function handles IAM binding
    doc_ref.update({
        "status": "approved",
        "updated_at": datetime.now()
    })
    
    return {"message": "Request approved. IAM grant will be processed by the grant function."}

@app.post("/api/requests/{request_id}/action")
async def handle_action(request_id: str, action: str, request: Request):
    # Verify Admin Role
    email_header = request.headers.get("X-Goog-Authenticated-User-Email")
    email = email_header.split(":")[1] if email_header and ":" in email_header else os.getenv("DEV_USER_EMAIL", "developer@example.com")
    
    user_doc = db.collection(USER_ROLES_COLLECTION).document(email).get()
    if not user_doc.exists or user_doc.to_dict().get("role") != "admin":
        raise HTTPException(status_code=403, detail="Only admins can perform this action")

    doc_ref = db.collection(COLLECTION_NAME).document(request_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Request not found")

@app.post("/api/requests/{request_id}/decline")
async def decline_request(request_id: str):
    doc_ref = db.collection(COLLECTION_NAME).document(request_id)
    doc = doc_ref.get()
    
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Request not found")
    
    doc_ref.update({
        "status": "declined",
        "updated_at": datetime.now()
    })
    
    return {"message": "Request declined."}

# User Management Endpoints
def check_admin(request: Request):
    email_header = request.headers.get("X-Goog-Authenticated-User-Email")
    email = email_header.split(":")[1] if email_header and ":" in email_header else os.getenv("DEV_USER_EMAIL", "developer@example.com")
    
    user_doc = db.collection(USER_ROLES_COLLECTION).document(email).get()
    if not user_doc.exists or user_doc.to_dict().get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return email

@app.get("/api/users", response_model=List[PortalUser])
async def list_users(request: Request):
    check_admin(request)
    users = []
    docs = db.collection(USER_ROLES_COLLECTION).stream()
    for doc in docs:
        users.append(doc.to_dict())
    return users

@app.post("/api/users")
async def upsert_user(user: PortalUser, request: Request):
    check_admin(request)
    db.collection(USER_ROLES_COLLECTION).document(user.email).set({
        "email": user.email,
        "role": user.role
    })
    return {"message": f"User {user.email} updated to {user.role}"}

@app.delete("/api/users/{email}")
async def delete_user(email: str, request: Request):
    check_admin(request)
    # Prevent self-deletion if they are the only admin? (Optional safety)
    db.collection(USER_ROLES_COLLECTION).document(email).delete()
    return {"message": f"User {email} removed from portal access"}

# Serve static files from the frontend build
# Note: In production, frontend/dist will contain the built assets
frontend_path = os.path.join(os.path.dirname(__file__), "../frontend/dist")
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
else:
    @app.get("/")
    async def root():
        return {"message": "API is running. Frontend build not found."}

@app.get("/{full_path:path}")
async def serve_frontend(full_path: str):
    # Avoid returning index.html for missing static assets (prevent loop/JS errors)
    if "." in full_path.split("/")[-1]:
        asset_path = os.path.join(frontend_path, full_path)
        if os.path.exists(asset_path):
            return FileResponse(asset_path)
        # If it's a missing file with an extension, return 404
        raise HTTPException(status_code=404)
        
    # Default to index.html for SPA routing
    index_file = os.path.join(frontend_path, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    
    return {"message": "Frontend assets not found"}

# For local testing
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

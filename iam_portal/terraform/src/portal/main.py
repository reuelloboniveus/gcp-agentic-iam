import functions_framework
from api import app
from fastapi.testclient import TestClient

client = TestClient(app)

@functions_framework.http
def portal(request):
    path = request.path or "/"
    query = request.query_string.decode("utf-8") if request.query_string else ""
    url = f"{path}?{query}" if query else path

    response = client.request(
        method=request.method,
        url=url,
        headers=dict(request.headers),
        content=request.get_data(),
    )

    # Cloud Functions accepts a (body, status, headers) tuple.
    return response.content, response.status_code, dict(response.headers)

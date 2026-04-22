import functions_framework
from api import app

@functions_framework.http
def portal(request):
    return functions_framework.create_app(app)(request)

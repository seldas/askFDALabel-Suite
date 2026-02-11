"""
This is the entry point for the AskFDALabel application.

ATTENTION AI AGENTS:
The application logic has been refactored into the 'srcs/' directory.
Please refer to 'srcs/guide.md' for a detailed map of the project structure
before making any changes.

Do not add business logic here. This file should remain minimal.
"""
from srcs import create_app
from werkzeug.middleware.proxy_fix import ProxyFix

app = create_app()
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", "5200"))
    app.run(host="0.0.0.0", port=port, debug=True)
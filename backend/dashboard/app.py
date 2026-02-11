from srcs import create_app
from werkzeug.middleware.proxy_fix import ProxyFix

app = create_app()
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", "5200"))
    app.run(host="0.0.0.0", port=port, debug=True)
import subprocess
import os
import sys
import signal

def start_servers():
    # SSL Configuration placeholders
    cert_file = "cert.pem"
    key_file = "key.pem"
    
    use_ssl = os.path.exists(cert_file) and os.path.exists(key_file)
    
    # Determine the correct Python executable path based on the operating system
    if os.name == 'nt':  # Windows
        python_exe = os.path.join("venv", "Scripts", "python.exe")
    else:  # Linux or other OS
        python_exe = os.path.join("venv", "bin", "python")

    # Backend command (using python -m uvicorn for portability)
    backend_cmd = [
        python_exe,
        "-m", "uvicorn",
        "backend.main:app",
        "--host", "0.0.0.0",
        "--port", "8843",
        "--reload"
    ]
    
    if use_ssl:
        print("--- [SSL] cert.pem and key.pem found. Enabling HTTPS for Backend ---")
        backend_cmd.extend(["--ssl-keyfile", key_file, "--ssl-certfile", cert_file])
    else:
        print("--- [HTTP] SSL certificates not found. Using standard HTTP for Backend ---")

    # Frontend command
    frontend_cmd = "npm run dev -- --host --port 8842"

    print("Starting Backend API on http://localhost:8843 (or https if SSL enabled)...")
    backend_proc = subprocess.Popen(backend_cmd)

    if use_ssl:
        print("--- [SSL] To enable HTTPS for Frontend, configure server.https in vite.config.ts ---")

    print("Starting Frontend Dev Server on http://localhost:8842...")
    # shell=True is needed for 'npm' on Windows
    frontend_proc = subprocess.Popen(frontend_cmd, shell=True, cwd="frontend")

    try:
        # Keep the script running until interrupted
        backend_proc.wait()
        frontend_proc.wait()
    except KeyboardInterrupt:
        print("Stopping servers...")
        backend_proc.terminate()
        frontend_proc.terminate()
        sys.exit(0)

if __name__ == "__main__":
    start_servers()
import os
import sys

# Add current directory to path so we can import config
sys.path.append(os.getcwd())

try:
    from srcs.config import Config
    print("Configuration loaded.")
    print(f"Host: {Config.FDALABEL_DB_HOST}")
    print(f"Port: {Config.FDALABEL_DB_PORT}")
    print(f"Service: {Config.FDALABEL_DB_SERVICE}")
    print(f"User: {Config.FDALABEL_DB_USER}")
    print(f"Password set? {{'Yes' if Config.FDALABEL_DB_PASSWORD else 'No'}}")
except ImportError as e:
    print(f"Error loading config: {e}")
    sys.exit(1)

try:
    import oracledb
    print("oracledb module imported successfully.")
except ImportError:
    print("Error: oracledb module NOT found. Please run 'pip install oracledb'.")
    sys.exit(1)

def test_connection():
    print("\nAttempting connection...")
    if not Config.FDALABEL_DB_PASSWORD:
        print("Skipping connection test: No password provided in FDALABEL_DB_PASSWORD env var.")
        return

    dsn = f"{Config.FDALABEL_DB_HOST}:{Config.FDALABEL_DB_PORT}/{Config.FDALABEL_DB_SERVICE}"
    try:
        conn = oracledb.connect(
            user=Config.FDALABEL_DB_USER,
            password=Config.FDALABEL_DB_PASSWORD,
            dsn=dsn
        )
        print("✅ Connection SUCCESSFUL!")
        conn.close()
    except Exception as e:
        print(f"❌ Connection FAILED: {e}")

if __name__ == "__main__":
    test_connection()
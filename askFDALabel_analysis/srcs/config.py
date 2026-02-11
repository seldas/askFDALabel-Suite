import os

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-this-in-production')
    OPENFDA_API_KEY = os.getenv('OPENFDA_API_KEY')
    
    # Production Database Configuration
    uri = os.getenv("DATABASE_URL")
    if uri and uri.startswith("postgres://"):
        uri = uri.replace("postgres://", "postgresql://", 1)

    SQLALCHEMY_DATABASE_URI = uri or 'sqlite:///users.db'
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # Paths
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    DATA_DIR = os.path.join(BASE_DIR, 'data')
    UPLOAD_FOLDER = os.path.join(DATA_DIR, 'uploads')
    ANNOTATIONS_FILE = os.path.join(DATA_DIR, 'annotations.json')

    # Internal FDALabel DB Configuration (Oracle)
    # Checking generic names first, then specific names from spec
    FDALABEL_DB_HOST = os.getenv('FDALABEL_DB_HOST') or os.getenv('FDALabel_SERV', 'ncsvmscidevl03.fda.gov')
    FDALABEL_DB_PORT = os.getenv('FDALABEL_DB_PORT') or os.getenv('FDALabel_PORT', '1521')
    FDALABEL_DB_SERVICE = os.getenv('FDALABEL_DB_SERVICE') or os.getenv('FDALabel_APP', 'scidevl3')
    FDALABEL_DB_USER = os.getenv('FDALABEL_DB_USER') or os.getenv('FDALabel_USER', 'lwu')
    FDALABEL_DB_PASSWORD = os.getenv('FDALABEL_DB_PASSWORD') or os.getenv('FDALabel_PSW')


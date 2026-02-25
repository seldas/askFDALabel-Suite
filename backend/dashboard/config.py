import os
from dotenv import load_dotenv
from pathlib import Path

env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'afd-psw-prod')
    SESSION_COOKIE_PATH = '/'

    OPENFDA_API_KEY=os.getenv('OPENFDA_API_KEY','')

    LLM_URL=os.getenv('LLM_URL','')
    LLM_KEY=os.getenv('LLM_KEY','')
    LLM_MODEL=os.getenv('LLM_MODEL','')

    # Gemini Models
    PRIMARY_MODEL_ID = os.getenv('PRIMARY_MODEL_ID', 'gemini-2.5-pro')
    FALLBACK_MODEL_ID = os.getenv('FALLBACK_MODEL_ID', 'gemini-2.0-flash')

    ELSA_API_NAME=os.getenv('ELSA_API_NAME','')
    ELSA_API_KEY=os.getenv('ELSA_API_KEY','')
    ELSA_MODEL_ID=os.getenv('ELSA_MODEL_ID','')
    ELSA_MODEL_NAME=os.getenv('ELSA_MODEL_NAME','')

    # Production Database Configuration
    uri = os.getenv("DATABASE_URL")
    if uri and uri.startswith("postgres://"):
        uri = uri.replace("postgres://", "postgresql://", 1)

    # Paths - Use project root as base
    PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
    DATA_DIR = PROJECT_ROOT / 'data'
    
    SQLALCHEMY_DATABASE_URI = uri or f"sqlite:///{DATA_DIR / 'afd.db'}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'connect_args': {
            'timeout': 30
        }
    }
    
    UPLOAD_FOLDER = os.path.join(DATA_DIR, 'uploads')
    ANNOTATIONS_FILE = os.path.join(DATA_DIR, 'annotations.json')

    # Internal FDALabel DB Configuration (Oracle)
    FDALABEL_DB_HOST = os.getenv('FDALabel_SERV', 'ncsvmscidevl03.fda.gov')
    FDALABEL_DB_PORT = os.getenv('FDALabel_PORT', '1521')
    FDALABEL_DB_SERVICE = os.getenv('FDALabel_APP', 'scidevl3')
    FDALABEL_DB_USER = os.getenv('FDALabel_USER', 'lwu')
    FDALABEL_DB_PASSWORD = os.getenv('FDALabel_PSW')


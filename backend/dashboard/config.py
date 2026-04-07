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
    DATABASE_URL = os.getenv("DATABASE_URL")
    if not DATABASE_URL:
        raise ValueError("DATABASE_URL must be set in .env for PostgreSQL")
    
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

    # Paths - Use project root as base, but check for Docker /data mount
    PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
    
    if os.path.exists('/data'):
        DATA_DIR = Path('/data')
    else:
        DATA_DIR = PROJECT_ROOT / 'data'
    
    SQLALCHEMY_DATABASE_URI = DATABASE_URL
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        'pool_pre_ping': True,
        'pool_recycle': 3600,
    }
    
    UPLOAD_FOLDER = os.path.join(DATA_DIR, 'uploads')
    ANNOTATIONS_FILE = os.path.join(DATA_DIR, 'annotations.json')

    # Internal FDALabel DB Configuration
    # Modes: 'POSTGRES' (Local/Production Postgres), 'ORACLE' (Internal)
    LABEL_DB = os.getenv('LABEL_DB', 'POSTGRES').upper() 
    
    LOCAL_QUERY = os.getenv('LOCAL_QUERY', 'True').lower() == 'true'
    
    # Path/DSN for Labeling DB
    POSTGRES_LABEL_DSN = DATABASE_URL # Shared DB, different schema ('labeling')
    
    SPL_STORAGE_DIR = os.path.join(DATA_DIR, 'spl_storage')
    
    FDALabel_HOST = os.getenv('FDALabel_HOST', 'ncsvmscidevl03.fda.gov')
    FDALabel_PORT = os.getenv('FDALabel_PORT', '1521')
    FDALabel_SERVICE = os.getenv('FDALabel_SERVICE', 'scidevl3')
    FDALabel_USER = os.getenv('FDALabel_USER', 'lwu')
    FDALabel_PASSWORD = os.getenv('FDALabel_PASSWORD')

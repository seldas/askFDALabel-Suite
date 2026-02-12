import os
from dotenv import load_dotenv
from pathlib import Path

env_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(dotenv_path=env_path)

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'afd-psw-prod')

    OPENFDA_API_KEY=os.getenv('OPENFDA_API_KEY','')

    LLM_URL=os.getenv('LLM_URL','')
    LLM_KEY=os.getenv('LLM_KEY','')
    LLM_MODEL=os.getenv('LLM_MODEL','')

    ELSA_API_NAME=os.getenv('ELSA_API_NAME','')
    ELSA_API_KEY=os.getenv('ELSA_API_KEY','')
    ELSA_MODEL_ID=os.getenv('ELSA_MODEL_ID','')
    ELSA_MODEL_NAME=os.getenv('ELSA_MODEL_NAME','')

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


# scripts/search_v2_core/config.py
import os
import oracledb
import psycopg2
from psycopg2.extras import RealDictCursor
from dotenv import load_dotenv
from openai import OpenAI
from pathlib import Path

# Load environment variables from the root .env
root_dir = Path(__file__).resolve().parent.parent.parent.parent.parent
env_path = root_dir / '.env'
load_dotenv(dotenv_path=env_path)

# LLM
openai_api_key = os.getenv("LLM_KEY", "")
openai_api_base = os.getenv("LLM_URL", "")
llm_model_name = os.getenv("LLM_MODEL", "gpt-4o")

_client_kwargs = {"api_key": openai_api_key}
if openai_api_base:
    _client_kwargs["base_url"] = openai_api_base
client = OpenAI(**_client_kwargs)

# DB Config
FDALabel_SERV = os.getenv("FDALabel_SERV")
FDALabel_PORT = os.getenv("FDALabel_PORT")
FDALabel_APP = os.getenv("FDALabel_APP")
FDALabel_USER = os.getenv("FDALabel_USER")
FDALabel_PSW = os.getenv("FDALabel_PSW")

DATABASE_URL = os.getenv("DATABASE_URL")
LABEL_DB_CHOICE = os.getenv("LABEL_DB", "POSTGRES").upper()

def get_db_type():
    if LABEL_DB_CHOICE == "ORACLE" and all([FDALabel_SERV, FDALabel_PORT, FDALabel_APP, FDALabel_PSW]):
        return "oracle"
    return "postgres"

DB_TYPE = get_db_type()

def get_db_connection():
    global DB_TYPE
    
    # 1. Oracle Path
    if LABEL_DB_CHOICE == "ORACLE" and all([FDALabel_SERV, FDALabel_PORT, FDALabel_APP, FDALabel_PSW]):
        try:
            dsnStr = oracledb.makedsn(FDALabel_SERV, FDALabel_PORT, FDALabel_APP)
            conn = oracledb.connect(user=FDALabel_USER, password=FDALabel_PSW, dsn=dsnStr)
            DB_TYPE = "oracle"
            return conn
        except Exception as e:
            print(f"!!! [ERROR] Oracle connection failed: {e}. Falling back to Postgres.")
            
    # 2. Postgres Path (Default/Fallback)
    if DATABASE_URL:
        DB_TYPE = "postgres"
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
        return conn
    
    raise ConnectionError("No database available. Checked Oracle and Postgres (DATABASE_URL).")

# Dialect-specific Table Mappings
if DB_TYPE == "postgres":
    DB_SCHEMA = "labeling"
    PREFIX = f"{DB_SCHEMA}."
    T_DGV_SUM_SPL = f"{PREFIX}sum_spl"
    T_SPL_SEC = f"{PREFIX}spl_sections"
    T_SECTION_TYPE = f"{PREFIX}section_type" 
    T_DOCUMENT_TYPE = f"{PREFIX}document_type"
    T_DGV_SUM_SPL_ACT_INGR = f"{PREFIX}active_ingredients_map"
    T_DGV_SUM_SPL_EPC = f"{PREFIX}epc_map"
    T_SPL_SEC_MEDDRA_LLT_OCC = f"{PREFIX}spl_sec_meddra_llt_occ"
    T_SUM_SPL_RLD = f"{PREFIX}sum_spl" # is_rld column is in sum_spl in Postgres
else:
    DB_SCHEMA = os.getenv("FDALABEL_SCHEMA", "DRUGLABEL")
    PREFIX = f"{DB_SCHEMA}." if DB_SCHEMA else ""
    T_DGV_SUM_SPL = f"{PREFIX}DGV_SUM_SPL"
    T_SPL_SEC = f"{PREFIX}SPL_SEC"
    T_SECTION_TYPE = f"{PREFIX}SECTION_TYPE"
    T_DOCUMENT_TYPE = f"{PREFIX}DOCUMENT_TYPE"
    T_DGV_SUM_SPL_ACT_INGR = f"{PREFIX}DGV_SUM_SPL_ACT_INGR_NAME"
    T_DGV_SUM_SPL_EPC = f"{PREFIX}DGV_SUM_SPL_EPC"
    T_SPL_SEC_MEDDRA_LLT_OCC = f"{PREFIX}SPL_SEC_MEDDRA_LLT_OCC"
    T_SUM_SPL_RLD = f"{PREFIX}SUM_SPL_RLD"

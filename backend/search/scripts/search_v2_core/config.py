# scripts/search_v2_core/config.py
import os
import oracledb
import sqlite3
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

# LLM
openai_api_key = os.getenv("LLM_KEY", "")
openai_api_base = os.getenv("LLM_URL", "")
llm_model_name = os.getenv("LLM_MODEL", "gpt-4")

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

# --- Absolute Path Logic ---
# This file is at: project_root/backend/search/scripts/search_v2_core/config.py
# We want: project_root/data/label.db
CURRENT_FILE_PATH = os.path.abspath(__file__)
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_FILE_PATH, "..", "..", "..", "..", ".."))
DEFAULT_SQLITE_PATH = os.path.join(PROJECT_ROOT, "data", "label.db")

LOCAL_LABEL_DB_PATH = os.getenv("LOCAL_LABEL_DB_PATH", DEFAULT_SQLITE_PATH)
print(f"[DEBUG] Search Agent looking for SQLite at: {LOCAL_LABEL_DB_PATH}")

def get_db_type():
    if all([FDALabel_SERV, FDALabel_PORT, FDALabel_APP, FDALabel_PSW]):
        return "oracle"
    if os.path.exists(LOCAL_LABEL_DB_PATH):
        return "sqlite"
    return "oracle"

DB_TYPE = get_db_type()

def get_db_connection():
    global DB_TYPE
    
    if all([FDALabel_SERV, FDALabel_PORT, FDALabel_APP, FDALabel_PSW]):
        try:
            dsnStr = oracledb.makedsn(FDALabel_SERV, FDALabel_PORT, FDALabel_APP)
            conn = oracledb.connect(user=FDALabel_USER, password=FDALabel_PSW, dsn=dsnStr)
            DB_TYPE = "oracle"
            return conn
        except Exception as e:
            print(f"!!! [FALLBACK] Oracle connection failed: {e}. Switching to SQLite.")
            
    if os.path.exists(LOCAL_LABEL_DB_PATH):
        DB_TYPE = "sqlite"
        return sqlite3.connect(LOCAL_LABEL_DB_PATH)
    
    raise ConnectionError(f"No database available. Checked Oracle and SQLite at: {LOCAL_LABEL_DB_PATH}")

DB_SCHEMA = os.getenv("FDALABEL_SCHEMA", "DRUGLABEL")

# Note: Table constants are managed inside SQLManager for dynamic switching.
T_DGV_SUM_SPL = f"{DB_SCHEMA}.DGV_SUM_SPL"
T_SPL_SEC = f"{DB_SCHEMA}.SPL_SEC"
T_SECTION_TYPE = f"{DB_SCHEMA}.SECTION_TYPE"
T_DOCUMENT_TYPE = f"{DB_SCHEMA}.DOCUMENT_TYPE"
T_DGV_SUM_SPL_ACT_INGR = f"{DB_SCHEMA}.DGV_SUM_SPL_ACT_INGR_NAME"
T_DGV_SUM_SPL_EPC = f"{DB_SCHEMA}.DGV_SUM_SPL_EPC"
T_SPL_SEC_MEDDRA_LLT_OCC = f"{DB_SCHEMA}.SPL_SEC_MEDDRA_LLT_OCC"
T_SUM_SPL_RLD = f"{DB_SCHEMA}.SUM_SPL_RLD"

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

LABEL_DB_CHOICE = os.getenv("LABEL_DB", "LOCAL").upper()

def get_db_type():
    if LABEL_DB_CHOICE == "ORACLE" and all([FDALabel_SERV, FDALabel_PORT, FDALabel_APP, FDALabel_PSW]):
        return "oracle"
    if os.path.exists(LOCAL_LABEL_DB_PATH):
        return "sqlite"
    return "oracle"

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
            print(f"!!! [ERROR] Oracle connection failed: {e}. Falling back to SQLite if available.")
            
    # 2. Local SQLite Path (Default/Fallback)
    if os.path.exists(LOCAL_LABEL_DB_PATH):
        DB_TYPE = "sqlite"
        conn = sqlite3.connect(LOCAL_LABEL_DB_PATH)
        # Ensure row factory for dictionary access
        conn.row_factory = sqlite3.Row
        return conn
    
    raise ConnectionError(f"No database available. Checked Oracle and SQLite at: {LOCAL_LABEL_DB_PATH}")

# For SQLite, we don't use a schema prefix. For Oracle, we default to DRUGLABEL.
if DB_TYPE == "sqlite":
    DB_SCHEMA = ""
else:
    DB_SCHEMA = os.getenv("FDALABEL_SCHEMA", "DRUGLABEL")

if DB_SCHEMA:
    # Ensure it ends with a dot for the f-strings below
    PREFIX = f"{DB_SCHEMA}."
else:
    PREFIX = ""

# Note: Table constants are managed inside SQLManager for dynamic switching.
T_DGV_SUM_SPL = f"{PREFIX}DGV_SUM_SPL"
T_SPL_SEC = f"{PREFIX}SPL_SEC"
T_SECTION_TYPE = f"{PREFIX}SECTION_TYPE"
T_DOCUMENT_TYPE = f"{PREFIX}DOCUMENT_TYPE"
T_DGV_SUM_SPL_ACT_INGR = f"{PREFIX}DGV_SUM_SPL_ACT_INGR_NAME"
T_DGV_SUM_SPL_EPC = f"{PREFIX}DGV_SUM_SPL_EPC"
T_SPL_SEC_MEDDRA_LLT_OCC = f"{PREFIX}SPL_SEC_MEDDRA_LLT_OCC"
T_SUM_SPL_RLD = f"{PREFIX}SUM_SPL_RLD"

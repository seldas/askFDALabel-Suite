# scripts/search_v2_core/config.py
import os
import oracledb
import sqlite3
from dotenv import load_dotenv
from openai import OpenAI

# We can't easily import FDALabelDBService here without potentially causing circular imports
# so we will reimplement a light version of the connection logic or use environment-based detection.

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

# Local SQLite fallback path
LOCAL_LABEL_DB_PATH = os.getenv("LOCAL_LABEL_DB_PATH", "data/label.db")

def get_db_type():
    """Returns 'oracle' or 'sqlite' based on availability and config."""
    # Try Oracle first if config exists
    if FDALabel_SERV and FDALabel_PORT and FDALabel_APP and FDALabel_PSW:
        try:
            # We don't connect here, just check if we *could*
            return "oracle"
        except:
            pass
            
    # Fallback to SQLite if file exists
    if os.path.exists(LOCAL_LABEL_DB_PATH):
        return "sqlite"
    
    return "oracle" # Default to oracle (will fail later if not available)

def get_db_connection():
    db_type = get_db_type()
    if db_type == "oracle":
        dsnStr = oracledb.makedsn(FDALabel_SERV, FDALabel_PORT, FDALabel_APP)
        return oracledb.connect(user=FDALabel_USER, password=FDALabel_PSW, dsn=dsnStr)
    else:
        conn = sqlite3.connect(LOCAL_LABEL_DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn

# Schema/table names
DB_TYPE = get_db_type()
DB_SCHEMA = os.getenv("FDALABEL_SCHEMA", "DRUGLABEL")

if DB_TYPE == "oracle":
    T_DGV_SUM_SPL = f"{DB_SCHEMA}.DGV_SUM_SPL"
    T_SPL_SEC = f"{DB_SCHEMA}.SPL_SEC"
    T_SECTION_TYPE = f"{DB_SCHEMA}.SECTION_TYPE"
    T_DOCUMENT_TYPE = f"{DB_SCHEMA}.DOCUMENT_TYPE"
    T_DGV_SUM_SPL_ACT_INGR = f"{DB_SCHEMA}.DGV_SUM_SPL_ACT_INGR_NAME"
    T_DGV_SUM_SPL_EPC = f"{DB_SCHEMA}.DGV_SUM_SPL_EPC"
    T_SPL_SEC_MEDDRA_LLT_OCC = f"{DB_SCHEMA}.SPL_SEC_MEDDRA_LLT_OCC"
    T_SUM_SPL_RLD = f"{DB_SCHEMA}.SUM_SPL_RLD"
else:
    # SQLite table names (no schema prefix needed)
    T_DGV_SUM_SPL = "sum_spl"
    T_SPL_SEC = "spl_sections"
    T_SECTION_TYPE = "section_type" # Note: we might need to create this if used
    T_DOCUMENT_TYPE = "document_type"
    T_DGV_SUM_SPL_ACT_INGR = "active_ingredients_map"
    T_DGV_SUM_SPL_EPC = "epc_map"
    T_SPL_SEC_MEDDRA_LLT_OCC = "meddra_occ"
    T_SUM_SPL_RLD = "sum_spl" # is_rld is a column in sum_spl for SQLite

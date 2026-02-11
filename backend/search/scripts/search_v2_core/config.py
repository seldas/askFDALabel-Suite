# scripts/search_v2_core/config.py
import os
import oracledb
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

# DB
FDALabel_SERV = os.getenv("FDALabel_SERV")
FDALabel_PORT = os.getenv("FDALabel_PORT")
FDALabel_APP = os.getenv("FDALabel_APP")
FDALabel_USER = os.getenv("FDALabel_USER")
FDALabel_PSW = os.getenv("FDALabel_PSW")

dsnStr = oracledb.makedsn(FDALabel_SERV, FDALabel_PORT, FDALabel_APP)

def get_db_connection() -> oracledb.Connection:
    return oracledb.connect(user=FDALabel_USER, password=FDALabel_PSW, dsn=dsnStr)

# Schema/table names
DB_SCHEMA = os.getenv("FDALABEL_SCHEMA", "DRUGLABEL")

T_DGV_SUM_SPL = f"{DB_SCHEMA}.DGV_SUM_SPL"
T_SPL_SEC = f"{DB_SCHEMA}.SPL_SEC"
T_SECTION_TYPE = f"{DB_SCHEMA}.SECTION_TYPE"
T_DOCUMENT_TYPE = f"{DB_SCHEMA}.DOCUMENT_TYPE"
T_DGV_SUM_SPL_ACT_INGR = f"{DB_SCHEMA}.DGV_SUM_SPL_ACT_INGR_NAME"
T_DGV_SUM_SPL_EPC = f"{DB_SCHEMA}.DGV_SUM_SPL_EPC"
T_SPL_SEC_MEDDRA_LLT_OCC = f"{DB_SCHEMA}.SPL_SEC_MEDDRA_LLT_OCC"

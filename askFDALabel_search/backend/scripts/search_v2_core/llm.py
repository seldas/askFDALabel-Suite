# scripts/search_v2_core/llm.py
try:
    from call_llm import safe_llm_call
except ImportError:
    from backend.call_llm import safe_llm_call  # type: ignore

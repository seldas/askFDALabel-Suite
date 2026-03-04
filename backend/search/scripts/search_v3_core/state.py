# scripts/search_v3_core/state.py
import datetime
import uuid
from typing import Any, Dict


class AgentState:
    """
    Keep the SAME public fields as V2 so search_v3 can replace search_v2 seamlessly.
    Add extra V3-only keys inside existing dicts (e.g., retrieval["plan"]["v3"]) if needed.
    """

    def __init__(self, payload: Dict[str, Any], user=None):
        self.user = user
        self.meta = {
            "session_id": str(uuid.uuid4()),
            "created_at": datetime.datetime.now().isoformat(),
        }
        self.conversation = {
            "user_query": payload.get("query", ""),
            "history": payload.get("chat_history", []) or [],
        }

        # Keep schema identical
        self.intent = {}
        self.retrieval = {
            "plan": {},
            "results": [],
            "generated_sql": "",  # kept for compatibility; normally unused in v3
        }
        self.evidence = {"snippets": []}
        self.answer = {"response_text": "", "is_final": False}
        self.reasoning = ""
        self.agent_flow = []
        self.trace_log = []

        self.flags = {
            "next_step": "planner",
            "terminate": False,
        }

        # Optional: stash raw payload config for V3 (no breaking changes)
        self.config = {
            # retrieval knobs (safe defaults)
            "top_k": int(payload.get("top_k", 50) or 50),
            "rerank_k": int(payload.get("rerank_k", 10) or 10),
            "min_score": float(payload.get("min_score", 0.0) or 0.0),
            # you can add collection, label_version, product filters, etc.
        }

    def to_dict(self):
        return self.__dict__
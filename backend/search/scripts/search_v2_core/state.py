# scripts/search_v2_core/state.py
import datetime
import uuid
from typing import Any, Dict

class AgentState:
    def __init__(self, payload: Dict[str, Any]):
        self.meta = {
            "session_id": str(uuid.uuid4()),
            "created_at": datetime.datetime.now().isoformat()
        }
        self.conversation = {
            "user_query": payload.get("query", ""),
            "history": payload.get("chat_history", []) or []
        }
        self.intent = {}
        self.retrieval = {
            "plan": {},
            "results": [],
            "generated_sql": ""
        }
        self.evidence = {
            "snippets": []
        }
        self.answer = {
            "response_text": "",
            "is_final": False
        }
        self.reasoning = ""
        self.agent_flow = []
        self.trace_log = []
        self.flags = {
            "next_step": "planner",
            "terminate": False
        }

    def to_dict(self):
        return self.__dict__

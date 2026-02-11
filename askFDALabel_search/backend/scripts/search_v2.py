# scripts/search_v2.py
import os
import sys
from typing import Any, Dict, Tuple

# Keep your original sys.path behavior so backend.* imports work in submodules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from scripts.search_v2_core.log import logger
from scripts.search_v2_core.state import AgentState
from scripts.search_v2_core.controller import run_controller
from scripts.search_v2_core.helpers import convert_oracle_to_filtered_results, build_debug_stats
def search_v2(payload: Dict[str, Any]) -> Tuple[Dict[str, Any], int]:
    """
    Entry point for the V2 Search API.
    """
    try:
        state = AgentState(payload)
        run_controller(state)

        debug_stats = build_debug_stats(state)

        raw_results = state.retrieval.get("results", [])
        processed_results_dict = convert_oracle_to_filtered_results(raw_results)
        final_results = list(processed_results_dict.values())

        response = {
            "med_answer": state.answer["response_text"],
            "debug_intent": state.intent,
            "results": final_results,
            "is_answerable": True,
            "input_type": "T1",
            "generated_sql": state.retrieval.get("generated_sql", ""),
            "total_counts": len(final_results),
            "suggestions": [],
            "agent_flow": state.agent_flow,
            "reasoning": state.reasoning,
            "debug_plan": state.retrieval.get("plan", {}),
            "debug_stats": debug_stats,
            "trace_log": state.trace_log,  # optional, can remove later if you add events
        }
        return response, 200

    except Exception as e:
        logger.error(f"Critical error in search_v2: {e}")
        return {"error": str(e)}, 500


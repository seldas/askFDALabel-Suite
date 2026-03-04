# scripts/search_v3.py
import os
import sys
from typing import Any, Dict, Tuple

# Keep your original sys.path behavior so backend.* imports work in submodules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from search.scripts.search_v3_core.log import logger
from search.scripts.search_v3_core.state import AgentState
from search.scripts.search_v3_core.controller import run_controller
from search.scripts.search_v3_core.helpers import (
    convert_oracle_to_filtered_results,
    build_debug_stats,
)


def search_v3(payload: Dict[str, Any], user=None) -> Tuple[Dict[str, Any], int]:
    """
    Entry point for the V3 Search API.

    V3 design:
      - Keep the V2 schema/contract identical (state fields + response keys)
      - Replace retrieval core with: semantic retrieval -> LLM rerank -> grounded answer
    """
    try:
        state = AgentState(payload, user=user)
        run_controller(state)

        debug_stats = build_debug_stats(state)

        raw_results = state.retrieval.get("results", [])
        processed_results_dict = convert_oracle_to_filtered_results(raw_results)
        final_results = list(processed_results_dict.values())

        response = {
            "med_answer": state.answer.get("response_text", ""),
            "debug_intent": state.intent,
            "results": final_results,
            "is_answerable": True,  # keep behavior same as v2; you can refine later
            "input_type": "T1",
            "generated_sql": state.retrieval.get("generated_sql", ""),  # usually empty in v3
            "total_counts": len(final_results),
            "suggestions": [],
            "agent_flow": state.agent_flow,
            "reasoning": state.reasoning,
            "debug_plan": state.retrieval.get("plan", {}),
            "debug_stats": debug_stats,
            "trace_log": state.trace_log,
        }
        return response, 200

    except Exception as e:
        logger.error(f"Critical error in search_v3: {e}", exc_info=True)
        return {"error": str(e)}, 500
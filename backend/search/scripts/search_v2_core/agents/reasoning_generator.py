# scripts/search_v2_core/agents/reasoning_generator.py
from ..log import logger
from ..llm import safe_llm_call
from ..config import client
from ..helpers import build_debug_stats

import json

try:
    from search.scripts.prompt_search_v2 import REASONING_PROMPT
except ImportError:
    from prompt_search_v2 import REASONING_PROMPT

def run_reasoning_generator(state):
    logger.info("--- Running Reasoning Generator ---")

    trace_str = "\n".join([str(t) for t in state.trace_log])

    execution_summary = build_debug_stats(state)  # use helper above
    execution_json = json.dumps(execution_summary, indent=2)

    prompt = (
        REASONING_PROMPT
        .replace("{user_query}", state.conversation["user_query"])
        .replace("{trace_log}", trace_str)
        .replace("{execution_summary}", execution_json)
    )

    messages = [{"role": "system", "content": prompt}]
    success, response_text = safe_llm_call(client, messages, temperature=0.3, user=state.user)

    state.reasoning = response_text if success else "Performed search actions."
    state.flags["terminate"] = True


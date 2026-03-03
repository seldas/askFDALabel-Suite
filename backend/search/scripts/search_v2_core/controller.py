# scripts/search_v2_core/controller.py
from .log import logger

from .agents.planner import run_planner
from .agents.db_executor import run_db_executor
from .agents.postprocess import run_postprocess
from .agents.evidence_fetcher import run_evidence_fetcher
from .agents.aggregate_executor import run_aggregate_executor
from .agents.answer_composer import run_answer_composer
from .agents.reasoning_generator import run_reasoning_generator


def run_controller(state, stop_before=None):
    while True:
        if state.flags.get("terminate"):
            break

        current_step = state.flags.get("next_step")

        # [OK] stop before running a step (so answer happens outside)
        if stop_before and current_step == stop_before:
            return

        if current_step is None or current_step == "end":
            break
        
        if current_step == "planner":
            run_planner(state)
        elif current_step == "db_executor":
            run_db_executor(state)
        elif current_step == "postprocess":
            run_postprocess(state)
        elif current_step == "evidence_fetcher":
            run_evidence_fetcher(state)
        elif current_step == "aggregate_executor":
            run_aggregate_executor(state)
        elif current_step == "answer_composer":
            run_answer_composer(state)
        elif current_step == "reasoning_generator":
            run_reasoning_generator(state)
        elif current_step == "error":
            state.answer["response_text"] = "An internal error occurred during the search process."
            state.flags["terminate"] = True
            break
        else:
            logger.error(f"Unknown step: {current_step}")
            state.flags["terminate"] = True
            break

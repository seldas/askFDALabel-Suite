# scripts/semantic_core/controller.py
from .log import logger

from .agents.planner import run_planner
from .agents.semantic_retriever import run_semantic_retriever
from .agents.keyword_retriever import run_keyword_retriever
from .agents.reranker import run_reranker
from .agents.postprocess import run_postprocess
from .agents.evidence_fetcher import run_evidence_fetcher
from .agents.answer_composer import run_answer_composer
from .agents.reasoning_generator import run_reasoning_generator


def run_controller(state, stop_before=None):
    while True:
        if state.flags.get("terminate"):
            break

        current_step = state.flags.get("next_step")

        # stop before running a step (optional parity behavior)
        if stop_before and current_step == stop_before:
            return

        if current_step is None or current_step == "end":
            break

        try:
            if current_step == "planner":
                run_planner(state)

            elif current_step == "keyword_retriever":
                run_keyword_retriever(state)

            elif current_step == "semantic_retriever":
                run_semantic_retriever(state)

            elif current_step == "reranker":
                run_reranker(state)

            elif current_step == "postprocess":
                run_postprocess(state)

            elif current_step == "evidence_fetcher":
                run_evidence_fetcher(state)

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

        except Exception as e:
            logger.error(f"Step failed ({current_step}): {e}", exc_info=True)
            state.flags["next_step"] = "error"

# scripts/search_v3_core/agents/answer_composer.py
def run_answer_composer(state):
    """
    Grounded answer generation:
      - Use your SOTA GenAI model with ONLY the retrieved snippets.
      - Produce response_text with citations/section references if your UI supports it.
    """
    state.agent_flow.append("answer_composer")

    query = state.conversation.get("user_query", "")
    snippets = state.evidence.get("snippets", [])

    # TODO: call your GenAI model:
    # - system: "Answer ONLY from provided label excerpts. If missing, say not found."
    # - user: query + formatted snippets
    #
    # Placeholder response:
    if not snippets:
        state.answer["response_text"] = (
            "I couldn’t find relevant label excerpts for your question in the current retrieval results. "
            "Try rephrasing or provide a specific product name."
        )
    else:
        state.answer["response_text"] = (
            "Here are the most relevant label excerpts I found. "
            "I can summarize them into a final answer once reranking + grounding are enabled."
        )

    state.answer["is_final"] = True
    state.flags["next_step"] = "reasoning_generator"
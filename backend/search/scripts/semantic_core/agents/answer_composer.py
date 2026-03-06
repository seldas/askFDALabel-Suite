# scripts/search_v3_core/agents/answer_composer.py
from dashboard.services.ai_handler import call_llm

ANSWER_COMPOSER_PROMPT = """
You are a highly specialized FDA AI Assistant. Your task is to provide an accurate, grounded answer to the user's question based ONLY on the provided drug labeling excerpts.

**Ground Rules:**
1.  **Strict Grounding:** Use only the provided excerpts. If the information is not there, state "The provided label documents do not contain information to answer this question."
2.  **Citations:** You MUST cite the drug name and section for every claim (e.g., "[Aspirin, Section 5.1]").
3.  **Conciseness:** Be direct. Avoid preambles.
4.  **Format:** Use clear paragraphs.

**Label Excerpts:**
{snippets_text}

**User Question:**
{query}
"""

def run_answer_composer(state):
    """
    Grounded answer generation using an LLM.
    Handles standard QA, Out-of-Scope refusals, and Clarifications.
    """
    state.agent_flow.append("answer_composer")
    intent_type = state.intent.get("intent")

    # 1. Handle Out of Scope
    if intent_type == "OUT_OF_SCOPE":
        state.answer["response_text"] = (
            "I am a specialized FDA Drug Labeling assistant. I can only answer questions related to "
            "medication labeling, clinical data, and regulatory information. How can I help you with a drug-related query?"
        )
        state.answer["is_final"] = True
        state.flags["next_step"] = "reasoning_generator"
        return

    # 2. Handle Clarification
    if intent_type == "CLARIFICATION":
        state.answer["response_text"] = state.intent.get(
            "clarification_question", 
            "Could you please provide more details or the name of the drug you are asking about?"
        )
        state.answer["is_final"] = True
        state.flags["next_step"] = "reasoning_generator"
        return

    # 3. Standard RAG Answering
    query = state.conversation.get("user_query", "")
    snippets = state.evidence.get("snippets", [])

    if not snippets:
        state.answer["response_text"] = (
            "I couldn’t find relevant label excerpts for your question in the current retrieval results. "
            "Please try rephrasing your search or specifying a different product."
        )
        state.answer["is_final"] = True
        state.flags["next_step"] = "reasoning_generator"
        return

    # Prepare excerpts text
    snippets_text = ""
    for i, s in enumerate(snippets):
        snippets_text += f"--- Excerpt {i+1} ---\nDrug: {s['drug_name']}\nSection: {s['section']}\nText: {s['snippet']}\n\n"

    system_prompt = ANSWER_COMPOSER_PROMPT.format(snippets_text=snippets_text, query=query)
    
    try:
        response_text = call_llm(
            user=state.user,
            system_prompt=system_prompt,
            user_message="Please generate the grounded answer based on the label excerpts.",
            temperature=0.1
        )
        state.answer["response_text"] = response_text
        state.trace_log.append("AnswerComposer: Generated grounded answer.")
    except Exception as e:
        state.trace_log.append(f"AnswerComposer error: {str(e)}")
        state.answer["response_text"] = "Error generating answer. Please try again later."

    state.answer["is_final"] = True
    state.flags["next_step"] = "reasoning_generator"
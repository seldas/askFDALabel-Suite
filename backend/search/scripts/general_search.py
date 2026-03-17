from dashboard.services.ai_handler import call_llm
from typing import Optional, Any

# Fixed system prompt to guide the LLM
SYSTEM_PROMPT = """
You are a highly specialized FDA drug labeling assistant.
Restrict your responses to topics related to labeling analysis or study only.
If the user's query is out of scope, return 'out-of-scope'.
"""

def search_general(user_input: str, user: Optional[Any] = None) -> str:
    try:
        response_text = call_llm(
            user=user,
            system_prompt=SYSTEM_PROMPT,
            user_message=user_input,
            temperature=0.0
        )
        return response_text
    except Exception as e:
        return f"Error generating answer: {str(e)}"

# Example usage
if __name__ == "__main__":
    user_input = "What are the common adverse reactions for Drug X?"
    print(search_general(user_input))


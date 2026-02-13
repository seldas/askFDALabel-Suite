from dashboard.services.ai_handler import call_llm as unified_call_llm
import logging

logger = logging.getLogger(__name__)

def safe_llm_call(client, messages, max_tokens=10000, temperature=0.01, user=None):
    """
    Adapter for unified_call_llm to fit search app's safe_llm_call signature.
    """
    system_prompt = ""
    user_message = ""
    history = []

    if messages:
        if messages[0]['role'] == 'system':
            system_prompt = messages[0]['content']
            remaining = messages[1:]
        else:
            remaining = messages
        
        if remaining:
            user_message = remaining[-1]['content']
            if len(remaining) > 1:
                history = remaining[:-1]

    try:
        response = unified_call_llm(
            user=user,
            system_prompt=system_prompt,
            user_message=user_message,
            history=history,
            max_tokens=max_tokens,
            temperature=temperature
        )
        return True, response
    except Exception as e:
        logger.error(f"safe_llm_call error: {e}")
        return False, str(e)

def call_llm(input_text, prompt='Help answer the following requests.', max_token=10000, user=None):
    try:
        response = unified_call_llm(
            user=user,
            system_prompt=prompt,
            user_message=input_text,
            max_tokens=max_token,
            temperature=0.001
        )
        return response
    except Exception as e:
        logger.error(f"call_llm error: {e}")
        return f"Error: {str(e)}"

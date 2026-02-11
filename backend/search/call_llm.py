### using HPC LLM API
import re
from openai import OpenAI
import os
from dotenv import load_dotenv
import time
import logging

load_dotenv()
openai_api_key = os.getenv('LLM_KEY', '')
openai_api_base = os.getenv('LLM_URL', '')
llm_model_name = os.getenv('LLM_MODEL', "")

client = OpenAI(
    api_key=openai_api_key,
    base_url=openai_api_base,
)

def safe_llm_call(client, messages, max_tokens=10000, temperature=0.01, max_retries=3, retry_delay=2):
    """
    Safely call the LLM API with timeout and error handling

    Args:
        client: The LLM client
        messages: Messages to send to the API
        max_tokens: Maximum tokens for response
        temperature: Temperature setting
        max_retries: Maximum number of retry attempts
        retry_delay: Delay between retries in seconds

    Returns:
        Tuple[bool, str]: (success, content)
        - success: True if call succeeded, False if failed
        - content: Response content if successful, fallback message if failed
    """

    if not client.api_key:
        return False, 'LLM service not configured.'

    for attempt in range(max_retries + 1):
        try:
            response = client.chat.completions.create(
                model=llm_model_name,
                messages=messages,
                max_tokens=max_tokens,
                temperature=temperature,
                timeout=30  # Set explicit timeout
            )

            content = response.choices[0].message.content
            if content:
                return True, content.strip()
            else:
                logging.warning(f"Empty response from LLM on attempt {attempt + 1}")

        except Exception as e:
            error_msg = str(e).lower()

            # Check for specific error types
            if "504" in error_msg or "timeout" in error_msg or "gateway timeout" in error_msg:
                logging.warning(f"Timeout error on attempt {attempt + 1}: {e}")
            elif "503" in error_msg or "service unavailable" in error_msg:
                logging.warning(f"Service unavailable on attempt {attempt + 1}: {e}")
            elif "429" in error_msg or "rate limit" in error_msg:
                logging.warning(f"Rate limit error on attempt {attempt + 1}: {e}")
                # Longer delay for rate limits
                time.sleep(retry_delay * 2)
            else:
                logging.error(f"Unexpected error on attempt {attempt + 1}: {e}")

            # If this isn't the last attempt, wait and retry
            if attempt < max_retries:
                time.sleep(retry_delay)
                retry_delay *= 1.5  # Exponential backoff
            else:
                logging.error(f"All {max_retries + 1} attempts failed for LLM call")

    # Return failure with fallback message
    return False, "Unable to process request due to service timeout. Please try again."


def call_llm(input_text, prompt='Help answer the following requests.', max_token=10000):
    # print(input_text)
    if not input_text:
        return 'No input!'

    messages=[
            {"role": "system", "content": prompt},
    ]
    messages = messages + [{"role": "user", "content": input_text}]

    chat_response = client.chat.completions.create(
        model=llm_model_name,
        messages = messages,
        max_tokens=max_token,
        temperature=0.001
    )

    answer = chat_response.choices[0].message.content
    return answer
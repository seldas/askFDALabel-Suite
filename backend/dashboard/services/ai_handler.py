from google import genai
from google.genai import types
from openai import OpenAI
import requests
from urllib.parse import quote_plus
import json
import logging
import os
import urllib3
from dashboard.prompts import SEARCH_HELPER_PROMPT
from dashboard.services.fdalabel_db import FDALabelDBService

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
logger = logging.getLogger(__name__)

class AIClientFactory:
    _clients = {} # Cache for clients: (provider, api_key) -> client

    @staticmethod
    def get_client(user=None):
        """
        Returns the appropriate client and model based on user preferences.
        Caches clients to avoid 'client closed' errors during streaming.
        """
        default_gemini_key = os.getenv("GOOGLE_API_KEY") 
        
        # User specific or external defaults
        provider = "gemini" # Default
        if user and user.is_authenticated:
            provider = user.ai_provider or "gemini"
        
        # Determine if we are in an "Internal" environment (FDA/Oracle)
        # or a "Local" environment (SQLite)
        is_internal_env = FDALabelDBService.is_internal()
        
        # Determine if we SHOULD use llama (internal LLM)
        # 1. If explicitly requested by user
        # 2. If in an internal environment and no user/provider specified, we might want llama
        use_llama = (provider == "llama")
        
        # Special logic for internal environment defaults:
        # If internal and no provider specified, we default to llama if configured
        if is_internal_env and (not user or not user.is_authenticated) and os.getenv("LLM_URL"):
            provider = "llama"
            use_llama = True
        
        # If llama requested/defaulted, but not configured, fallback to gemini
        if use_llama and not os.getenv("LLM_URL"):
            if provider == "llama": # Only log if it was an explicit choice
                logger.warning("Llama requested but LLM_URL not set. Falling back to Gemini.")
            provider = "gemini"
            use_llama = False

        if use_llama:
             api_key = os.getenv("LLM_KEY", "")
             base_url = os.getenv("LLM_URL", "")
             model = os.getenv("LLM_MODEL", "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8")
             
             cache_key = (provider, api_key, base_url)
             if cache_key not in AIClientFactory._clients:
                 AIClientFactory._clients[cache_key] = OpenAI(api_key=api_key, base_url=base_url, timeout=30.0)
             return "llama", AIClientFactory._clients[cache_key], model

        if provider == 'elsa':
            # Elsa is ALWAYS internal
            elsa_config = {
                'username': os.getenv("ELSA_API_NAME"),
                'password': os.getenv("ELSA_API_KEY"),
                'base_url': "https://elsa-dev.preprod.fda.gov/Monolith/api/engine/runPixel",
                'model_engine_id': os.getenv("ELSA_MODEL_ID"),
            }
            return "elsa", elsa_config, os.getenv("ELSA_MODEL_ID")
        
        # Default: Gemini
        if (provider, default_gemini_key) not in AIClientFactory._clients:
            AIClientFactory._clients[(provider, default_gemini_key)] = genai.Client(api_key=default_gemini_key)
        return "gemini", AIClientFactory._clients[(provider, default_gemini_key)], os.getenv("PRIMARY_MODEL_ID", "gemini-2.5-flash")
        
def call_llm(user, system_prompt, user_message, history=None, model_override=None, **kwargs):
    provider, client, model = AIClientFactory.get_client(user)
    if model_override:
        model = model_override

    temperature = kwargs.get("temperature", 0.1)
    max_tokens = kwargs.get("max_tokens", 20000)
    top_p = kwargs.get("top_p", 0.95)

    if provider == "llama":
        messages = []
        supports_system = kwargs.get("supports_system", True)
        if system_prompt:
            if supports_system: messages.append({"role": "system", "content": system_prompt})
            else: user_message = f"SYSTEM INSTRUCTIONS:\n{system_prompt}\n\nUSER MESSAGE:\n{user_message}"
        if history:
            for turn in history: messages.append({"role": turn.get('role', 'user'), "content": turn.get('content', '')})
        messages.append({"role": "user", "content": user_message})

        try:
            vllm_extras = {"repetition_penalty": kwargs.get("repetition_penalty", 1.1), "top_k": kwargs.get("top_k", 50)}
            response = client.chat.completions.create(
                model=model, messages=messages, temperature=temperature, 
                max_tokens=max_tokens, top_p=top_p, extra_body=vllm_extras, 
                stream=kwargs.get("stream", False)
            )
            if kwargs.get("stream", False): return response
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"LLM error (llama): {e}. Attempting fallback to Gemini.")
            # FALLBACK TO GEMINI
            try:
                # Re-fetch client specifically for gemini
                gemini_key = os.getenv("GOOGLE_API_KEY")
                if ("gemini", gemini_key) not in AIClientFactory._clients:
                    AIClientFactory._clients[("gemini", gemini_key)] = genai.Client(api_key=gemini_key)
                
                fallback_client = AIClientFactory._clients[("gemini", gemini_key)]
                fallback_model = os.getenv("PRIMARY_MODEL_ID", "gemini-2.5-flash")
                
                config = types.GenerateContentConfig(
                    temperature=temperature, top_p=top_p, max_output_tokens=max_tokens,
                    system_instruction=system_prompt if system_prompt else None
                )
                contents = []
                if history:
                    for turn in history:
                        role = "model" if turn.get('role') in ['assistant', 'ai'] else "user"
                        contents.append(types.Content(role=role, parts=[types.Part.from_text(text=turn.get('content', ''))]))
                contents.append(types.Content(role="user", parts=[types.Part.from_text(text=user_message)]))
                
                resp = fallback_client.models.generate_content(model=fallback_model, contents=contents, config=config)
                return resp.text
            except Exception as fallback_err:
                logger.error(f"Fallback to Gemini also failed: {fallback_err}")
                raise e

    elif provider == "elsa":
        full_prompt = f"SYSTEM INSTRUCTIONS:\n{system_prompt}\n\n" if system_prompt else ""
        if history:
            full_prompt += "CONVERSATION HISTORY:\n"
            for turn in history: full_prompt += f"{turn.get('role', 'user').upper()}: {turn.get('content', '')}\n"
            full_prompt += "\n"
        full_prompt += f"USER: {user_message}"

        try:
            command = f'''LLM(engine = "{model}", command = "<encode>{full_prompt}</encode>", paramValues = [{{"max_completion_tokens": {max_tokens}, "temperature": {temperature}}}])'''
            response = requests.post(client['base_url'], headers={"Content-Type": "application/x-www-form-urlencoded"}, data=f'expression={quote_plus(command)}', auth=(client['username'], client['password']), verify=False)
            if response.status_code == 200:
                result = json.loads(response.text)
                return result['pixelReturn'][0]['output']['response']
            else:
                raise Exception(f"Elsa API error: Status {response.status_code}")
        except Exception as e:
            logger.error(f"Elsa error: {e}"); raise e

    elif provider == "gemini":
        config = types.GenerateContentConfig(
            temperature=temperature, top_p=top_p, max_output_tokens=max_tokens,
            system_instruction=system_prompt if system_prompt else None,
            safety_settings=[types.SafetySetting(category="HARM_CATEGORY_HARASSMENT", threshold="BLOCK_ONLY_HIGH")]
        )
        contents = []
        if history:
            for turn in history:
                role = "model" if turn.get('role') in ['assistant', 'ai'] else "user"
                contents.append(types.Content(role=role, parts=[types.Part.from_text(text=turn.get('content', ''))]))
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=user_message)]))

        try:
            if kwargs.get("stream", False):
                return client.models.generate_content_stream(model=model, contents=contents, config=config)
            response = client.models.generate_content(model=model, contents=contents, config=config)
            return response.text
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "RESOURCE_EXHAUSTED" in error_str:
                try:
                    fallback_model = os.getenv("FALLBACK_MODEL_ID", "gemini-2.0-flash")
                    logger.warning(f"Gemini quota exceeded. Switching to {fallback_model} fallback.")
                    response = client.models.generate_content(model=fallback_model, contents=contents, config=config)
                    result_text = response.text
                    if "STRICTLY ONLY a single, raw JSON" in (system_prompt or "") or "{" in result_text: return result_text
                    return result_text + f"\n\n(Note: Switched to {fallback_model} due to usage limits.)"
                except Exception as fallback_error:
                    logger.error(f"Fallback failed: {fallback_error}")
                    return f"Gemini is currently not available (usage limit) and fallback failed. Please try later."
            logger.error(f"Gemini error: {e}"); raise e

def chat_with_document(user, user_message, history, xml_content, chat_type="general"):
    if chat_type == 'general':
        system_prompt = f"""
            You are a highly specialized AI assistant for FDA employees, designed to analyze regulatory documents. Your primary function is to provide direct, accurate, and cited answers to questions based on the provided drug labeling document.
            **Core Instructions:**
            -   Answer the user's question directly and concisely. **DO NOT** provide a step-by-step explanation, preamble, or summary of your reasoning (e.g., "Step 1," "To determine...").
            -   You **MUST** cite the specific section number(s) (e.g., (5.1), (7.3)) from the document that support your answer.
            -   At the very end of your response, on a new line, you **MUST** append the exact verbatim phrases (2-6 words) from the document that are most relevant to the answer. Use the hidden format: `[[KEYWORDS: "phrase one", "phrase two"]]`.
            -   If the document does not contain information to answer the question, state that clearly and do not invent an answer.

            **Reference Document:**
            {xml_content}
            """
    elif chat_type == 'TERM_VERIFY': 
        system_prompt = user_message
        user_message = f"###Refences: {xml_content}\n\n###Output: Here is the generated JSON:"
    return call_llm(user, system_prompt, user_message, history)

def summarize_comparison(user, differing_sections, label1_name, label2_name):
    summary_parts = []
    for section in differing_sections:
        summary_parts.append(f"--- Section: {section.get('title', 'Unknown Section')} ---\n{label1_name}:\n{section.get('content1', '')}\n\n{label2_name}:\n{section.get('content2', '')}\n\n")
    system_prompt = """
        You are an expert AI analyst for the FDA. Your sole function is to identify and summarize the key substantive differences between two drug labeling documents.
        Analyze and summarize critical differences focusing on safety, efficacy, indications, contraindications, and warnings.
        Output MUST be ONLY raw HTML starting with <h3>.
    """
    user_message = f"Compare drug labels for '{label1_name}' and '{label2_name}'.\n\n--- DOCUMENT CONTENT ---\n{''.join(summary_parts)}"
    return call_llm(user, system_prompt, user_message)

def generate_assessment(user, prompt, content):
    return call_llm(user, prompt, f"--- DRUG LABEL CONTENT ---\n{content}")

def get_search_helper_response(user, user_message, history):
    return call_llm(user, SEARCH_HELPER_PROMPT, user_message, history)

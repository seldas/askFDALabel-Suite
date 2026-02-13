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
    @staticmethod
    def get_client(user=None):
        """
        Returns the appropriate client and model based on user preferences.
        If user is None or has no preference, returns defaults based on environment.
        """
        # System Defaults
        default_gemini_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        
        # Check if we are in an internal environment
        is_internal = False
        try:
            is_internal = FDALabelDBService.check_connectivity()
        except Exception:
            pass

        # FORCE Internal Default if in internal environment and trying to use external providers
        # This prevents Gemini/Gemma usage even if manually set
        if is_internal and (user and user.ai_provider not in ['elsa',]):
             # Override to Internal OpenAI/Llama
             client = OpenAI(
                api_key=os.getenv("LLM_KEY", "no-key-required"),
                base_url=os.getenv("LLM_URL", "http://localhost:8000/v1")
             )
             return "openai", client, os.getenv("LLM_MODEL", "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8")

        if not user or not user.is_authenticated:
            if is_internal:
                # Internal default: OpenAI/Llama (vLLM)
                client = OpenAI(
                    api_key=os.getenv("LLM_KEY", "no-key-required"),
                    base_url=os.getenv("LLM_URL", "http://localhost:8000/v1")
                )
                return "openai", client, os.getenv("LLM_MODEL", "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8")
            else:
                # External default: Gemini
                return "gemini", genai.Client(api_key=default_gemini_key), os.getenv("PRIMARY_MODEL_ID", "gemini-2.5-pro")
        
        if user.ai_provider == 'openai':
            client = OpenAI(
                api_key=user.openai_api_key,
                base_url=user.openai_base_url if user.openai_base_url else None
            )
            return "openai", client, user.openai_model_name or "gpt-4o"
        elif user.ai_provider == 'elsa':
            # Elsa configuration
            elsa_config = {
                'username': os.getenv("ELSA_API_NAME"),
                'password': os.getenv("ELSA_API_KEY"),
                'base_url': "https://elsa-dev.preprod.fda.gov/Monolith/api/engine/runPixel",
                'model_engine_id': os.getenv("ELSA_MODEL_ID"),
            }
            return "elsa", elsa_config, os.getenv("ELSA_MODEL_ID")
        elif user.ai_provider == 'gemma':
            # Gemma 3 27B (using Gemini API)
            api_key = user.custom_gemini_key if user.custom_gemini_key else default_gemini_key
            return "gemini", genai.Client(api_key=api_key), os.getenv("GEMMA_MODEL_ID", "gemma-3-27b-it")
        else:
            # Gemini (User custom or system default)
            api_key = user.custom_gemini_key if user.custom_gemini_key else default_gemini_key
            return "gemini", genai.Client(api_key=api_key), os.getenv("PRIMARY_MODEL_ID", "gemini-2.5-pro")
        
def call_llm(user, system_prompt, user_message, history=None, model_override=None, **kwargs):
    provider, client, model = AIClientFactory.get_client(user)
    print(provider, model)
    if model_override:
        model = model_override

    # Standard Sampling Parameters
    temperature = kwargs.get("temperature", 0.1)
    max_tokens = kwargs.get("max_tokens", 20000)
    top_p = kwargs.get("top_p", 0.95)

    if provider == "openai":
        messages = []
        supports_system = kwargs.get("supports_system", True)
        
        if system_prompt:
            if supports_system:
                messages.append({"role": "system", "content": system_prompt})
            else:
                user_message = f"SYSTEM INSTRUCTIONS:\n{system_prompt}\n\nUSER MESSAGE:\n{user_message}"
        
        if history:
            for turn in history:
                messages.append({"role": turn.get('role', 'user'), "content": turn.get('content', '')})
        
        messages.append({"role": "user", "content": user_message})

        try:
            vllm_extras = {
                "repetition_penalty": kwargs.get("repetition_penalty", 1.1),
                "top_k": kwargs.get("top_k", 50),
            }

            response = client.chat.completions.create(
                model=model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=top_p,
                extra_body=vllm_extras,
                stream=kwargs.get("stream", False)
            )
            return response.choices[0].message.content
        except Exception as e:
            logger.error(f"LLM error: {e}")
            raise e

    elif provider == "elsa":
        # Build the full prompt with system instructions and history
        full_prompt = ""
        
        if system_prompt:
            full_prompt += f"SYSTEM INSTRUCTIONS:\n{system_prompt}\n\n"
        
        if history:
            full_prompt += "CONVERSATION HISTORY:\n"
            for turn in history:
                role = turn.get('role', 'user').upper()
                content = turn.get('content', '')
                full_prompt += f"{role}: {content}\n"
            full_prompt += "\n"
        
        full_prompt += f"USER: {user_message}"

        try:
            # Construct the Elsa command
            command = f'''LLM(engine = "{model}", command = "<encode>{full_prompt}</encode>", paramValues = [{{"max_completion_tokens": {max_tokens}, "temperature": {temperature}}}])'''
            
            response = requests.post(
                client['base_url'],
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                data=f'expression={quote_plus(command)}',
                auth=(client['username'], client['password']),
                verify=False
            )
            
            if response.status_code == 200:
                result = json.loads(response.text)
                return result['pixelReturn'][0]['output']['response']
            else:
                error_msg = f"Elsa API error: Status {response.status_code}"
                logger.error(error_msg)
                raise Exception(error_msg)
                
        except Exception as e:
            logger.error(f"Elsa error: {e}")
            raise e

    elif provider == "gemini":
        # Gemma models often don't support the 'system_instruction' parameter.
        # We check the model name to decide how to handle the system prompt.
        is_gemma = "gemma" in model.lower()
        
        # Prepare the config - system_instruction is None for Gemma
        config = types.GenerateContentConfig(
            temperature=temperature,
            top_p=top_p,
            max_output_tokens=max_tokens,
            system_instruction=None if is_gemma else (system_prompt if system_prompt else None),
            safety_settings=[
                types.SafetySetting(
                    category="HARM_CATEGORY_HARASSMENT",
                    threshold="BLOCK_ONLY_HIGH",
                )
            ]
        )
        
        contents = []
        
        # If it's Gemma, we inject the system prompt into the first message
        if is_gemma and system_prompt:
            user_message = f"SYSTEM INSTRUCTIONS:\n{system_prompt}\n\nUSER MESSAGE:\n{user_message}"

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
                # Fallback logic: Switch to defined fallback model and retry
                try:
                    fallback_model = os.getenv("FALLBACK_MODEL_ID", "gemini-2.0-flash")
                    logger.warning(f"Gemini quota exceeded. Switching to {fallback_model} fallback.")
                    
                    # Update config for fallback - some older models might not support system_instruction as neatly
                    # but for gemini-2.0-flash it should be fine.
                    fallback_config = config
                    
                    response = client.models.generate_content(model=fallback_model, contents=contents, config=fallback_config)
                    return response.text + f"\n\n(Note: Switched to {fallback_model} due to usage limits.)"
                    
                except Exception as fallback_error:
                    logger.error(f"Fallback failed: {fallback_error}")
                    return f"Gemini is currently not available (usage limit) and fallback to {fallback_model} failed. Please try later."
            
            logger.error(f"Gemini error: {e}")
            raise e

def chat_with_document(user, user_message, history, xml_content, chat_type="general"):
    system_prompt = (
                                                                                                                                                                             
    )
    if chat_type == 'general':
        system_prompt = f"""
            You are a highly specialized AI assistant for FDA employees, designed to analyze regulatory documents. Your primary function is to provide direct, accurate, and cited answers to questions based on the provided drug labeling document.
            **Core Instructions:**
            -   Answer the user's question directly and concisely. **DO NOT** provide a step-by-step explanation, preamble, or summary of your reasoning (e.g., "Step 1," "To determine...").
            -   You **MUST** cite the specific section number(s) (e.g., (5.1), (7.3)) from the document that support your answer.
            -   At the very end of your response, on a new line, you **MUST** append the exact verbatim phrases (2-6 words) from the document that are most relevant to the answer. Use the hidden format: `[[KEYWORDS: "phrase one", "phrase two"]]`.
            -   If the document does not contain information to answer the question, state that clearly and do not invent an answer.

            **Example Interaction:**
            User Question:
            What drugs interact with abacavir?

            Correct Response Format:
            Co-administration of abacavir can increase the clearance of methadone (7.1) and increase exposure to riociguat (7.3).

            [KEYWORDS: "xxx", "xxx"]

            **Reference Document:**
            Here is the reference document in XML format:
            {xml_content}
            """
    elif chat_type == 'TERM_VERIFY': # switch the user_message and system prompt to enhance the output
        system_prompt = user_message
        user_message = f"###Refences: {xml_content}\n\n###Output: Here is the generated JSON:"
    return call_llm(user, system_prompt, user_message, history)

def summarize_comparison(user, differing_sections, label1_name, label2_name):
    summary_parts = []
    for section in differing_sections:
        title = section.get('title', 'Unknown Section')
        content1 = section.get('content1', '')
        content2 = section.get('content2', '')
        summary_parts.append(f"--- Section: {title} ---\n{label1_name}:\n{content1}\n\n{label2_name}:\n{content2}\n\n")

    combined_diff_text = "".join(summary_parts)
    system_prompt = """
        You are an expert AI analyst for the FDA. Your sole function is to identify and summarize the key substantive differences between two drug labeling documents.

        **Core Task:**
        1.  Analyze the provided text, which contains the content of two different drug labels.
        2.  Identify the most critical differences, focusing on safety, efficacy, indications, contraindications, and warnings.
        3.  Generate a concise "Overall Critical Differences" executive summary.
        4.  Generate a section-by-section summary of notable differences.

        **CRITICAL OUTPUT FORMATTING RULES:**
        -   Your response MUST be ONLY raw HTML.
        -   DO NOT include any preamble, explanation, conversational text, or markdown code blocks (
        html). Your response must start directly with the <h3> tag.

        The entire output must follow this exact structure:
        Overall Critical Differences
        A summary of the most important difference.
        Another key difference summary.
        [Section Name, e.g., Indications and Usage]

        Detail of a difference found in this section.
        [Section Name, e.g., Warnings and Precautions]

        Detail of a difference found in this section.
        Another difference in the same section.
        If a section has no significant differences, DO NOT include a heading for it.
        If there are no differences at all, output only: <p>No substantive differences were identified between the two labels.</p> 
    """
    user_message = (
        f"Compare the drug labels for '{label1_name}' and '{label2_name}'. "
        f"Generate the HTML summary based on the content below.\n\n"
        f"--- DOCUMENT CONTENT ---\n{combined_diff_text}"
    )
    return call_llm(user, system_prompt, user_message)

def generate_assessment(user, prompt, content):
    system_prompt = prompt
    user_message = f"--- DRUG LABEL CONTENT ---\n{content}"
    return call_llm(user, system_prompt, user_message)

def get_search_helper_response(user, user_message, history):
    """
    Handles the AI Search Helper conversation.
    Returns the raw JSON string response from the AI.
    """
    return call_llm(user, SEARCH_HELPER_PROMPT, user_message, history)

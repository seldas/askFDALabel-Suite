import json
import hashlib
from datetime import datetime
from database import db, ComparisonSummary
from dashboard.services.ai_handler import call_llm

def get_comparison_summary(user, set_ids, comparison_data, label_names, force_refresh=False):
    """
    Fetches a cached comparison summary or generates a new one.
    """
    if not set_ids:
        return None
    
    # 1. Check Cache
    sorted_ids = sorted(set_ids)
    ids_str = json.dumps(sorted_ids)
    ids_hash = hashlib.sha256(ids_str.encode('utf-8')).hexdigest()
    
    if not force_refresh:
        cached = ComparisonSummary.query.filter_by(set_ids_hash=ids_hash).first()
        if cached:
            return cached.summary_content

    # 2. Prepare data for AI
    # We only send sections that have differences to save tokens and focus the AI
    differing_sections = []
    for section in comparison_data:
        if not section.get('is_same') and not section.get('is_empty'):
            # For simplicity, we assume 2 labels here as per summarize_comparison logic
            contents = section.get('contents', [])
            if len(contents) >= 2:
                differing_sections.append({
                    'title': section.get('title'),
                    'content1': contents[0] or 'N/A',
                    'content2': contents[1] or 'N/A'
                })

    if not differing_sections:
        return "<p>No substantive differences were identified between the labels for comparison.</p>"

    label1_name = label_names[0] if len(label_names) > 0 else "Label A"
    label2_name = label_names[1] if len(label_names) > 1 else "Label B"

    # 3. Generate via AI
    summary_content = summarize_comparison_logic(user, differing_sections, label1_name, label2_name)
    
    # 4. Update Cache
    existing = ComparisonSummary.query.filter_by(set_ids_hash=ids_hash).first()
    if existing:
        existing.summary_content = summary_content
        existing.timestamp = datetime.utcnow()
    else:
        new_summary = ComparisonSummary(
            set_ids_hash=ids_hash,
            set_ids=ids_str,
            summary_content=summary_content
        )
        db.session.add(new_summary)
    
    db.session.commit()
    return summary_content

def summarize_comparison_logic(user, differing_sections, label1_name, label2_name):
    """
    The actual AI prompt and call logic.
    """
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
        -   DO NOT include any preamble, explanation, conversational text, or markdown code blocks (```html). Your response must start directly with the <h3> tag.

        The entire output must follow this exact structure:
        <h3>Overall Critical Differences</h3>
        <ul>
            <li>A summary of the most important difference.</li>
            <li>Another key difference summary.</li>
        </ul>

        <div class="summary-section">
            <h4>[Section Name, e.g., Indications and Usage]</h4>
            <ul>
                <li>Detail of a difference found in this section.</li>
            </ul>
        </div>

        <div class="summary-section">
            <h4>[Section Name, e.g., Warnings and Precautions]</h4>
            <ul>
                <li>Detail of a difference found in this section.</li>
                <li>Another difference in the same section.</li>
            </ul>
        </div>

        If a section has no significant differences, DO NOT include a heading for it.
        If there are no differences at all, output only: <p>No substantive differences were identified between the two labels.</p> 
    """
    
    user_message = (
        f"Compare the drug labels for '{label1_name}' and '{label2_name}'. "
        f"Generate the HTML summary based on the content below.\n\n"
        f"--- DOCUMENT CONTENT ---\n{combined_diff_text}"
    )
    
    return call_llm(user, system_prompt, user_message)

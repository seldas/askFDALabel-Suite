from flask import Blueprint, render_template, request, jsonify, current_app
from flask_login import current_user, login_required
from database import Favorite
from dashboard.services.xml_handler import parse_spl_xml, flatten_sections, get_aggregate_content
from dashboard.services.fdalabel_db import FDALabelDBService
from dashboard.services.fda_client import get_label_metadata, get_label_xml
from dashboard.utils import normalize_text_for_diff, get_section_sort_key, normalize_title_text, extract_numeric_section_id
import re
import json
import hashlib
from difflib import HtmlDiff
from .compare import get_comparison_summary

labelcomp_bp = Blueprint('labelcomp', __name__, template_folder='templates')

@labelcomp_bp.route('/summarize', methods=['POST'])
@login_required
def summarize():
    data = request.json
    set_ids = data.get('set_ids')
    comparison_data = data.get('comparison_data')
    label_names = data.get('label_names')
    force_refresh = data.get('force_refresh', False)
    
    try:
        summary = get_comparison_summary(current_user, set_ids, comparison_data, label_names, force_refresh)
        return jsonify({'summary': summary})
    except Exception as e:
        current_app.logger.error(f"Summarization error: {e}")
        return jsonify({'error': str(e)}), 500

@labelcomp_bp.route('/', methods=['GET', 'POST'], strict_slashes=False)
def index():
    """Homepage for Label Comparison app."""
    if request.method == 'POST':
        set_ids = request.form.getlist('set_ids')
        drug_name = request.form.get('drug_name')
    else:
        set_ids = request.args.getlist('set_ids')
        drug_name = request.args.get('drug_name')
    
    # If no set_ids, we just show the base page with an 'Add Label' option
    if not set_ids:
        return render_template('labelcomp.html', 
                               labels=[], 
                               comparison_data=[],
                               selected_labels_metadata=[],
                               drug_name=drug_name,
                               current_set_ids=[])

    # Reuse logic from dashboard/routes/main.py:compare() but adapted for labelcomp
    # For now, let's keep it simple and see what's needed.
    # I'll basically copy the core comparison logic here.
    
    selected_labels_metadata = []
    formats = set()
    labels_data = []
    all_section_keys = {}
    comparison_format = 'PLR'

    for set_id in set_ids:
        # User requested to use DailyMed like other apps
        label_xml_raw = get_label_xml(set_id)
        
        if label_xml_raw:
            from dashboard.services.xml_handler import extract_metadata_from_xml
            doc_title, sections, _, _, _ = parse_spl_xml(label_xml_raw)
            flat_sections = flatten_sections(sections)
            
            # Use metadata from XML if possible
            meta = extract_metadata_from_xml(label_xml_raw)
            if not meta.get('brand_name') or meta.get('brand_name') == 'N/A':
                # Fallback to metadata service which checks more sources
                meta = get_label_metadata(set_id) or meta
            
            # Ensure set_id is in meta for frontend
            if not meta.get('set_id'):
                meta['set_id'] = set_id

            selected_labels_metadata.append(meta)
            formats.add(meta.get('label_format', 'PLR'))
            comparison_format = meta.get('label_format', 'PLR')

            sections_by_key = {}
            for s in flat_sections:
                if s.get('title'):
                    raw_title = s['title']
                    norm_title = normalize_title_text(raw_title)
                    
                    if comparison_format == 'PLR':
                        key = extract_numeric_section_id(raw_title)
                        if key:
                            sections_by_key[key] = get_aggregate_content(s)
                            if key not in all_section_keys:
                                all_section_keys[key] = {}
                            if norm_title not in all_section_keys[key]:
                                all_section_keys[key][norm_title] = raw_title
                    else:
                        key = norm_title
                        if key:
                            sections_by_key[key] = s['content']
                            if key not in all_section_keys:
                                all_section_keys[key] = {}
                            if norm_title not in all_section_keys[key]:
                                all_section_keys[key][norm_title] = raw_title
            
            labels_data.append({
                'title': doc_title,
                'sections_by_key': sections_by_key
            })

    if comparison_format == 'PLR':
        sorted_keys = sorted(all_section_keys.keys(), key=lambda x: get_section_sort_key(x))
    else:
        sorted_keys = sorted(all_section_keys.keys())

    comparison_data = []
    htmldiffer = HtmlDiff()

    def aggressive_normalize(lines):
        if not lines: return ""
        text = " ".join(lines).lower()
        return re.sub(r'[^a-z0-9]', '', text)

    for key in sorted_keys:
        contents = []
        for label in labels_data:
            contents.append(label['sections_by_key'].get(key))
        
        display_titles = sorted(list(all_section_keys[key].values()))
        display_title = " / ".join(display_titles)

        normalized_contents = [tuple(normalize_text_for_diff(c)) if c else None for c in contents]
        agg_normalized_contents = [aggressive_normalize(nc) for nc in normalized_contents]
        
        is_empty = all(not nc for nc in agg_normalized_contents)
        has_all = all(nc is not None for nc in agg_normalized_contents)
        is_same = has_all and len(set(agg_normalized_contents)) == 1

        diff_html_output = None
        if not is_same and len(contents) == 2:
            plain_text1_lines = normalized_contents[0] if normalized_contents[0] is not None else []
            plain_text2_lines = normalized_contents[1] if normalized_contents[1] is not None else []
            
            diff_html_output = htmldiffer.make_table(plain_text1_lines, plain_text2_lines, context=True)
            if diff_html_output:
                diff_html_output = diff_html_output.replace('nowrap="nowrap"', '').replace('&nbsp;', ' ')
                diff_html_output = re.sub(r'<colgroup>.*?</colgroup>', '', diff_html_output)

        comparison_data.append({
            'title': display_title,
            'key': key,
            'nesting_level': key.count('.') if comparison_format == 'PLR' else 0,
            'contents': contents, 
            'is_same': is_same,
            'is_empty': is_empty,
            'diff_html': diff_html_output
        })

    user_favorites = []
    if current_user.is_authenticated:
        user_favorites = Favorite.query.filter_by(user_id=current_user.id).order_by(Favorite.timestamp.desc()).all()

    # Check for existing summary in cache
    existing_summary = None
    if set_ids:
        from database import ComparisonSummary
        sorted_ids = sorted(set_ids)
        ids_hash = hashlib.sha256(json.dumps(sorted_ids).encode('utf-8')).hexdigest()
        cached = ComparisonSummary.query.filter_by(set_ids_hash=ids_hash).first()
        if cached:
            existing_summary = cached.summary_content

    # JSON Response for new frontend
    if request.args.get('json') == '1' or request.headers.get('Accept') == 'application/json':
        return jsonify({
            'labels': [ld['title'] for ld in labels_data],
            'comparison_data': comparison_data,
            'selected_labels_metadata': selected_labels_metadata,
            'drug_name': drug_name,
            'current_set_ids': set_ids,
            'existing_summary': existing_summary,
            'is_authenticated': current_user.is_authenticated
        })

    return render_template('labelcomp.html', 
                           labels=[ld['title'] for ld in labels_data], 
                           comparison_data=comparison_data,
                           selected_labels_metadata=selected_labels_metadata,
                           drug_name=drug_name,
                           current_set_ids=set_ids,
                           user_favorites=user_favorites,
                           existing_summary=existing_summary)

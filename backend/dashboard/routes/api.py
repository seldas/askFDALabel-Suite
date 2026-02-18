from flask import Blueprint, request, jsonify, redirect, url_for
from flask_login import login_required, current_user
import json, re, os
import uuid
import requests
import xml.etree.ElementTree as ET
from datetime import datetime
import logging
import hashlib

from database import (
    db, User, Project, Favorite, FavoriteComparison, Annotation, 
    LabelAnnotation, DiliAssessment, DictAssessment, DiriAssessment, ToxAgent, ComparisonSummary,
    MeddraPT, MeddraMDHIER, MeddraSOC, MeddraHLT, MeddraLLT
)
from dashboard.services.fda_client import get_label_metadata, get_label_xml, get_faers_data, find_labels, find_labels_by_set_ids
from dashboard.services.ai_handler import chat_with_document, summarize_comparison, generate_assessment, get_search_helper_response
from dashboard.services.xml_handler import extract_metadata_from_xml
from dashboard.services.pgx_handler import run_pgx_assessment
from dashboard.prompts import (
    DILI_prompt, DICT_prompt, DIRI_prompt, 
    DILI_PT_TERMS, DICT_PT_TERMS, DIRI_PT_TERMS)
from dashboard.config import Config
from sqlalchemy import func
from dashboard.services.meddra_matcher import scan_label_for_meddra

logger = logging.getLogger(__name__)
api_bp = Blueprint('api', __name__)

@api_bp.route('/meddra/scan_label/<set_id>')
def scan_label_meddra(set_id):
    # 1. Get XML content
    xml_content = get_label_xml(set_id)
    if not xml_content:
        return jsonify({'error': 'Label not found'}), 404

    # 2. Extract plain text (simple stripping for matching purposes)
    # We need a way to get the text that the user sees.
    # The frontend sees the HTML rendered from XML.
    # Ideally, we should parse the XML similarly to how it's rendered.
    # For now, let's do a robust XML->Text extraction.
    try:
        root = ET.fromstring(xml_content.encode('utf-8'))
        # Using a namespace map if necessary, but itertext() usually works fine
        text_content = "".join(root.itertext())
    except Exception as e:
        logger.error(f"XML Parse error for MedDRA scan: {e}")
        return jsonify({'error': 'Failed to parse label'}), 500

    # 3. Scan
    found_terms = scan_label_for_meddra(text_content)
    
    # 4. Enrich with SOC info
    enriched_terms = []
    if found_terms:
        # Create a mock list for enrichment function
        mock_list = [{'term': t} for t in found_terms]
        enriched_list = enrich_faers_with_meddra(mock_list)
        
        # Transform back to simpler structure if needed, or just return
        enriched_terms = enriched_list

    return jsonify({'found_terms': enriched_terms, 'count': len(enriched_terms)})

def enrich_faers_with_meddra(faers_list):
    """
    Enriches a list of FAERS results (dict with 'term') with SOC and HLT info.
    Handles both PTs and LLTs.
    """
    if not faers_list:
        return faers_list

    # Extract terms (unique, upper case)
    all_terms = set(item.get('term').upper() for item in faers_list if item.get('term'))
    if not all_terms:
        return faers_list

    enrichment_map = {}
    
    # 1. Try to match as PTs
    pt_results = db.session.query(
        MeddraPT.pt_name,
        MeddraMDHIER.soc_name,
        MeddraMDHIER.hlt_name,
        MeddraMDHIER.soc_abbrev
    ).join(
        MeddraMDHIER, MeddraPT.pt_code == MeddraMDHIER.pt_code
    ).filter(
        MeddraMDHIER.primary_soc_fg == 'Y', 
        func.upper(MeddraPT.pt_name).in_(all_terms)
    ).all()

    found_pts = set()
    for pt_name, soc_name, hlt_name, soc_abbrev in pt_results:
        u_name = pt_name.upper()
        enrichment_map[u_name] = {
            'soc': soc_name, 
            'hlt': hlt_name,
            'soc_abbrev': soc_abbrev
        }
        found_pts.add(u_name)

    # 2. Identify missing terms (potential LLTs)
    missing_terms = all_terms - found_pts
    
    if missing_terms:
        llt_results = db.session.query(
            MeddraLLT.llt_name,
            MeddraMDHIER.soc_name,
            MeddraMDHIER.hlt_name,
            MeddraMDHIER.soc_abbrev
        ).join(
            MeddraMDHIER, MeddraLLT.pt_code == MeddraMDHIER.pt_code
        ).filter(
            MeddraMDHIER.primary_soc_fg == 'Y',
            func.upper(MeddraLLT.llt_name).in_(missing_terms)
        ).all()

        for llt_name, soc_name, hlt_name, soc_abbrev in llt_results:
            u_name = llt_name.upper()
            enrichment_map[u_name] = {
                'soc': soc_name, 
                'hlt': hlt_name,
                'soc_abbrev': soc_abbrev
            }

    # 3. Update original list
    for item in faers_list:
        term = item.get('term', '').upper()
        if term in enrichment_map:
            item['soc'] = enrichment_map[term]['soc']
            item['hlt'] = enrichment_map[term]['hlt']
            item['soc_abbrev'] = enrichment_map[term]['soc_abbrev']
        else:
            item['soc'] = 'N/A'
            item['hlt'] = 'N/A'
            item['soc_abbrev'] = ''
            
    return faers_list

@api_bp.route('/suggest-drugs', methods=['GET'])
def suggest_drugs():
    query = request.args.get('q', '').strip()
    
    if len(query) < 2:
        return jsonify({'suggestions': []})
    
    try:
        # Escape special characters
        escaped_query = query.replace('\\', '\\\\').replace('"', '\\"')
        search_query = f'(openfda.brand_name:{escaped_query}* OR openfda.generic_name:{escaped_query}*)'
        
        params = {
            'search': search_query,
            'limit': 10
        }
        
        # Add API key if available
        if Config.OPENFDA_API_KEY:
            params['api_key'] = Config.OPENFDA_API_KEY
        
        response = requests.get(
            'https://api.fda.gov/drug/label.json',
            params=params,
            timeout=5
        )
        
        if response.status_code != 200:
            return jsonify({'suggestions': []})
        
        data = response.json()
        suggestions = set()
        query_lower = query.lower()
        
        if data.get('results'):
            for result in data['results']:
                if result.get('openfda'):
                    # Add brand names
                    if result['openfda'].get('brand_name'):
                        for name in result['openfda']['brand_name']:
                            if name.lower().startswith(query_lower):
                                suggestions.add(name)
                    # Add generic names
                    if result['openfda'].get('generic_name'):
                        for name in result['openfda']['generic_name']:
                            if name.lower().startswith(query_lower):
                                suggestions.add(name)
        
        # Sort and limit
        sorted_suggestions = sorted(list(suggestions), key=lambda x: x.lower())[:8]
        
        return jsonify({'suggestions': sorted_suggestions})
        
    except Exception as e:
        print(f"Error fetching suggestions: {e}")
        return jsonify({'suggestions': []})

# --- AI Chat ---
@api_bp.route('/ai_chat', methods=['POST'])
def ai_chat():
    data = request.get_json()
    user_message = data.get('message')
    history = data.get('history', [])
    xml_content = data.get('xml_content')
    chat_type = data.get('chat_type', 'general')

    if not user_message or not xml_content:
        return jsonify({'error': 'Missing message or xml_content'}), 400

    try:
        user_obj = current_user._get_current_object() if current_user.is_authenticated else None
        response_text = chat_with_document(user_obj, user_message, history, xml_content, chat_type)
        return jsonify({'response': response_text})
    except Exception as e:
        logger.error(f"Error calling AI API: {e}, {current_user}, {chat_type}")
        return jsonify({'error': f'AI API error: {str(e)}'}), 500

@api_bp.route('/ai_search_help', methods=['POST'])
def ai_search_help():
    data = request.get_json()
    user_message = data.get('message')
    history = data.get('history', [])

    if not user_message:
        return jsonify({'error': 'Missing message'}), 400

    try:
        user_obj = current_user._get_current_object() if current_user.is_authenticated else None
        response_json = get_search_helper_response(user_obj, user_message, history)
        # Verify it's valid JSON
        try:
            # It might come back with markdown code blocks ```json ... ```
            cleaned = response_json.replace('```json', '').replace('```', '').strip()
            parsed = json.loads(cleaned)
            return jsonify(parsed)
        except:
            if '```json' in response_json:
                cleaned = re.search('''```json(.*?)```''', response_json, re.DOTALL).group(1).strip()
                parsed = json.loads(cleaned)
                return jsonify(parsed)
            else:
                # Fallback if AI didn't return valid JSON
                return jsonify({
                    "reply": response_json,
                    "suggested_term": None,
                    "is_final": False
                })
    except Exception as e:
        logger.error(f"Error calling AI Search Helper: {e}")
        return jsonify({'error': f'AI API error: {str(e)}'}), 500

@api_bp.route('/search_count', methods=['GET'])
def search_count():
    query = request.args.get('q')
    if not query:
        return jsonify({'count': 0, 'source': 'Unknown'})
    
    try:
        # Use find_labels with limit=1 just to get the total count
        _, total = find_labels(query, skip=0, limit=1)
        
        # Determine source
        from dashboard.services.fdalabel_db import FDALabelDBService
        source = "FDALabel" if FDALabelDBService.check_connectivity() else "OpenFDA"
        
        return jsonify({'count': total, 'source': source})
    except Exception as e:
        logger.error(f"Error fetching search count: {e}")
        return jsonify({'count': 0, 'source': 'Error'})



@api_bp.route('/ai_compare_summary', methods=['POST'])
def ai_compare_summary():
    data = request.get_json()
    set_ids = data.get('set_ids', [])
    force_refresh = data.get('force_refresh', False)
    generate_if_missing = data.get('generate_if_missing', True)
    
    ids_hash = None
    ids_str = None

    # 1. Check Cache
    if set_ids:
        sorted_ids = sorted(set_ids)
        ids_str = json.dumps(sorted_ids)
        ids_hash = hashlib.sha256(ids_str.encode('utf-8')).hexdigest()
        
        if not force_refresh:
            cached = ComparisonSummary.query.filter_by(set_ids_hash=ids_hash).first()
            if cached:
                return jsonify({'summary': cached.summary_content, 'cached': True})

    if not generate_if_missing:
        return jsonify({'summary': None, 'cached': False})

    # 2. Generate
    differing_sections_data = data.get('differing_sections', [])
    label1_name = data.get('label1_name', 'Label A')
    label2_name = data.get('label2_name', 'Label B')

    if not differing_sections_data:
        return jsonify({'error': 'No differing sections provided for AI summary.'}), 400

    try:
        user_obj = current_user._get_current_object() if current_user.is_authenticated else None
        response_text = summarize_comparison(user_obj, differing_sections_data, label1_name, label2_name)
        
        # 3. Save to Cache
        if ids_hash:
            # Upsert
            existing = ComparisonSummary.query.filter_by(set_ids_hash=ids_hash).first()
            if existing:
                existing.summary_content = response_text
                existing.timestamp = datetime.utcnow()
            else:
                new_summary = ComparisonSummary(
                    set_ids_hash=ids_hash,
                    set_ids=ids_str,
                    summary_content=response_text
                )
                db.session.add(new_summary)
            db.session.commit()

        return jsonify({'summary': response_text, 'cached': False})
    except Exception as e:
        logger.error(f"Error calling AI API for comparison summary: {e}")
        return jsonify({'error': f'AI API error (Comparison): {str(e)}'}), 500


# --- Annotations ---
@api_bp.route('/save_annotation', methods=['POST'])
@login_required
def save_annotation():
    data = request.get_json()
    set_id = data.get('set_id')
    section_num = data.get('section_number', 'TOP') 
    question = data.get('question')
    answer = data.get('answer')
    keywords = data.get('keywords', [])
    is_public = data.get('is_public', False)
    
    if not set_id:
        return jsonify({'error': 'Missing set_id'}), 400
    
    if not question or not answer:
        return jsonify({'error': 'Missing question or answer'}), 400
        
    new_annotation = Annotation(
        user_id=current_user.id,
        set_id=set_id,
        section_number=str(section_num) if section_num else 'TOP',
        question=question,
        answer=answer,
        keywords=json.dumps(keywords),
        is_public=is_public
    )
    
    db.session.add(new_annotation)
    db.session.commit()
    
    return jsonify({'success': True, 'id': str(new_annotation.id)})

@api_bp.route('/delete_annotation', methods=['POST'])
@login_required
def delete_annotation():
    data = request.get_json()
    annotation_id = data.get('id')
    
    if not annotation_id:
        return jsonify({'error': 'Missing id'}), 400
        
    annotation = Annotation.query.filter_by(id=int(annotation_id), user_id=current_user.id).first()
    
    if annotation:
        db.session.delete(annotation)
        db.session.commit()
        return jsonify({'success': True})
        
    return jsonify({'error': 'Annotation not found or permission denied'}), 404

# --- Favorites ---
@api_bp.route('/toggle_favorite', methods=['POST'])
@login_required
def toggle_favorite():
    data = request.get_json()
    set_id = data.get('set_id')
    import_id = data.get('import_id')

    if not set_id:
        return jsonify({'error': 'Missing set_id'}), 400

    # LITERALLY always use the 'Favorite' project for toggling
    target_project = Project.query.filter_by(owner_id=current_user.id, title="Favorite").first()
    if not target_project:
        target_project = Project(title="Favorite", owner_id=current_user.id, display_order=0)
        db.session.add(target_project)
        db.session.commit()

    project_id = target_project.id

    # Check PROJECT-WIDE
    favorite = Favorite.query.filter_by(set_id=set_id, project_id=project_id, user_id=current_user.id).first()
    
    if favorite:
        # If it already exists, remove it (toggle behavior)
        db.session.delete(favorite)
        db.session.commit()
        return jsonify({'success': True, 'is_favorite': False})
    else:
        # Before adding, ensure we don't have a race condition or existing duplicate
        # (Though filter_by above should catch it, we stay strict)
        existing = Favorite.query.filter_by(set_id=set_id, project_id=project_id, user_id=current_user.id).first()
        if existing:
             return jsonify({'success': True, 'is_favorite': True})
            
        if not meta:
            return jsonify({'error': 'Could not fetch label metadata'}), 404

        new_favorite = Favorite(
            user_id=current_user.id, 
            project_id=project_id,
            set_id=set_id, 
            brand_name=meta.get('brand_name', 'n/a'),
            generic_name=meta.get('generic_name', 'n/a'),
            manufacturer_name=meta.get('manufacturer_name', 'n/a'),
            market_category=meta.get('market_category', 'n/a'),
            application_number=meta.get('application_number', 'n/a'),
            ndc=meta.get('ndc', 'n/a'),
            effective_time=meta.get('effective_time', 'n/a')
        )
        db.session.add(new_favorite)
        db.session.commit()
        return jsonify({'success': True, 'is_favorite': True})

@api_bp.route('/check_favorite/<set_id>')
def check_favorite(set_id):
    if not current_user.is_authenticated:
        return jsonify({'is_favorite': False})
    
    # Yellow star depends ONLY on the 'Favorite' project
    target_project = Project.query.filter_by(owner_id=current_user.id, title="Favorite").first()
    if not target_project:
        return jsonify({'is_favorite': False})

    favorite = Favorite.query.filter_by(set_id=set_id, project_id=target_project.id).first()
    return jsonify({'is_favorite': bool(favorite)})

@api_bp.route('/toggle_favorite_comparison', methods=['POST'])
@login_required
def toggle_favorite_comparison():
    data = request.get_json()
    set_ids = data.get('set_ids') # list
    title = data.get('title')
    project_id = data.get('project_id')

    if not set_ids:
        return jsonify({'error': 'Missing set_ids'}), 400

    set_ids.sort()
    set_ids_json = json.dumps(set_ids)

    if not project_id:
        default_proj = Project.query.filter_by(owner_id=current_user.id, title="Favorite").first()
        if default_proj:
            project_id = default_proj.id

    # Check PROJECT-WIDE
    favorite = FavoriteComparison.query.filter_by(set_ids=set_ids_json, project_id=project_id).first()
    
    # Check permissions
    project = Project.query.get(project_id)
    if not project or (project.owner_id != current_user.id and current_user not in project.members):
         return jsonify({'error': 'Unauthorized'}), 403

    if favorite:
        db.session.delete(favorite)
        db.session.commit()
        return jsonify({'success': True, 'is_favorite': False})
    else:
        new_favorite = FavoriteComparison(user_id=current_user.id, set_ids=set_ids_json, title=title, project_id=project_id)
        db.session.add(new_favorite)
        db.session.commit()
        return jsonify({'success': True, 'is_favorite': True})

@api_bp.route('/delete_favorites_bulk', methods=['POST'])
@login_required
def delete_favorites_bulk():
    data = request.get_json()
    set_ids = data.get('set_ids', [])
    project_id = data.get('project_id')
    
    if not set_ids:
        return jsonify({'success': True, 'deleted_count': 0})

    if not project_id:
        return jsonify({'error': 'Project ID required'}), 400

    # Verify project access
    project = Project.query.get(project_id)
    if not project or (project.owner_id != current_user.id and current_user not in project.members):
         return jsonify({'error': 'Unauthorized'}), 403

    # Delete from project (regardless of creator)
    query = Favorite.query.filter(
        Favorite.project_id == project_id,
        Favorite.set_id.in_(set_ids)
    )

    deleted_count = query.delete(synchronize_session=False)
    
    db.session.commit()
    return jsonify({'success': True, 'deleted_count': deleted_count})

@api_bp.route('/delete_favorite_comparisons_bulk', methods=['POST'])
@login_required
def delete_favorite_comparisons_bulk():
    data = request.get_json()
    ids = data.get('ids', [])
    project_id = data.get('project_id')
    
    if not ids:
        return jsonify({'success': True, 'deleted_count': 0})

    if not project_id:
        return jsonify({'error': 'Project ID required'}), 400

    # Verify project access
    project = Project.query.get(project_id)
    if not project or (project.owner_id != current_user.id and current_user not in project.members):
         return jsonify({'error': 'Unauthorized'}), 403

    query = FavoriteComparison.query.filter(
        FavoriteComparison.project_id == project_id,
        FavoriteComparison.id.in_(ids)
    )

    deleted_count = query.delete(synchronize_session=False)
    
    db.session.commit()
    return jsonify({'success': True, 'deleted_count': deleted_count})

@api_bp.route('/check_favorite_comparison', methods=['POST'])
def check_favorite_comparison():
    if not current_user.is_authenticated:
        return jsonify({'is_favorite': False})
    
    data = request.get_json()
    set_ids = data.get('set_ids')
    project_id = data.get('project_id')

    if not set_ids:
        return jsonify({'is_favorite': False})

    set_ids.sort()
    set_ids_json = json.dumps(set_ids)
    
    if not project_id:
        default_proj = Project.query.filter_by(owner_id=current_user.id, title="Favorite").first()
        if default_proj:
            project_id = default_proj.id

    # Check PROJECT-WIDE
    favorite = FavoriteComparison.query.filter_by(set_ids=set_ids_json, project_id=project_id).first()
    return jsonify({'is_favorite': bool(favorite)})

@api_bp.route('/import_favorites', methods=['POST'])
@login_required
def import_favorites():
    data = request.get_json()
    items = data.get('items', [])
    
    if not items:
         raw_ids = data.get('set_ids', [])
         if raw_ids:
             items = [{'set_id': sid} for sid in raw_ids]
         else:
             return jsonify({'error': 'No items provided.'}), 400

    added_count = 0
    errors = []
    
    import re
    uuid_pattern = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.IGNORECASE)

    for item in items:
        set_id = item.get('set_id', '').strip()
        if not set_id or not uuid_pattern.match(set_id):
            continue

        existing = Favorite.query.filter_by(user_id=current_user.id, set_id=set_id).first()
        if existing:
            continue

        if item.get('brand_name'):
            try:
                new_fav = Favorite(
                    user_id=current_user.id,
                    set_id=set_id,
                    brand_name=item.get('brand_name'),
                    manufacturer_name=item.get('manufacturer_name'),
                    effective_time=item.get('effective_time')
                )
                db.session.add(new_fav)
                added_count += 1
            except Exception as e:
                errors.append(f"Error saving {set_id}: {str(e)}")
        else:
            try:
                meta = get_label_metadata(set_id)
                if meta:
                    new_fav = Favorite(
                        user_id=current_user.id,
                        set_id=set_id,
                        brand_name=meta.get('brand_name'),
                        manufacturer_name=meta.get('manufacturer_name'),
                        effective_time=meta.get('effective_time')
                    )
                    db.session.add(new_fav)
                    added_count += 1
                else:
                    errors.append(f"Could not find metadata for {set_id}")
            except Exception as e:
                logger.error(f"Error fetching/saving {set_id}: {e}")
                errors.append(f"Error processing {set_id}")

    db.session.commit()

    return jsonify({
        'success': True, 
        'added_count': added_count, 
        'total_processed': len(items),
        'errors': errors
    })

@api_bp.route('/favorite_all', methods=['POST'])
@login_required
def favorite_all():
    data = request.get_json()
    drug_name = data.get('drug_name')
    batch_id_search = data.get('batch_id_search')
    import_id = data.get('import_id')
    project_id = data.get('project_id')
    new_project_name = data.get('new_project_name')

    target_project = None
    if new_project_name:
        if Project.query.filter_by(owner_id=current_user.id).count() >= 5:
             return jsonify({'error': 'Project limit reached (Max 5). Cannot create new project.'}), 403
        
        target_project = Project(title=new_project_name, owner_id=current_user.id)
        db.session.add(target_project)
        db.session.commit()
    elif project_id:
        target_project = Project.query.get(project_id)
        if not target_project or (target_project.owner_id != current_user.id and current_user not in target_project.members):
            return jsonify({'error': 'Invalid project or unauthorized access.'}), 403
    else:
        target_project = Project.query.filter_by(owner_id=current_user.id, title="Favorite").first()
        if not target_project:
             target_project = Project(title="Favorite", owner_id=current_user.id, display_order=0)
             db.session.add(target_project)
             db.session.commit()

    labels = []
    MAX_FETCH = 100
    
    if batch_id_search:
        ids_list = [sid.strip() for sid in batch_id_search.split(',') if sid.strip()]
        labels, _ = find_labels_by_set_ids(ids_list, skip=0, limit=MAX_FETCH)
    elif import_id:
        import_path = os.path.join(Config.UPLOAD_FOLDER, f"import_{import_id}.json")
        if os.path.exists(import_path):
            with open(import_path, 'r', encoding='utf-8') as f:
                labels = json.load(f)
    elif drug_name:
        labels, _ = find_labels(drug_name, skip=0, limit=MAX_FETCH)
    
    if not labels:
         return jsonify({'success': True, 'added_count': 0, 'project_title': target_project.title})

    added_count = 0
    for label in labels:
        set_id = label['set_id']
        # Check if already exists IN THIS PROJECT (regardless of user)
        existing = Favorite.query.filter_by(set_id=set_id, project_id=target_project.id).first()
        if not existing:
            new_fav = Favorite(
                user_id=current_user.id,
                project_id=target_project.id,
                set_id=set_id,
                brand_name=label.get('brand_name', 'n/a'),
                generic_name=label.get('generic_name', 'n/a'),
                manufacturer_name=label.get('manufacturer_name', 'n/a'),
                market_category=label.get('market_category', 'n/a'),
                application_number=label.get('application_number', 'n/a'),
                ndc=label.get('ndc', 'n/a'),
                effective_time=label.get('effective_time', 'n/a')
            )
            db.session.add(new_fav)
            added_count += 1
            
    db.session.commit()
    
    return jsonify({
        'success': True, 
        'added_count': added_count, 
        'project_title': target_project.title
    })

# --- Label Annotations ---
@api_bp.route('/annotations/save', methods=['POST'])
@login_required
def save_label_annotation():
    data = request.json
    project_id = data.get('project_id','')
    set_id = data.get('set_id')
    section_id = data.get('section_id')
    start_offset = data.get('start_offset')
    end_offset = data.get('end_offset')
    selected_text = data.get('selected_text')
    annotation_type = data.get('annotation_type')
    color = data.get('color')
    comment = data.get('comment')

    # Check for missing required fields
    required_fields = {
        'project_id': project_id,
        'set_id': set_id,
        'section_id': section_id,
        'start_offset': start_offset,
        'end_offset': end_offset,
        'selected_text': selected_text,
        'annotation_type': annotation_type
    }
    
    missing_fields = [field for field, value in required_fields.items() 
                      if value is None or (isinstance(value, str) and value == '')]
    
    if missing_fields:
        return jsonify({
            'error': f"Missing required fields: {', '.join(missing_fields)}"
        }), 400

    project = Project.query.get(project_id)
    if not project:
        return jsonify({'error': 'Project not found'}), 404
    if project.owner_id != current_user.id and current_user not in project.members:
        return jsonify({'error': 'Unauthorized access to project'}), 403

    new_ann = LabelAnnotation(
        project_id=project_id,
        set_id=set_id,
        user_id=current_user.id,
        section_id=section_id,
        start_offset=start_offset,
        end_offset=end_offset,
        selected_text=selected_text,
        annotation_type=annotation_type,
        color=color,
        comment=comment
    )
    
    db.session.add(new_ann)
    db.session.commit()
    
    return jsonify({
        'success': True, 
        'id': new_ann.id,
        'username': current_user.username,
        'created_at': new_ann.created_at.isoformat()
    })

@api_bp.route('/annotations/get/<set_id>')
@login_required
def get_label_annotations(set_id):
    project_id = request.args.get('project_id', type=int)
    if not project_id:
        return jsonify({'error': 'Project ID required'}), 400
        
    project = Project.query.get(project_id)
    if not project:
         return jsonify({'error': 'Project not found'}), 404
    if project.owner_id != current_user.id and current_user not in project.members:
        return jsonify({'error': 'Unauthorized access to project'}), 403

    annotations = LabelAnnotation.query.filter_by(set_id=set_id, project_id=project_id).all()
    
    return jsonify({
        'annotations': [{
            'id': ann.id,
            'section_id': ann.section_id,
            'start_offset': ann.start_offset,
            'end_offset': ann.end_offset,
            'selected_text': ann.selected_text,
            'annotation_type': ann.annotation_type,
            'color': ann.color,
            'comment': ann.comment,
            'user_id': ann.user_id,
            'username': ann.user.username,
            'created_at': ann.created_at.isoformat()
        } for ann in annotations]
    })

@api_bp.route('/annotations/delete', methods=['POST'])
@login_required
def delete_label_annotation():
    data = request.json
    ann_id = data.get('id')
    
    annotation = LabelAnnotation.query.get(ann_id)
    if not annotation:
        return jsonify({'error': 'Annotation not found'}), 404
        
    if annotation.user_id != current_user.id:
        return jsonify({'error': 'Unauthorized. Only the creator can delete this annotation.'}), 403
        
    db.session.delete(annotation)
    db.session.commit()
    
    return jsonify({'success': True})

# --- Projects ---
@api_bp.route('/projects', methods=['GET', 'POST'])
@login_required
def api_projects():
    if request.method == 'POST':
        data = request.json
        title = data.get('title')
        if not title:
            return jsonify({'error': 'Title is required'}), 400
        
        count = Project.query.filter_by(owner_id=current_user.id).count()
        if count >= 5:
            return jsonify({'error': 'Project limit reached (Max 5).'}), 403
            
        max_order = db.session.query(db.func.max(Project.display_order)).filter_by(owner_id=current_user.id).scalar() or 0
        
        new_proj = Project(title=title, description=data.get('description'), owner_id=current_user.id, display_order=max_order + 1)
        db.session.add(new_proj)
        db.session.commit()
        return jsonify({'success': True, 'project': {'id': new_proj.id, 'title': new_proj.title}})
    
    not_grouped = Project.query.filter_by(owner_id=current_user.id, title="Favorite").first()
    
    other_owned = Project.query.filter(
        Project.owner_id == current_user.id, 
        Project.title != "Favorite"
    ).order_by(Project.display_order.asc(), Project.created_at.asc()).all()
    
    shared = current_user.shared_projects
    
    projects = []
    if not_grouped:
        projects.append({
            'id': not_grouped.id, 
            'title': not_grouped.title, 
            'role': 'owner', 
            'count': len(not_grouped.favorites) + len(not_grouped.comparisons), 
            'is_default': True,
            'is_mutable': False # Favorite project is a permanent workspace and cannot be removed
        })
        
    for p in other_owned:
        projects.append({
            'id': p.id, 
            'title': p.title, 
            'role': 'owner', 
            'count': len(p.favorites) + len(p.comparisons), 
            'is_default': False,
            'is_mutable': True # Non-favorite projects can be removed freely by the owner
        })
        
    for p in shared:
        projects.append({
            'id': p.id, 
            'title': p.title, 
            'role': 'contributor', 
            'count': len(p.favorites) + len(p.comparisons), 
            'is_default': False,
            'is_mutable': False
        })
        
    return jsonify({'projects': projects})

@api_bp.route('/projects/reorder', methods=['POST'])
@login_required
def api_reorder_projects():
    data = request.json
    ordered_ids = data.get('ids', [])
    
    if not ordered_ids:
        return jsonify({'success': True})
        
    for index, project_id in enumerate(ordered_ids):
        project = Project.query.get(project_id)
        if project and project.owner_id == current_user.id:
            project.display_order = index + 1
            
    db.session.commit()
    return jsonify({'success': True})

@api_bp.route('/projects/<int:project_id>', methods=['PUT', 'DELETE'])
@login_required
def api_project_detail(project_id):
    project = Project.query.get_or_404(project_id)
    
    if project.owner_id != current_user.id:
        return jsonify({'error': 'Unauthorized'}), 403

    if request.method == 'DELETE':
        # Protect the 'Favorite' project from deletion
        if project.title == "Favorite":
            return jsonify({'error': 'The Favorite project is a permanent workspace and cannot be removed.'}), 403
        
        db.session.delete(project)
        db.session.commit()
        return jsonify({'success': True})
        
    if request.method == 'PUT':
        # Protect the 'Favorite' project from being renamed
        if project.title == "Favorite":
             return jsonify({'error': 'The Favorite project cannot be renamed.'}), 403
             
        data = request.json
        if 'title' in data:
            project.title = data['title']
        if 'description' in data:
            project.description = data['description']
        db.session.commit()
        return jsonify({'success': True})

@api_bp.route('/projects/<int:project_id>/export', methods=['POST'])
@login_required
def export_project(project_id):
    project = Project.query.get_or_404(project_id)
    if project.owner_id != current_user.id and current_user not in project.members:
        return jsonify({'error': 'Unauthorized'}), 403
        
    if not project.share_code:
        if project.owner_id == current_user.id:
            project.share_code = str(uuid.uuid4())
            db.session.commit()
        else:
            return jsonify({'error': 'Share code not generated yet. Ask the owner to generate it.'}), 400
        
    return jsonify({'share_code': project.share_code})

@api_bp.route('/projects/import', methods=['POST'])
@login_required
def import_project():
    data = request.json
    code = data.get('share_code')
    sync = data.get('sync', False) 
    
    project = Project.query.filter_by(share_code=code).first()
    if not project:
        return jsonify({'error': 'Invalid share code'}), 404
    
    if project.owner_id == current_user.id:
        return jsonify({'error': 'You already own this project.'}), 400

    if sync:
        if current_user not in project.members:
            project.members.append(current_user)
            db.session.commit()
        return jsonify({'success': True, 'message': 'Project synced.', 'id': project.id})
    else:
        if Project.query.filter_by(owner_id=current_user.id).count() >= 5:
             return jsonify({'error': 'Project limit reached.'}), 403
             
        new_proj = Project(
            title=f"{project.title} - Forked", 
            description=project.description, 
            owner_id=current_user.id
        )
        db.session.add(new_proj)
        db.session.commit()
        
        for fav in project.favorites:
            new_fav = Favorite(
                user_id=current_user.id,
                project_id=new_proj.id,
                set_id=fav.set_id,
                brand_name=fav.brand_name,
                manufacturer_name=fav.manufacturer_name,
                effective_time=fav.effective_time
            )
            db.session.add(new_fav)
            
        for comp in project.comparisons:
            new_comp = FavoriteComparison(
                user_id=current_user.id,
                project_id=new_proj.id,
                set_ids=comp.set_ids,
                title=comp.title
            )
            db.session.add(new_comp)
            
        db.session.commit()
        return jsonify({'success': True, 'message': 'Project imported successfully.', 'id': new_proj.id})

@api_bp.route('/projects/move_items', methods=['POST'])
@login_required
def api_move_items():
    data = request.json
    target_project_id = data.get('target_project_id')
    item_type = data.get('type') # 'label' or 'comparison'
    ids = data.get('ids', []) 
    
    if not target_project_id:
        return jsonify({'error': 'Target project required'}), 400
        
    project = Project.query.get(target_project_id)
    if not project:
         return jsonify({'error': 'Project not found'}), 404
         
    if project.owner_id != current_user.id and current_user not in project.members:
        return jsonify({'error': 'Unauthorized access to target project'}), 403

    count = 0
    if item_type == 'label':
        for set_id in ids:
            source_project_id = data.get('source_project_id')
            if not source_project_id:
                 continue
            
            fav = Favorite.query.filter_by(user_id=current_user.id, set_id=set_id, project_id=source_project_id).first()
            if fav:
                existing = Favorite.query.filter_by(user_id=current_user.id, set_id=set_id, project_id=target_project_id).first()
                if existing:
                    db.session.delete(fav)
                else:
                    fav.project_id = target_project_id
                count += 1
                
    elif item_type == 'comparison':
        for comp_id in ids:
            comp = FavoriteComparison.query.filter_by(id=comp_id, user_id=current_user.id).first()
            if comp:
                comp.project_id = target_project_id
                count += 1
                
    db.session.commit()
    return jsonify({'success': True, 'moved_count': count})

@api_bp.route('/favorites_data')
@login_required
def api_my_favorites():
    project_id = request.args.get('project_id', type=int)
    user_obj = current_user._get_current_object()
    
    if project_id:
        project = Project.query.get(project_id)
        if not project or (project.owner_id != user_obj.id and user_obj not in project.members):
             return jsonify({'error': 'Unauthorized'}), 403
             
        # DEDUPLICATION LOGIC:
        # If this is the owner accessing, we clean up any duplicate set_ids that might have leaked in
        if project.owner_id == user_obj.id:
            all_favs = Favorite.query.filter_by(project_id=project_id).all()
            seen_set_ids = set()
            duplicates_removed = False
            for f in all_favs:
                if f.set_id in seen_set_ids:
                    db.session.delete(f)
                    duplicates_removed = True
                else:
                    seen_set_ids.add(f.set_id)
            if duplicates_removed:
                db.session.commit()

        favorites = Favorite.query.filter_by(project_id=project_id).order_by(Favorite.timestamp.desc()).all()
        favorite_comparisons = FavoriteComparison.query.filter_by(project_id=project_id).order_by(FavoriteComparison.timestamp.desc()).all()
        
        return jsonify({
            'favorites': [{
                'set_id': fav.set_id,
                'brand_name': fav.brand_name,
                'generic_name': fav.generic_name,
                'manufacturer_name': fav.manufacturer_name,
                'market_category': fav.market_category,
                'application_number': fav.application_number,
                'ndc': fav.ndc,
                'effective_time': fav.effective_time,
                'timestamp': fav.timestamp.isoformat(),
                'added_by': fav.user.username
            } for fav in favorites],
            'comparisons': [{
                'id': comp.id,
                'set_ids': json.loads(comp.set_ids),
                'title': comp.title,
                'timestamp': comp.timestamp.isoformat(),
                'added_by': comp.user.username
            } for comp in favorite_comparisons],
            'duplicates_removed': duplicates_removed
        })
    else:
        # Global view (all projects) - less common but same logic
        favorites = Favorite.query.filter_by(user_id=user_obj.id).order_by(Favorite.timestamp.desc()).all()
        favorite_comparisons = FavoriteComparison.query.filter_by(user_id=user_obj.id).order_by(FavoriteComparison.timestamp.desc()).all()
        
        return jsonify({
            'favorites': [{
                'set_id': fav.set_id,
                'brand_name': fav.brand_name,
                'generic_name': fav.generic_name,
                'manufacturer_name': fav.manufacturer_name,
                'market_category': fav.market_category,
                'application_number': fav.application_number,
                'ndc': fav.ndc,
                'effective_time': fav.effective_time,
                'timestamp': fav.timestamp.isoformat(),
                'added_by': fav.user.username
            } for fav in favorites],
            'comparisons': [{
                'id': comp.id,
                'set_ids': json.loads(comp.set_ids),
                'title': comp.title,
                'timestamp': comp.timestamp.isoformat(),
                'added_by': comp.user.username
            } for comp in favorite_comparisons],
            'duplicates_removed': False
        })

@api_bp.route('/check_favorites_batch', methods=['POST'])
def api_check_favorites_batch():
    if not current_user.is_authenticated:
        return jsonify({})
    
    data = request.get_json()
    set_ids = data.get('set_ids', [])
    project_id = data.get('project_id')
    
    if not set_ids:
        return jsonify({})

    if not project_id:
        default_proj = Project.query.filter_by(owner_id=current_user.id, title="Favorite").first()
        if default_proj:
            project_id = default_proj.id
    
    # Check PROJECT-WIDE
    favorites = Favorite.query.filter(
        Favorite.project_id == project_id,
        Favorite.set_id.in_(set_ids)
    ).all()
    
    found_ids = {fav.set_id: True for fav in favorites}
    
    result = {}
    for sid in set_ids:
        result[sid] = found_ids.get(sid, False)
        
    return jsonify(result)

@api_bp.route('/my_labelings', methods=['GET'])
@login_required
def get_my_labelings():
    try:
        # Implement logic to fetch user's projects or labelings
        # For now, return a simple response
        return jsonify({'success': True, 'message': 'My Labelings endpoint'})
    except Exception as e:
        logger.error(f"Error in get_my_labelings: {e}")
        return jsonify({'error': 'Failed to fetch my labelings'}), 500

# --- FAERS & Assessment ---
@api_bp.route('/faers/<path:drug_name>')
def api_faers_data(drug_name):
    limit = request.args.get('limit', default=20, type=int)
    data = get_faers_data(drug_name, limit=limit)
    if not data:
        return jsonify({'error': 'Could not fetch data'}), 500
    
    # Enrich with MedDRA Data
    if 'reactions' in data:
        data['reactions'] = enrich_faers_with_meddra(data['reactions'])
    if 'reactions_serious' in data:
        data['reactions_serious'] = enrich_faers_with_meddra(data['reactions_serious'])
    if 'reactions_non_serious' in data:
        data['reactions_non_serious'] = enrich_faers_with_meddra(data['reactions_non_serious'])

    return jsonify(data)

@api_bp.route('/faers/trends', methods=['POST'])
def api_faers_trends():
    data = request.get_json()
    drug_name = data.get('drug_name')
    terms = data.get('terms', [])

    if not drug_name or not terms:
        return jsonify({'error': 'Missing drug_name or terms'}), 400

    base_url = "https://api.fda.gov/drug/event.json"
    search_term = f'(patient.drug.openfda.brand_name:"{drug_name}" OR patient.drug.openfda.generic_name:"{drug_name}")'
    
    current_year = datetime.now().year
    start_date = f"{current_year - 5}0101"
    end_date = f"{current_year}1231"
    
    trends = {}

    for term in terms:
        try:
            term_search = f'{search_term} AND patient.reaction.reactionmeddrapt.exact:"{term}" AND receiptdate:[{start_date} TO {end_date}]'
            params = {
                'search': term_search,
                'count': 'receiptdate'
            }
            if Config.OPENFDA_API_KEY:
                params['api_key'] = Config.OPENFDA_API_KEY
            
            resp = requests.get(base_url, params=params)
            if resp.status_code == 200:
                raw_dates = resp.json().get('results', [])
                raw_dates.sort(key=lambda x: x.get('time', ''))
                trends[term] = raw_dates
            else:
                trends[term] = []
        except Exception as e:
            logger.error(f"Error fetching trend for {term}: {e}")
            trends[term] = []

    return jsonify({'trends': trends})

def generic_assessment_route(set_id, assessment_model, pt_terms, prompt, keyword_check_fn):
    # Check existing
    try:
        # Check ToxAgent FIRST (Consolidated Table)
        tox_agent = ToxAgent.query.filter_by(set_id=set_id, current='Yes').first()
        
        report_field_map = {
            DiliAssessment: 'dili_report',
            DictAssessment: 'dict_report',
            DiriAssessment: 'diri_report'
        }
        
        field_name = report_field_map.get(assessment_model)
        existing_report = None
        timestamp = None
        
        def is_complete(report):
            if not report: return False
            if '<!-- AI response did not contain' in report: return False
            if '<div' in report or ('<!--' in report and 'evidence found' in report):
                return True
            return False

        if tox_agent and field_name:
            report_val = getattr(tox_agent, field_name)
            if is_complete(report_val):
                existing_report = report_val
                timestamp = tox_agent.last_updated.isoformat()
        
        # Fallback to individual tables if not found in ToxAgent
        if not existing_report:
            assessment = assessment_model.query.filter_by(set_id=set_id).first()
            if assessment and is_complete(assessment.report_content):
                existing_report = assessment.report_content
                timestamp = assessment.timestamp.isoformat()
            
    except Exception as e:
        logger.error(f"Database error in generic_assessment_route: {e}")
        existing_report = None
        timestamp = None
    
    # FAERS data check
    faers_data = []
    meta = get_label_metadata(set_id)
    if meta and meta.get('brand_name') and meta.get('brand_name') != 'N/A':
        brand_name = meta['brand_name'].split(',')[0].strip()
        base_url = "https://api.fda.gov/drug/event.json"
        
        search_query = keyword_check_fn(brand_name)
        params = {
            'search': search_query,
            'count': 'patient.reaction.reactionmeddrapt.exact',
            'limit': 1000
        }
        if Config.OPENFDA_API_KEY:
            params['api_key'] = Config.OPENFDA_API_KEY
            
        try:
            resp = requests.get(base_url, params=params)
            if resp.status_code == 200:
                raw_results = resp.json().get('results', [])
                faers_data = [item for item in raw_results if item['term'].upper() in pt_terms]
            else:
                logger.warning(f"FAERS query failed: {resp.status_code}")
        except Exception as e:
            logger.error(f"FAERS error: {e}")

    return jsonify({
        'faers_data': faers_data, 
        'existing_assessment': existing_report,
        'assessment_timestamp': timestamp
    })

def run_assessment_logic(set_id, assessment_model, prompt):
    xml_content = get_label_xml(set_id)
    if not xml_content:
        return jsonify({'error': "Could not retrieve label data"}), 404

    try:
        ns = {'v3': 'urn:hl7-org:v3'}
        xml_string_cleaned = xml_content.encode('ascii', 'ignore').decode('ascii')
        root = ET.fromstring(xml_string_cleaned)
        
        target_code_map = {
            '34066-1': 'Boxed Warning',
            '34070-3': 'Contraindications',
            '34071-1': 'Warnings and Precautions',
            '43685-7': 'Warnings and Precautions',
            '34084-4': 'Adverse Reactions',
            '34073-7': 'Drug Interactions',
            '43684-0': 'Use in Specific Populations'
        }
        
        aggregated_text = ""
        processed_ids = set()

        for section in root.findall(".//v3:section", ns):
            code_el = section.find("v3:code", ns)
            if code_el is not None:
                code_val = code_el.get('code')
                if code_val in target_code_map:
                    sec_id = section.get('ID', str(uuid.uuid4()))
                    if sec_id in processed_ids: continue
                    processed_ids.add(sec_id)
                    
                    section_name = target_code_map[code_val]
                    text_content = "".join(section.itertext()).strip()
                    if len(text_content) > 10:
                        aggregated_text += f"\n\n### {section_name}\n{text_content}"

        if not aggregated_text:
            return jsonify({'assessment_report': "No relevant sections found."})

        try:
            user_obj = current_user._get_current_object() if current_user.is_authenticated else None
            response_text = generate_assessment(user_obj, prompt, aggregated_text)

            html_matches = re.findall(r'(<div class="label-section">[\s\S]*?</div>)', response_text, re.DOTALL)
    
            if html_matches:
                # If one or more blocks are found, join them together. This is the clean report.
                clean_report = "\n".join(html_matches)
            else:
                # Check for "no evidence" comments specifically for each type
                if '<!-- No DILI evidence found' in response_text:
                    clean_report = '<!-- No DILI evidence found in label -->'
                elif '<!-- No DICT evidence found' in response_text:
                    clean_report = '<!-- No DICT evidence found in label -->'
                elif '<!-- No DIRI evidence found' in response_text:
                    clean_report = '<!-- No DIRI evidence found in label -->'
                else:
                    # Fallback for unexpected responses
                    clean_report = '<!-- AI response did not contain valid HTML report. -->'

            assessment = assessment_model.query.filter_by(set_id=set_id).first()
            if assessment:
                assessment.report_content = clean_report
                assessment.timestamp = datetime.utcnow()
            else:
                assessment = assessment_model(set_id=set_id, report_content=clean_report)
                db.session.add(assessment)
            
            # Update ToxAgent Table
            try:
                meta = extract_metadata_from_xml(xml_content) or {}
                new_eff_time = meta.get('effective_time')
                
                tox_agent = ToxAgent.query.filter_by(set_id=set_id, current='Yes').first()
                
                # Version Change Logic: If the EFF_TIME is different, we need a new record
                if tox_agent and tox_agent.spl_effective_time != new_eff_time:
                    # Mark all existing for this set_id as not current
                    ToxAgent.query.filter_by(set_id=set_id).update({"current": "No"})
                    tox_agent = None # Force creation of a new 'Yes' record below

                # Metadata for ToxAgent if new or version changed
                if not tox_agent:
                    tox_agent = ToxAgent(
                        set_id=set_id,
                        brand_name=meta.get('brand_name'),
                        generic_name=meta.get('generic_name'),
                        manufacturer=meta.get('manufacturer_name'),
                        spl_effective_time=new_eff_time,
                        is_plr=1 if meta.get('label_format') == 'PLR' else 0,
                        current='Yes',
                        status='pending'
                    )
                    db.session.add(tox_agent)

                report_field_map = {
                    DiliAssessment: 'dili_report',
                    DictAssessment: 'dict_report',
                    DiriAssessment: 'diri_report'
                }
                field_name = report_field_map.get(assessment_model)
                if field_name:
                    setattr(tox_agent, field_name, clean_report)
                
                # Update general fields if they are missing
                if not tox_agent.brand_name: tox_agent.brand_name = meta.get('brand_name')
                if not tox_agent.generic_name: tox_agent.generic_name = meta.get('generic_name')
                
                tox_agent.last_updated = datetime.utcnow()
                tox_agent.status = 'completed'
            except Exception as tox_err:
                logger.error(f"Failed to update ToxAgent during manual assessment: {tox_err}")

            db.session.commit()
            return jsonify({'assessment_report': response_text})

        except Exception as e:
            db.session.rollback()
            return jsonify({'error': f"AI Analysis Failed: {str(e)}"}), 500

    except Exception as e:
        logger.error(f"Parsing error: {e}")
        return jsonify({'error': "Error processing request"}), 500


@api_bp.route('/dili/faers/<set_id>')
def api_dili_faers(set_id):
    def check_fn(brand):
        return f'patient.drug.medicinalproduct:"{brand}" AND (patient.reaction.reactionmeddrapt:liver OR patient.reaction.reactionmeddrapt:hepatic)'
    return generic_assessment_route(set_id, DiliAssessment, DILI_PT_TERMS, DILI_prompt, check_fn)

@api_bp.route('/dili/assess/<set_id>')
def api_dili_assess(set_id):
    return run_assessment_logic(set_id, DiliAssessment, DILI_prompt)

@api_bp.route('/dict/faers/<set_id>')
def api_dict_faers(set_id):
    def check_fn(brand):
        return f'patient.drug.medicinalproduct:"{brand}" AND (patient.reaction.reactionmeddrapt:cardiac OR patient.reaction.reactionmeddrapt:heart OR patient.reaction.reactionmeddrapt:myocardial)'
    return generic_assessment_route(set_id, DictAssessment, DICT_PT_TERMS, DICT_prompt, check_fn)

@api_bp.route('/dict/assess/<set_id>')
def api_dict_assess(set_id):
    return run_assessment_logic(set_id, DictAssessment, DICT_prompt)

@api_bp.route('/diri/faers/<set_id>')
def api_diri_faers(set_id):
    def check_fn(brand):
        return f'patient.drug.medicinalproduct:"{brand}" AND (patient.reaction.reactionmeddrapt:renal OR patient.reaction.reactionmeddrapt:kidney)'
    return generic_assessment_route(set_id, DiriAssessment, DIRI_PT_TERMS, DIRI_prompt, check_fn)

@api_bp.route('/diri/assess/<set_id>')
def api_diri_assess(set_id):
    return run_assessment_logic(set_id, DiriAssessment, DIRI_prompt)

@api_bp.route('/pgx/assess/<set_id>')
def api_pgx_assess(set_id):
    try:
        force_refresh = request.args.get('refresh') == 'true'
        user_obj = current_user._get_current_object() if current_user.is_authenticated else None
        result = run_pgx_assessment(set_id, user=user_obj, force_refresh=force_refresh)
        if 'error' in result:
            return jsonify({'error': result['error']}), 500
        return jsonify(result)
    except Exception as e:
        logger.error(f"Critical error in api_pgx_assess: {e}")
        return jsonify({'error': 'Internal Server Error during PGx assessment'}), 500


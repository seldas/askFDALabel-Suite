from flask import Blueprint, render_template, request, redirect, url_for, jsonify, send_from_directory, current_app, send_file
from flask_login import login_required, current_user
import os
import zipfile
import re
import json
from io import BytesIO
from openpyxl import Workbook
from openpyxl.utils import get_column_letter
from datetime import datetime
from collections import Counter

from database import db, Favorite, Annotation, ToxAgent
from dashboard.services.fdalabel_db import FDALabelDBService
from dashboard.services.xml_handler import (
    parse_spl_xml,
    extract_metadata_from_xml,
)
from dashboard.services.fda_client import (
    get_label_metadata,
    get_label_xml,
    find_labels,
    find_labels_by_set_ids
)

from dashboard.config import Config
import uuid
from openpyxl import load_workbook

main_bp = Blueprint('main', __name__)

@main_bp.route('/favicon.ico')
def favicon():
    return send_from_directory(os.path.join(current_app.root_path, 'static'),
                               'favicon.svg', mimetype='image/svg+xml')

@main_bp.route('/')
def index():
    """ Redirects to the Next.js dashboard. """
    return redirect('/dashboard')


@main_bp.route('/info')
def info():
    """ Renders the information page about the tool. """
    return render_template('info.html')


@main_bp.route('/upload_label', methods=['POST'])
def upload_label():
    """
    Handles uploading of an XML or ZIP file containing an SPL label.
    Extracts, validates (PLR/Non-PLR), and stores the label for comparison.
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    filename = file.filename.lower()
    if not (filename.endswith('.xml') or filename.endswith('.zip')):
        return jsonify({'error': 'Invalid file format. Please upload .xml or .zip.'}), 400

    # Read current set_ids to validate against
    current_set_ids = request.form.getlist('current_set_ids[]') # AJAX sends array as []
    
    xml_content = None
    
    try:
        if filename.endswith('.zip'):
            with zipfile.ZipFile(file) as z:
                # Find first XML file
                xml_files = [f for f in z.namelist() if f.lower().endswith('.xml')]
                if not xml_files:
                    return jsonify({'error': 'No XML file found in the ZIP archive.'}), 400
                
                with z.open(xml_files[0]) as f:
                    xml_content = f.read().decode('utf-8')
        else:
            xml_content = file.read().decode('utf-8')
            
        if not xml_content:
             return jsonify({'error': 'Empty file content.'}), 400

        # Extract metadata
        meta = extract_metadata_from_xml(xml_content)
        if not meta or not meta.get('set_id'):
            return jsonify({'error': 'Could not parse SPL metadata or Set ID from the XML.'}), 400

        new_label_format = meta.get('label_format')
        new_set_id = meta.get('set_id')

        # VALIDATION: Check against existing labels
        if current_set_ids:
            # We need to check the format of at least one existing label
            # We can use get_label_metadata which now checks local first
            existing_meta = get_label_metadata(current_set_ids[0])
            if existing_meta:
                existing_format = existing_meta.get('label_format')
                if existing_format and new_label_format and existing_format != new_label_format:
                     return jsonify({
                         'error': f"Format mismatch: The uploaded label is '{new_label_format}', but you are comparing '{existing_format}' labels. Please upload a compatible label."
                     }), 400

        # Save to local storage
        save_path = os.path.join(Config.UPLOAD_FOLDER, f"{new_set_id}.xml")
        with open(save_path, 'w', encoding='utf-8') as f:
            f.write(xml_content)
            
        return jsonify({'success': True, 'set_id': new_set_id})

    except Exception as e:
        current_app.logger.error(f"Error processing upload: {e}")
        return jsonify({'error': f"Error processing file: {str(e)}"}), 500

@main_bp.route('/import_fdalabel', methods=['POST'])
def import_fdalabel():
    """
    Handles importing drug labels from an FDALabel Excel file.
    Parses the Excel and redirects to the selection page with the data.
    """
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No selected file'}), 400

    if not file.filename.lower().endswith('.xlsx'):
        return jsonify({'success': False, 'error': 'Invalid file format. Please upload .xlsx'}), 400

    try:
        wb = load_workbook(file, data_only=True)
        sheet = wb.active
        rows = list(sheet.iter_rows(values_only=True))
        
        if not rows:
            return jsonify({'success': False, 'error': 'The Excel file is empty.'}), 400
            
        columns = rows[0]
        # Create a mapping of column name to index, normalizing whitespace
        col_map = {str(name).strip(): i for i, name in enumerate(columns) if name}
        
        # Helper to get value from multiple possible column names
        def get_val_flex(row, candidates):
            for c in candidates:
                if c in col_map:
                    idx = col_map[c]
                    if idx < len(row) and row[idx] is not None:
                        return str(row[idx]).strip()
            return 'n/a'

        # Check for SET ID (essential)
        set_id_candidates = ['SET ID', 'SET_ID', 'Set ID']
        has_set_id = any(c in col_map for c in set_id_candidates)
        
        if not has_set_id:
            return jsonify({'success': False, 'error': 'Missing required column: SET ID'}), 400

        labels = []
        for row in rows[1:]:
            set_id = get_val_flex(row, set_id_candidates)
            if not set_id or set_id.lower() == 'n/a':
                continue
            
            # Map Excel columns to our label structure
            brand_name = get_val_flex(row, ['Trade Name', 'PRODUCT_NAMES', 'trade name', 'Product Names'])
            generic_name = get_val_flex(row, ['Generic/Proper Name(s)', 'PRODUCT_NORMD_GENERIC_NAMES', 'generic name', 'Generic Name'])
            company = get_val_flex(row, ['Company', 'AUTHOR_ORG_NORMD_NAME', 'manufacturer', 'Manufacturer', 'AUTHOR_ORG_NAME'])
            effective_date = get_val_flex(row, ['SPL Effective Date (YYYY/MM/DD)', 'EFF_TIME', 'effective date', 'Effective Date'])
            app_num = get_val_flex(row, ['Application Number(s)', 'APPR_NUM', 'application number', 'Approval Number'])
            labeling_type = get_val_flex(row, ['Labeling Type', 'LABELING_TYPE', 'labeling type', 'Doc Type'])
            ndcs = get_val_flex(row, ['NDC(s)', 'NDC_CODES', 'ndc', 'NDC'])
            marketing_category = get_val_flex(row, ['Marketing Category', 'MARKET_CATEGORIES', 'marketing category'])
            
            # Additional FDALabel specific columns
            dosage_forms = get_val_flex(row, ['Dosage Form(s)', 'DOSAGE_FORMS'])
            routes = get_val_flex(row, ['Route(s) of Administration', 'ROUTES'])
            epc = get_val_flex(row, ['Established Pharmacologic Class(es)', 'EPC'])
            active_ingredients = get_val_flex(row, ['Active Ingredient(s)', 'ACTIVE_INGREDIENTS', 'ACT_INGR_NAMES'])
            
            # Links
            fdalabel_link = get_val_flex(row, ['FDALabel Link'])
            dailymed_spl_link = get_val_flex(row, ['DailyMed SPL Link'])
            dailymed_pdf_link = get_val_flex(row, ['DailyMed PDF Link'])

            # Simplified product type for UI badges
            labeling_type_upper = (labeling_type or "").upper()
            marketing_category_upper = (marketing_category or "").upper()
            prod_type = 'Rx'
            if 'OTC' in labeling_type_upper or 'OTC' in marketing_category_upper:
                prod_type = 'OTC'

            labels.append({
                'set_id': set_id,
                'brand_name': brand_name,
                'generic_name': generic_name,
                'manufacturer_name': company,
                'effective_time': effective_date,
                'label_format': None,
                'labeling_type': labeling_type,
                'application_number': app_num,
                'product_type': prod_type,
                'ndc': ndcs,
                'marketing_category': marketing_category,
                'dosage_forms': dosage_forms,
                'routes': routes,
                'epc': epc,
                'active_ingredients': active_ingredients,
                'fdalabel_link': fdalabel_link,
                'dailymed_spl_link': dailymed_spl_link,
                'dailymed_pdf_link': dailymed_pdf_link,
                'source': 'excel'
            })

        if not labels:
            return jsonify({'success': False, 'error': 'No valid labels found in the Excel file.'}), 400

        # Store in temporary file
        import_id = str(uuid.uuid4())
        import_filename = f"import_{import_id}.json"
        import_path = os.path.join(Config.UPLOAD_FOLDER, import_filename)
        
        with open(import_path, 'w', encoding='utf-8') as f:
            json.dump(labels, f)

        return jsonify({
            'success': True, 
            'redirect_url': url_for('main.search', import_id=import_id)
        })

    except Exception as e:
        current_app.logger.error(f"Error importing Excel: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@main_bp.route('/search', methods=['GET', 'POST'])
def search():
    """ Handles drug name search with pagination. """
    if request.method == 'POST':
        drug_name = request.form.get('drug_name')
        if not drug_name:
            return "Please enter a drug name.", 400
        # Redirect to a GET request to make the URL bookmarkable
        return redirect(url_for('main.search', drug_name=drug_name))

    drug_name = request.args.get('drug_name')
    batch_id_search = request.args.get('batch_id_search')
    import_id = request.args.get('import_id')

    if not drug_name and not batch_id_search and not import_id:
        return redirect(url_for('main.index'))

    page = request.args.get('page', 1, type=int)
    view = request.args.get('view')
    
    # Limitation Logic: OpenFDA = 10, FDALabel/Internal = 100000
    from dashboard.services.fdalabel_db import FDALabelDBService
    if FDALabelDBService.check_connectivity() or import_id:
        limit = 100000
    else:
        limit = 10 # OpenFDA limit
        
    skip = (page - 1) * limit

    if import_id:
        import_path = os.path.join(Config.UPLOAD_FOLDER, f"import_{import_id}.json")
        if os.path.exists(import_path):
            with open(import_path, 'r', encoding='utf-8') as f:
                all_imported_labels = json.load(f)
            total = len(all_imported_labels)
            labels = all_imported_labels[skip : skip + limit]
            
            # Enrich with favorite status if user logged in
            if current_user.is_authenticated:
                active_project_id = None # Logic to determine project? 
                # For now we check the "Favorite" or a specified project if we had one
                # Usually selection.html JS handles the "check favorites batch" call later, 
                # but if we want it correct on first load:
                
                # Check favorites for these SET_IDs in any of user's projects (or primary)
                # Let's just set them all to False and let the JS update it to be safe, 
                # or do a batch check here.
                set_ids = [l['set_id'] for l in labels]
                favs = Favorite.query.filter(Favorite.user_id == current_user.id, Favorite.set_id.in_(set_ids)).all()
                fav_ids = {f.set_id for f in favs}
                for l in labels:
                    l['is_favorite'] = l['set_id'] in fav_ids

            drug_name_display = "Excel Import"
            page_title = "Imported FDALabel Results"
        else:
            return "Import session expired or not found.", 404
    elif batch_id_search:
        ids_list = [sid.strip() for sid in batch_id_search.split(',') if sid.strip()]
        labels, total = find_labels_by_set_ids(ids_list, skip=skip, limit=limit)
        drug_name_display = "Identifier Batch Search"
        page_title = "Batch Search Results"
    else:
        labels, total = find_labels(drug_name, skip=skip, limit=limit)
        drug_name_display = drug_name
        page_title = f"Search Results for \"{drug_name}\""

    # Determine default view if not specified
    if not request.args.get('view'):
        if total > 5 or batch_id_search or import_id:
             view = 'table'
        else:
             view = 'panel'

    if not labels and page == 1:
        # No results found
        if request.headers.get('Accept') == 'application/json' or request.args.get('json') == '1':
            return jsonify({
                "drug_name": drug_name_display,
                "page_title": page_title,
                "labels": [],
                "total": 0,
                "page": page,
                "limit": limit,
                "view": view
            })
        return render_template('selection.html', drug_name=drug_name_display, page_title=page_title, labels=None, total=0, page=page, limit=limit, view=view)

    # If multiple results (or a batch search, or single result), show the selection page
    is_internal = FDALabelDBService.check_connectivity()
    
    if request.headers.get('Accept') == 'application/json' or request.args.get('json') == '1':
        return jsonify({
            "drug_name": drug_name_display,
            "page_title": page_title,
            "labels": labels,
            "total": total,
            "page": page,
            "limit": limit,
            "view": view,
            "is_internal": is_internal,
            "batch_id_search": batch_id_search,
            "import_id": import_id
        })

    return render_template('selection.html', drug_name=drug_name_display, page_title=page_title, labels=labels, total=total, page=page, limit=limit, view=view, is_internal=is_internal)


@main_bp.route('/label/<set_id>')
def view_label(set_id):
    """ Displays the parsed SPL label for a given set_id. """
    drug_name_from_query = request.args.get('drug_name', '')
    import_id = request.args.get('import_id')
    
    label_xml_raw = get_label_xml(set_id)
    if not label_xml_raw:
        return "Could not fetch the label from DailyMed.", 500

    doc_title, sections, fallback_html, highlights, table_of_contents = parse_spl_xml(label_xml_raw, set_id)
    
    # Clean the original XML title (remove Highlights disclaimer) early
    original_title = doc_title
    if "These highlights do not include all the information" in doc_title:
        original_title = re.sub(r'^These highlights do not include.*?safely and effectively\.\s*(See full prescribing information for.*?\.)?\s*', '', doc_title, flags=re.IGNORECASE | re.DOTALL).strip()

    # Use the drug name from the query for the title, but fall back to the parsed title
    display_drug_name = drug_name_from_query if drug_name_from_query else original_title

    # Load saved annotations for this label (User-specific OR Public)
    saved_annotations = []
    from sqlalchemy import or_
    
    query = Annotation.query.filter(Annotation.set_id == set_id)
    
    if current_user.is_authenticated:
        query = query.filter(or_(Annotation.user_id == current_user.id, Annotation.is_public == True))
    else:
        query = query.filter(Annotation.is_public == True)
        
    user_annotations = query.all()
    
    for ann in user_annotations:
        saved_annotations.append({
            'id': str(ann.id), # Frontend expects string ID
            'section_number': ann.section_number,
            'question': ann.question,
            'answer': ann.answer,
            'keywords': json.loads(ann.keywords) if ann.keywords else [],
            'is_public': getattr(ann, 'is_public', False)
        })

    # Directly extract metadata from the XML we just fetched/read
    # This is more robust than get_label_metadata which might hit openFDA and return N/A
    metadata = extract_metadata_from_xml(label_xml_raw)
    
    # If our local parser failed but we have a set_id, try fallback to DB/API for augmentation
    if not metadata or (metadata.get('brand_name') == 'Unknown Drug' and metadata.get('generic_name') == 'Unknown Generic'):
        ext_metadata = get_label_metadata(set_id, import_id=import_id)
        if ext_metadata:
            if not metadata: 
                metadata = ext_metadata
            else:
                # Merge: prioritize DB/API data if XML parse was incomplete
                for k, v in ext_metadata.items():
                    if not metadata.get(k) or metadata.get(k) in ['N/A', 'Unknown Drug', 'Unknown Generic', 'Unknown Manufacturer']:
                        metadata[k] = v

    brand_name = metadata.get('brand_name') if metadata and metadata.get('brand_name') != 'N/A' else None
    generic_name = metadata.get('generic_name') if metadata and metadata.get('generic_name') != 'N/A' else None
    manufacturer_name = metadata.get('manufacturer_name') if metadata and metadata.get('manufacturer_name') != 'N/A' else None
    effective_time = metadata.get('effective_time') if metadata else ''
    label_format = metadata.get('label_format') if metadata else None
    ndc = metadata.get('ndc', 'N/A') if metadata else 'N/A'
    application_number = metadata.get('application_number', 'N/A') if metadata else 'N/A'
    version_number = metadata.get('version_number') if metadata else None
    document_type = metadata.get('document_type') if metadata else None
    has_boxed_warning = metadata.get('has_boxed_warning') if metadata else False
    
    clean_app_num = None
    if application_number and application_number != 'N/A':
        # Take the first one if multiple
        first_app = application_number.split(',')[0].strip()
        # Extract just the digits (e.g. ANDA077844 -> 077844)
        clean_app_num = ''.join(filter(str.isdigit, first_app))

    # Construct the display title: Brand Name - Generic Name, Company
    if brand_name and brand_name != 'Unknown Drug':
        display_parts = [brand_name]
        if generic_name and generic_name != 'Unknown Generic':
            display_parts.append(f"- {generic_name}")
        
        display_drug_name = " ".join(display_parts)
        if manufacturer_name:
            display_drug_name += f", {manufacturer_name}"
    else:
        # If metadata fetch failed or returned Unknown, try generic_name first, then query param, then doc_title
        if generic_name and generic_name != 'Unknown Generic':
            display_drug_name = generic_name
        else:
            display_drug_name = drug_name_from_query if drug_name_from_query else original_title

    # Clean up name for FAERS search: LITERALLY use generic name if available
    # Use the pre-cleaned faers_search_name from our improved xml_handler if available
    if metadata and metadata.get('faers_search_name') and metadata.get('faers_search_name') != 'Unknown Generic':
        faers_drug_name = metadata.get('faers_search_name')
    else:
        faers_drug_name = generic_name if generic_name and generic_name != 'Unknown Generic' else brand_name
    
    if not faers_drug_name or faers_drug_name == 'Unknown Drug' or faers_drug_name == 'Unknown Generic':
        # Last resort fallback, but try to clean it
        temp_name = drug_name_from_query if drug_name_from_query else original_title
        if temp_name and len(temp_name) > 80: 
             paren_match = re.search(r'\(([^)]+)\)', temp_name)
             if paren_match:
                 faers_drug_name = paren_match.group(1).strip()
             else:
                 faers_drug_name = temp_name[:50]
        else:
            faers_drug_name = temp_name

    # Final sanitization for FAERS (remove everything after comma or semicolon)
    if faers_drug_name and faers_drug_name != 'N/A':
        faers_drug_name = re.split(r'[,;]', faers_drug_name)[0].strip()
        faers_drug_name = re.sub(r'\d+(\.\d+)?\s*(mg|mcg|g|ml|%|unit|iu)\b.*$', '', faers_drug_name, flags=re.IGNORECASE).strip()
        faers_drug_name = re.sub(r'\s+(tablet|capsule|injection|cream|ointment|gel|solution|suspension|spray|inhaler|powder).*$', '', faers_drug_name, flags=re.IGNORECASE).strip()

    # Get ToxAgent status for frontend optimization
    tox_summary = {'dili': False, 'dict': False, 'diri': False}
    try:
        tox_agent = ToxAgent.query.filter_by(set_id=set_id, current='Yes').first()
        if tox_agent:
            tox_summary['dili'] = bool(tox_agent.dili_report and '<div' in tox_agent.dili_report)
            tox_summary['dict'] = bool(tox_agent.dict_report and '<div' in tox_agent.dict_report)
            tox_summary['diri'] = bool(tox_agent.diri_report and '<div' in tox_agent.diri_report)
            tox_summary['last_updated'] = tox_agent.last_updated.isoformat()
    except Exception as e:
        current_app.logger.error(f"Error fetching tox summary: {e}")

    if request.headers.get('Accept') == 'application/json' or request.args.get('json') == '1':
        return jsonify({
            'drug_name': display_drug_name,
            'brand_name': brand_name,
            'generic_name': generic_name,
            'original_title': original_title,
            'faers_drug_name': faers_drug_name,
            'manufacturer_name': manufacturer_name or '',
            'effective_time': effective_time,
            'label_format': label_format,
            'ndc': ndc,
            'application_number': application_number,
            'version_number': version_number,
            'document_type': document_type,
            'has_boxed_warning': has_boxed_warning,
            'clean_app_num': clean_app_num,
            'original_search': drug_name_from_query,
            'sections': sections, 
            'fallback_html': fallback_html, 
            'highlights': highlights, 
            'table_of_contents': table_of_contents,
            'label_xml_raw': label_xml_raw,
            'set_id': set_id,
            'metadata': metadata,
            'saved_annotations': saved_annotations,
            'tox_summary': tox_summary,
            'user_id': current_user.id if current_user.is_authenticated else None
        })

    return render_template('results.html', 
                           drug_name=display_drug_name, 
                           brand_name=brand_name,
                           generic_name=generic_name,
                           original_title=original_title,
                           faers_drug_name=faers_drug_name,
                           manufacturer_name=manufacturer_name or '',
                           effective_time=effective_time,
                           label_format=label_format,
                           ndc=ndc,
                           application_number=application_number,
                           version_number=version_number,
                           document_type=document_type,
                           has_boxed_warning=has_boxed_warning,
                           clean_app_num=clean_app_num,
                           original_search=drug_name_from_query,
                           sections=sections, 
                           fallback_html=fallback_html, 
                           highlights=highlights, 
                           table_of_contents=table_of_contents,
                           label_xml_raw=label_xml_raw,
                           set_id=set_id,
                           metadata=metadata,
                           saved_annotations=saved_annotations)

@main_bp.route('/my_labelings')
@login_required
def my_labelings():
    return render_template('my_labelings.html')

@main_bp.route('/my_favorites')
@login_required
def my_favorites():
    return redirect(url_for('main.my_labelings'))

@main_bp.route('/preferences', methods=['POST'])
@login_required
def preferences():
    current_user.ai_provider = request.form.get('ai_provider')
    current_user.custom_gemini_key = request.form.get('custom_gemini_key')
    current_user.openai_api_key = request.form.get('openai_api_key')
    current_user.openai_base_url = request.form.get('openai_base_url')
    current_user.openai_model_name = request.form.get('openai_model_name')
    
    db.session.commit()
    
    return jsonify({'success': True, 'message': 'Preferences saved successfully!'})

@main_bp.route("/snippet-preview", methods=["GET"])
def snippet_preview():
    """
    Returns basic info (NDA, Set ID, etc.) for a given drug name to be shown in a tooltip.
    """
    drug_name = request.args.get("drug_name", "").strip()
    if not drug_name:
        return jsonify({"error": "Missing drug_name"}), 400

    try:
        drug_info = FDALabelDBService.get_drug_info(drug_name)
        if drug_info is None:
            return jsonify({"found": False, "drug_name": drug_name}), 200

        data = {
            "found": True,
            "set_id": drug_info["set_id"],
            "appr_num": drug_info["appr_num"],
            "product_name": drug_info["product_name"],
            "generic_name": drug_info["generic_name"],
            "active_ingredients": drug_info["active_ingredients"],
            "is_RLD": drug_info["is_RLD"],
            "effective_date": drug_info["effective_date"]
        }
        return jsonify(data)

    except Exception as e:
        current_app.logger.error(f"Error in snippet_preview: {e}")
        return jsonify({"error": str(e)}), 500

## export excel of a selected project.
def _safe_str(v):
    if v is None:
        return ''
    return str(v)

def _fmt_eff_time(v):
    """
    Export as a string that your importer can read.
    Prefer YYYY/MM/DD if we can normalize it; otherwise keep as-is.
    """
    if v is None:
        return ''
    if isinstance(v, datetime):
        return v.strftime('%Y/%m/%d')

    s = str(v).strip()
    if not s:
        return ''

    digits = ''.join([c for c in s if c.isdigit()])
    if len(digits) == 8:
        y, m, d = digits[:4], digits[4:6], digits[6:8]
        return f'{y}/{m}/{d}'

    # try parse ISO-ish strings
    try:
        dt = datetime.fromisoformat(s.replace('Z', ''))
        return dt.strftime('%Y/%m/%d')
    except Exception:
        return s

@main_bp.route('/export_project', methods=['GET'])
@login_required
def export_project():
    """
    Export a project's labels into an FDALabel-importable Excel (.xlsx).

    Import compatibility notes:
      - Includes required "SET ID" column.
      - Uses column headers that your import_fdalabel() recognizes.
      - Includes additional fields too; importer ignores unknown columns.
    """
    project_id = request.args.get('project_id', type=int)
    if not project_id:
        return jsonify({'success': False, 'error': 'Missing project_id'}), 400

    try:
        # Fetch project favorites/labels.
        # Your system stores favorites per-user + per-project, so filter by both.
        favs = Favorite.query.filter_by(user_id=current_user.id, project_id=project_id).all()

        if not favs:
            return jsonify({'success': False, 'error': 'No labels found for this project'}), 404

        # Create workbook
        wb = Workbook()
        ws = wb.active
        ws.title = "FDALabel Export"

        # Headers chosen to match the candidates in import_fdalabel()
        headers = [
            # --- REQUIRED ---
            "SET ID",

            # --- Columns your importer recognizes ---
            "Trade Name",
            "Generic/Proper Name(s)",
            "Company",
            "SPL Effective Date (YYYY/MM/DD)",
            "Application Number(s)",
            "Labeling Type",
            "NDC(s)",
            "Marketing Category",
            "Dosage Form(s)",
            "Route(s) of Administration",
            "Established Pharmacologic Class(es)",
            "Active Ingredient(s)",
            "FDALabel Link",
            "DailyMed SPL Link",
            "DailyMed PDF Link",

            # --- Extra fields (safe; ignored by importer) ---
            "Product Type",
            "Label Format",
            "Source",
            "Project ID"
        ]
        ws.append(headers)

        # Write rows
        for f in favs:
            ws.append([
                _safe_str(getattr(f, 'set_id', None)),
                _safe_str(getattr(f, 'brand_name', None)),
                _safe_str(getattr(f, 'generic_name', None)),
                _safe_str(getattr(f, 'manufacturer_name', None)),
                _fmt_eff_time(getattr(f, 'effective_time', None)),

                _safe_str(getattr(f, 'application_number', None)),
                _safe_str(getattr(f, 'labeling_type', None)),
                _safe_str(getattr(f, 'ndc', None)),
                _safe_str(getattr(f, 'marketing_category', None)),
                _safe_str(getattr(f, 'dosage_forms', None)),
                _safe_str(getattr(f, 'routes', None)),
                _safe_str(getattr(f, 'epc', None)),
                _safe_str(getattr(f, 'active_ingredients', None)),
                _safe_str(getattr(f, 'fdalabel_link', None)),
                _safe_str(getattr(f, 'dailymed_spl_link', None)),
                _safe_str(getattr(f, 'dailymed_pdf_link', None)),

                _safe_str(getattr(f, 'product_type', None)),
                _safe_str(getattr(f, 'label_format', None)),
                _safe_str(getattr(f, 'source', None)),
                str(project_id),
            ])

        # Freeze header row and apply filter
        ws.freeze_panes = "A2"
        ws.auto_filter.ref = ws.dimensions

        # Optional: reasonable column widths
        widths = {
            "A": 40,  # SET ID
            "B": 28,  # Trade Name
            "C": 32,  # Generic
            "D": 28,  # Company
            "E": 18,  # Effective
            "F": 22,  # App #
            "G": 18,  # Labeling type
            "H": 24,  # NDC
            "I": 22,  # Marketing category
            "J": 22,  # Dosage forms
            "K": 22,  # Routes
            "L": 30,  # EPC
            "M": 36,  # Active ingredients
            "N": 36,  # FDALabel link
            "O": 36,  # DailyMed SPL link
            "P": 36,  # DailyMed PDF link
        }
        for col, w in widths.items():
            ws.column_dimensions[col].width = w

        # Save to BytesIO and return
        output = BytesIO()
        wb.save(output)
        output.seek(0)

        # Filename: use project_id; if you later add Project model lookup, swap it in.
        filename = f"project_{project_id}.xlsx"

        return send_file(
            output,
            as_attachment=True,
            download_name=filename,
            mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )

    except Exception as e:
        current_app.logger.exception(f"Error exporting project {project_id}: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

def _norm_str(v):
    if v is None:
        return ""
    s = str(v).strip()
    return s

def _parse_eff_time_to_date(v):
    """
    Returns a date object or None.
    Handles YYYYMMDD, YYYY/MM/DD, YYYY-MM-DD, ISO strings, datetime.
    """
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()

    s = str(v).strip()
    if not s or s.lower() == "n/a":
        return None

    digits = "".join([c for c in s if c.isdigit()])
    if len(digits) == 8:
        try:
            return datetime(int(digits[0:4]), int(digits[4:6]), int(digits[6:8])).date()
        except Exception:
            return None

    try:
        return datetime.fromisoformat(s.replace("Z", "")).date()
    except Exception:
        return None

@main_bp.route('/project_stats', methods=['GET'])
@login_required
def project_stats():
    """
    Project Summary endpoint.

    Always returns:
      - total_labels, unique_manufacturers, unique_brands
      - date_min, date_max
      - product_type_counts, top_manufacturers
      - document_type (with fallback if internal DB unavailable)
      - cumulative_by_effective_time (for line chart)
      - effective_time_summary (quality info)

    Optionally returns:
      - ingredient_breakdown (only when ?ingredient=... is provided)
    """
    project_id = request.args.get('project_id', type=int)
    ingredient = request.args.get('ingredient', default=None, type=str)

    if not project_id:
        return jsonify({"success": False, "error": "Missing project_id"}), 400

    try:
        favs = Favorite.query.filter_by(user_id=current_user.id, project_id=project_id).all()

        # Empty project: consistent payload
        if not favs:
            return jsonify({
                "success": True,
                "project_id": project_id,
                "total_labels": 0,
                "unique_manufacturers": 0,
                "unique_brands": 0,
                "date_min": None,
                "date_max": None,
                "product_type_counts": {},
                "top_manufacturers": [],
                "document_type": {
                    "raw": {},
                    "buckets": {
                        "human_rx": 0, "human_otc": 0, "vaccine": 0,
                        "animal_rx": 0, "animal_otc": 0,
                        "other": 0, "unknown": 0
                    },
                    "note": "No labels in project."
                },
                "effective_time_summary": {
                    "dated_labels": 0,
                    "missing_effective_time": 0,
                    "filled_from_db": 0
                },
                "cumulative_by_effective_time": [],
                "ingredient_breakdown": None
            }), 200

        manufacturers = []
        brands = []
        eff_dates = []     # store date objects
        product_types = []
        set_ids = []

        # Track which set_ids are missing local dates
        missing_date_set_ids = []

        for f in favs:
            sid = getattr(f, "set_id", None)
            if sid:
                sid = str(sid)
                set_ids.append(sid)

            manufacturers.append(_norm_str(getattr(f, "manufacturer_name", None)) or "Unknown")
            brands.append(_norm_str(getattr(f, "brand_name", None)) or "Unknown")

            # Prefer your existing parser if present:
            # dt = _parse_eff_time_to_dt(getattr(f, "effective_time", None))
            # d = dt.date() if dt else None
            d = _parse_eff_time_to_date(getattr(f, "effective_time", None))
            if d:
                eff_dates.append(d)
            else:
                if sid:
                    missing_date_set_ids.append(sid)

            pt = _norm_str(getattr(f, "product_type", None))
            if not pt:
                lt = _norm_str(getattr(f, "labeling_type", None)).upper()
                mc = _norm_str(getattr(f, "marketing_category", None)).upper()
                if "OTC" in lt or "OTC" in mc:
                    pt = "OTC"
                elif lt or mc:
                    pt = "Rx"
                else:
                    pt = "Unknown"
            product_types.append(pt)

        manu_set = {m for m in manufacturers if m and m != "Unknown"}
        brand_set = {b for b in brands if b and b != "Unknown"}

        # DB-powered breakdowns
        internal_ok = FDALabelDBService.check_connectivity()

        # ---- Fill missing effective_time from internal DB (biggest impact on your curve) ----
        filled_from_db = 0
        if internal_ok and missing_date_set_ids:
            db_map = FDALabelDBService.effective_time_map_for_set_ids(missing_date_set_ids)
            for sid in missing_date_set_ids:
                v = db_map.get(sid)
                d = _parse_eff_time_to_date(v)
                if d:
                    eff_dates.append(d)
                    filled_from_db += 1

        # Date range (after fill)
        date_min = min(eff_dates).isoformat() if eff_dates else None
        date_max = max(eff_dates).isoformat() if eff_dates else None

        pt_counts = dict(Counter(product_types))
        manu_counts = Counter(manufacturers)

        top_manufacturers = [
            {"name": name, "count": count}
            for name, count in manu_counts.most_common(10)
            if name and name != "Unknown"
        ]

        # Document type
        if internal_ok and set_ids:
            document_type = FDALabelDBService.document_type_breakdown_for_set_ids(set_ids)
        else:
            document_type = {
                "raw": {},
                "buckets": {
                    "human_rx": 0, "human_otc": 0, "vaccine": 0,
                    "animal_rx": 0, "animal_otc": 0,
                    "other": 0,
                    "unknown": len(set_ids) if set_ids else len(favs)
                },
                "note": "Internal DB not available; document_type breakdown unavailable."
            }

        # ---- Cumulative curve series (daily -> cumulative) ----
        daily = Counter(eff_dates)
        cumulative_by_effective_time = []
        if daily:
            cum = 0
            for day in sorted(daily.keys()):
                cum += daily[day]
                cumulative_by_effective_time.append({
                    "date": day.isoformat(),
                    "cumulative_count": cum
                })

        effective_time_summary = {
            "dated_labels": len(eff_dates),
            "missing_effective_time": max(len(favs) - len(eff_dates), 0),
            "filled_from_db": filled_from_db
        }

        # Ingredient breakdown (optional)
        ingredient_breakdown = None
        if ingredient and ingredient.strip():
            q = ingredient.strip()
            if internal_ok and set_ids:
                ingredient_breakdown = FDALabelDBService.ingredient_role_breakdown_for_set_ids(
                    set_ids=set_ids,
                    substance_name=q
                )
            else:
                ingredient_breakdown = {
                    "query": q,
                    "active_count": 0,
                    "inactive_count": 0,
                    "both_count": 0,
                    "not_found_count": len(set_ids) if set_ids else len(favs),
                    "matches": {},
                    "note": "Internal DB not available; ingredient role breakdown unavailable."
                }

        return jsonify({
            "success": True,
            "project_id": project_id,
            "total_labels": len(favs),
            "unique_manufacturers": len(manu_set),
            "unique_brands": len(brand_set),
            "date_min": date_min,
            "date_max": date_max,
            "product_type_counts": pt_counts,
            "top_manufacturers": top_manufacturers,
            "document_type": document_type,
            "effective_time_summary": effective_time_summary,
            "cumulative_by_effective_time": cumulative_by_effective_time,
            "ingredient_breakdown": ingredient_breakdown
        }), 200

    except Exception as e:
        current_app.logger.exception(f"Error computing project_stats for {project_id}: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

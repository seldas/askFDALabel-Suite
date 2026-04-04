import requests
import re
import os
import logging
import json
from datetime import datetime
from dashboard.config import Config
from dashboard.services.xml_handler import extract_metadata_from_xml
from dashboard.services.fdalabel_db import FDALabelDBService

logger = logging.getLogger(__name__)

def identify_query_type(term):
    """
    Identifies the type of query term: Set ID, UNII, NDC, or Brand Name.
    Returns the appropriate openFDA search field.
    """
    term = term.strip()
    # Check for Set ID (UUID)
    uuid_pattern = r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    # Check for UNII (10 alphanumeric characters)
    unii_pattern = r'^[A-Z0-9]{10}$'
    # Check for NDC
    ndc_pattern = r'^\d{3,5}-\d{2,4}(-\d{1,2})?$' 

    if re.match(uuid_pattern, term):
        return f'openfda.spl_set_id:"{term}"'
    elif re.match(unii_pattern, term):
        return f'openfda.unii:"{term}"'
    elif re.match(ndc_pattern, term):
        return f'(openfda.product_ndc:"{term}" OR openfda.package_ndc:"{term}")'
    else:
        return f'(openfda.brand_name:"{term}" OR openfda.generic_name:"{term}")'

def handle_openfda_error(e):
    """
    Centralized handler for openFDA connection errors.
    Returns a user-friendly message indicating API unavailability.
    """
    error_msg = str(e)
    # Check for common connection errors
    if "ConnectionError" in error_msg or "Max retries exceeded" in error_msg or "Timeout" in error_msg or "getaddrinfo failed" in error_msg or "Simulated Offline" in error_msg:
        return "The openFDA API is currently not available under the current internet environment. This is a connectivity issue, not a system error."
    return f"Error connecting to openFDA: {error_msg}"

def find_labels(query_term, skip=0, limit=10):
    """
    Smart search for labels by Set ID (UUID), UNII, NDC Code, or Brand Name.
    Includes pagination support.
    """
    # INTERNAL DB CHECK
    if FDALabelDBService.check_connectivity():
        internal_limit = 100000
        results = FDALabelDBService.search_labels(query_term, skip=skip, limit=internal_limit)
        return results, len(results)

    search_query = identify_query_type(query_term)
    fda_url = "https://api.fda.gov/drug/label.json"
    params = {'search': search_query, 'limit': limit, 'skip': skip}
    if Config.OPENFDA_API_KEY:
        params['api_key'] = Config.OPENFDA_API_KEY

    try:
        response = requests.get(fda_url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        total = data.get('meta', {}).get('results', {}).get('total', 0)
        
        labels = []
        if 'results' in data and data['results']:
            for result in data['results']:
                openfda = result.get('openfda', {})
                eff_time = result.get('effective_time', '')
                try:
                    effective_date = datetime.strptime(eff_time, '%Y%m%d').strftime('%B %d, %Y')
                except:
                    effective_date = "N/A"

                label_format = None
                if result.get('warnings_and_cautions'):
                    label_format = 'PLR'
                elif result.get('description') and result.get('warnings'):
                    label_format = 'non-PLR'

                app_nums = openfda.get('application_number', [])
                app_num_str = app_nums[0] if app_nums else 'N/A'
                prod_types = openfda.get('product_type', [])
                prod_type_str = prod_types[0] if prod_types else 'N/A'
                is_combination = "COMBINATION PRODUCT" in prod_type_str.upper()
                
                if "PRESCRIPTION" in prod_type_str.upper(): prod_type_str = "Rx"
                elif "OTC" in prod_type_str.upper(): prod_type_str = "OTC"

                ndc_list = openfda.get('product_ndc', []) + openfda.get('package_ndc', [])
                ndc_str = ', '.join(sorted(list(set(ndc_list)))) if ndc_list else 'N/A'

                labels.append({
                    'set_id': result.get('set_id'),
                    'brand_name': ', '.join(openfda.get('brand_name', ['N/A'])),
                    'generic_name': ', '.join(openfda.get('generic_name', ['N/A'])),
                    'manufacturer_name': ', '.join(openfda.get('manufacturer_name', ['N/A'])),
                    'effective_time': effective_date,
                    'label_format': label_format,
                    'application_number': app_num_str,
                    'market_category': prod_type_str,
                    'ndc': ndc_str,
                    'is_combination': is_combination
                })
        return labels, total
    except requests.exceptions.RequestException as e:
        msg = handle_openfda_error(e)
        logger.error(msg)
        return {"error": msg}, 0
    except Exception as e:
        logger.error(f"Error in find_labels: {e}")
    return [], 0

def find_labels_by_set_ids(terms_list, skip=0, limit=10):
    if not terms_list: return [], 0
    if FDALabelDBService.check_connectivity():
        all_results = []
        for tid in terms_list:
             res = FDALabelDBService.search_labels(tid, limit=1)
             if res: all_results.extend(res)
        return all_results[skip:skip+limit], len(all_results)

    all_labels = []
    seen_set_ids = set()
    for term in list(set(terms_list)):
        search_query = identify_query_type(term)
        fda_url = "https://api.fda.gov/drug/label.json"
        params = {'search': search_query, 'limit': 5}
        if Config.OPENFDA_API_KEY: params['api_key'] = Config.OPENFDA_API_KEY

        try:
            response = requests.get(fda_url, params=params, timeout=10)
            if response.status_code == 200:
                data = response.json()
                for result in data.get('results', []):
                    sid = result.get('set_id')
                    if sid and sid not in seen_set_ids:
                        openfda = result.get('openfda', {})
                        all_labels.append({
                            'set_id': sid,
                            'brand_name': ', '.join(openfda.get('brand_name', ['N/A'])),
                            'generic_name': ', '.join(openfda.get('generic_name', ['N/A'])),
                            'manufacturer_name': ', '.join(openfda.get('manufacturer_name', ['N/A'])),
                            'effective_time': result.get('effective_time', 'N/A'),
                            'label_format': 'openFDA',
                            'application_number': openfda.get('application_number', ['N/A'])[0],
                            'market_category': openfda.get('product_type', ['N/A'])[0],
                            'ndc': ', '.join(openfda.get('product_ndc', []))
                        })
                        seen_set_ids.add(sid)
        except requests.exceptions.RequestException as e:
            msg = handle_openfda_error(e)
            return {"error": msg}, 0
    return all_labels[skip:skip+limit], len(all_labels)

def get_label_metadata(set_id, import_id=None):
    if import_id:
        import_path = os.path.join(Config.UPLOAD_FOLDER, f"import_{import_id}.json")
        if os.path.exists(import_path):
            with open(import_path, 'r', encoding='utf-8') as f:
                labels = json.load(f)
                for l in labels:
                    if l['set_id'] == set_id: return l

    if FDALabelDBService.check_connectivity():
        meta = FDALabelDBService.get_label_metadata(set_id)
        if meta: return meta

    fda_url = "https://api.fda.gov/drug/label.json"
    params = {'search': f'set_id:"{set_id}"'}
    if Config.OPENFDA_API_KEY: params['api_key'] = Config.OPENFDA_API_KEY

    try:
        response = requests.get(fda_url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
        if 'results' in data and data['results']:
            result = data['results'][0]
            openfda = result.get('openfda', {})
            
            meta = {
                'set_id': result.get('set_id'),
                'brand_name': ', '.join(openfda.get('brand_name', ['N/A'])),
                'generic_name': ', '.join(openfda.get('generic_name', ['N/A'])),
                'manufacturer_name': ', '.join(openfda.get('manufacturer_name', ['N/A'])),
                'effective_time': result.get('effective_time', 'N/A'),
                'label_format': 'openFDA',
                'application_number': openfda.get('application_number', ['N/A'])[0],
                'market_category': openfda.get('product_type', ['N/A'])[0],
                'ndc': ', '.join(openfda.get('product_ndc', [])),
                'epc': ', '.join(openfda.get('pharm_class_epc', ['N/A'])),
                'moa': ', '.join(openfda.get('pharm_class_moa', ['N/A'])),
                'source': 'openFDA'
            }

            # FALLBACK: If names are N/A, try to extract from XML directly
            if meta['brand_name'] == 'N/A' or meta['generic_name'] == 'N/A':
                logger.info(f"openFDA mapping missing for {set_id}. Attempting direct XML extraction.")
                xml_content = get_label_xml(set_id)
                if xml_content:
                    xml_meta = extract_metadata_from_xml(xml_content)
                    if xml_meta:
                        if meta['brand_name'] == 'N/A' and xml_meta.get('brand_name') != 'Unknown Drug':
                            meta['brand_name'] = xml_meta['brand_name']
                        if meta['generic_name'] == 'N/A' and xml_meta.get('generic_name') != 'Unknown Generic':
                            meta['generic_name'] = xml_meta['generic_name']
                        if meta['manufacturer_name'] == 'N/A' and xml_meta.get('manufacturer_name') != 'Unknown Manufacturer':
                            meta['manufacturer_name'] = xml_meta['manufacturer_name']
                        meta['source'] = 'openFDA + XML Fallback'
            
            return meta
    except requests.exceptions.RequestException as e:
        return {"error": handle_openfda_error(e)}
    return None

def get_label_xml(set_id):
    if not set_id: return None
    try:
        db_xml = FDALabelDBService.get_full_xml(set_id)
        if db_xml: return db_xml
    except Exception as e:
        logger.error(f"Error reading local XML: {e}")

    dailymed_url = f"https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/{set_id}.xml"
    try:
        response = requests.get(dailymed_url, timeout=10)
        response.raise_for_status()
        return response.text
    except Exception as e:
        logger.error(f"Error fetching from DailyMed: {e}")
    return None

def get_faers_data(drug_name, limit=20):
    if not drug_name or drug_name in ['N/A', 'Unknown Generic']: return None
    clean_name = re.split(r'[,;]', drug_name)[0].strip()
    base_url = "https://api.fda.gov/drug/event.json"
    search_term = f'patient.drug.openfda.generic_name:"{clean_name}"'
    
    try:
        params = {'search': search_term, 'count': 'patient.reaction.reactionmeddrapt.exact', 'limit': limit}
        if Config.OPENFDA_API_KEY: params['api_key'] = Config.OPENFDA_API_KEY
        resp = requests.get(base_url, params=params, timeout=10)
        if resp.status_code == 200:
            return {'reactions': resp.json().get('results', []), 'dates': []}
    except requests.exceptions.RequestException as e:
        return {"error": handle_openfda_error(e)}
    return None

def get_label_counts(generic_name=None, epc=None):
    """
    Queries openFDA to get counts of labels for a specific generic name and/or EPC.
    """
    fda_url = "https://api.fda.gov/drug/label.json"
    results = {"generic_count": 0, "epc_count": 0}
    
    # Base params
    base_params = {}
    if Config.OPENFDA_API_KEY:
        base_params['api_key'] = Config.OPENFDA_API_KEY

    # 1. Query for Generic Name
    if generic_name:
        # Extract first part of generic name for better search matching
        clean_name = re.split(r'[,;]', generic_name)[0].strip()
        params = base_params.copy()
        params['search'] = f'openfda.generic_name:"{clean_name}"'
        params['limit'] = 1
        try:
            resp = requests.get(fda_url, params=params, timeout=10)
            if resp.status_code == 200:
                results["generic_count"] = resp.json().get('meta', {}).get('results', {}).get('total', 0)
        except Exception as e:
            logger.error(f"Error fetching generic counts from openFDA: {e}")

    # 2. Query for EPC
    if epc:
        params = base_params.copy()
        params['search'] = f'openfda.pharm_class_epc:"{epc}"'
        params['limit'] = 1
        try:
            resp = requests.get(fda_url, params=params, timeout=10)
            if resp.status_code == 200:
                results["epc_count"] = resp.json().get('meta', {}).get('results', {}).get('total', 0)
        except Exception as e:
            logger.error(f"Error fetching EPC counts from openFDA: {e}")

    return results

def get_rich_metadata_by_generic(generic_name):
    """
    Searches openFDA by generic name to find a record that actually contains 
    EPC/MOA data, which might be missing on specific manufacturer labels.
    """
    if not generic_name or generic_name.lower() == 'n/a':
        return None
        
    clean_name = re.split(r'[,;]', generic_name)[0].strip()
    fda_url = "https://api.fda.gov/drug/label.json"
    params = {'search': f'openfda.generic_name:"{clean_name}"', 'limit': 5}
    if Config.OPENFDA_API_KEY:
        params['api_key'] = Config.OPENFDA_API_KEY

    try:
        resp = requests.get(fda_url, params=params, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            for result in data.get('results', []):
                openfda = result.get('openfda', {})
                if openfda.get('pharm_class_epc'):
                    return {
                        'epc': ", ".join(openfda.get('pharm_class_epc', [])),
                        'moa': ", ".join(openfda.get('pharm_class_moa', [])),
                        'generic_name': ", ".join(openfda.get('generic_name', []))
                    }
    except Exception as e:
        logger.error(f"Error fetching rich metadata: {e}")
    return None

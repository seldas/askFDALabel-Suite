import requests
import re
import os
import logging
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
    ndc_pattern = r'^\d{3,5}-\d{2,4}(-\d{1,2})?$' # Corrected escaping for \d

    if re.match(uuid_pattern, term):
        return f'openfda.spl_set_id:"{term}"'
    elif re.match(unii_pattern, term):
        return f'openfda.unii:"{term}"'
    elif re.match(ndc_pattern, term):
        return f'(openfda.product_ndc:"{term}" OR openfda.package_ndc:"{term}")'
    else:
        return f'(openfda.brand_name:"{term}" OR openfda.generic_name:"{term}")'

def find_labels(query_term, skip=0, limit=10):
    """
    Smart search for labels by Set ID (UUID), UNII, NDC Code, or Brand Name.
    Includes pagination support.
    """
    # INTERNAL DB CHECK
    if FDALabelDBService.check_connectivity():
        # For internal DB, we use a much larger limit as requested (100000)
        internal_limit = 100000
        results = FDALabelDBService.search_labels(query_term, skip=skip, limit=internal_limit)
        return results, len(results)

    search_query = identify_query_type(query_term)

    fda_url = "https://api.fda.gov/drug/label.json"
    params = {
        'search': search_query,
        'limit': limit,
        'skip': skip
    }
    if Config.OPENFDA_API_KEY:
        params['api_key'] = Config.OPENFDA_API_KEY

    try:
        response = requests.get(fda_url, params=params)
        response.raise_for_status()
        data = response.json()

        total = data.get('meta', {}).get('results', {}).get('total', 0)
        
        labels = []
        if 'results' in data and data['results']:
            for result in data['results']:
                openfda = result.get('openfda', {})
                effective_time_str = result.get('effective_time', '')
                try:
                    effective_date = datetime.strptime(effective_time_str, '%Y%m%d').strftime('%B %d, %Y')
                except (ValueError, TypeError):
                    effective_date = "N/A"

                # Determine label format
                label_format = None
                if 'warnings_and_cautions' in result and result.get('warnings_and_cautions') and len(result.get('warnings_and_cautions')) > 0:
                    label_format = 'PLR'
                elif ('description' in result and result.get('description') and len(result.get('description')) > 0) and \
                     ('warnings' in result and result.get('warnings') and len(result.get('warnings')) > 0):
                    label_format = 'non-PLR'

                # Extract App Num & Product Type
                app_nums = openfda.get('application_number', [])
                app_num_str = app_nums[0] if app_nums else 'N/A'
                
                prod_types = openfda.get('product_type', [])
                prod_type_str = prod_types[0] if prod_types else 'N/A'
                if "PRESCRIPTION" in prod_type_str.upper():
                    prod_type_str = "Rx"
                elif "OTC" in prod_type_str.upper():
                    prod_type_str = "OTC"

                # Extract NDC
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
                    'ndc': ndc_str
                })
        return labels, total
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching data from openFDA: {e}")
    except (KeyError, IndexError):
        logger.error("Could not parse data from openFDA response.")
    return [], 0


def find_labels_by_set_ids(terms_list, skip=0, limit=10):
    """
    Smart batch search for a list of identifiers (Set IDs, UNIIs, or NDCs).
    Performs individual searches for each term to ensure specific matches are found.
    """
    if not terms_list:
        return [], 0

    # Deduplicate the terms list before processing
    unique_terms = []
    seen_terms = set()
    for t in terms_list:
        clean_t = t.strip()
        if clean_t and clean_t not in seen_terms:
            unique_terms.append(clean_t)
            seen_terms.add(clean_t)

    all_labels = []
    seen_set_ids = set()

    # To maintain performance and accuracy, we search for each term individually.
    # Note: This can lead to multiple results per term (especially for NDCs).
    for term in unique_terms:
        search_query = identify_query_type(term)
        
        fda_url = "https://api.fda.gov/drug/label.json"
        # For batch search individual terms, we look for the most relevant results
        params = {
            'search': search_query,
            'limit': 5 # Get up to 5 matches per specific term in the batch
        }
        if Config.OPENFDA_API_KEY:
            params['api_key'] = Config.OPENFDA_API_KEY

        try:
            response = requests.get(fda_url, params=params)
            if response.status_code == 200:
                data = response.json()
                if 'results' in data:
                    for result in data['results']:
                        sid = result.get('set_id')
                        if sid and sid not in seen_set_ids:
                            openfda = result.get('openfda', {})
                            effective_time_str = result.get('effective_time', '')
                            try:
                                effective_date = datetime.strptime(effective_time_str, '%Y%m%d').strftime('%B %d, %Y')
                            except (ValueError, TypeError):
                                effective_date = "N/A"

                            # Determine label format
                            label_format = None
                            if 'warnings_and_cautions' in result and result.get('warnings_and_cautions') and len(result.get('warnings_and_cautions')) > 0:
                                label_format = 'PLR'
                            elif ('description' in result and result.get('description') and len(result.get('description')) > 0) and \
                                 ('warnings' in result and result.get('warnings') and len(result.get('warnings')) > 0):
                                label_format = 'non-PLR'

                            # Extract App Num & Product Type
                            app_nums = openfda.get('application_number', [])
                            app_num_str = app_nums[0] if app_nums else 'N/A'
                            
                            prod_types = openfda.get('product_type', [])
                            prod_type_str = prod_types[0] if prod_types else 'N/A'
                            if "PRESCRIPTION" in prod_type_str.upper():
                                prod_type_str = "Rx"
                            elif "OTC" in prod_type_str.upper():
                                prod_type_str = "OTC"

                            # Extract NDC
                            ndc_list = openfda.get('product_ndc', []) + openfda.get('package_ndc', [])
                            ndc_str = ', '.join(sorted(list(set(ndc_list)))) if ndc_list else 'N/A'

                            all_labels.append({
                                'set_id': sid,
                                'brand_name': ', '.join(openfda.get('brand_name', ['N/A'])),
                                'generic_name': ', '.join(openfda.get('generic_name', ['N/A'])),
                                'manufacturer_name': ', '.join(openfda.get('manufacturer_name', ['N/A'])),
                                'effective_time': effective_date,
                                'label_format': label_format,
                                'application_number': app_num_str,
                                'market_category': prod_type_str,
                                'ndc': ndc_str
                            })
                            seen_set_ids.add(sid)
        except Exception as e:
            logger.error(f"Error fetching data for batch term {term}: {e}")

    total = len(all_labels)
    # Apply pagination to the combined list
    paginated_labels = all_labels[skip : skip + limit]
    
    return paginated_labels, total

def get_label_metadata(set_id, import_id=None):
    """
    Fetches detailed metadata for a single drug label.
    Checks import_id first, then local uploads, then openFDA.
    """
    # 0. Check import_id if provided
    if import_id:
        import_path = os.path.join(Config.UPLOAD_FOLDER, f"import_{import_id}.json")
        if os.path.exists(import_path):
            try:
                import json
                with open(import_path, 'r', encoding='utf-8') as f:
                    labels = json.load(f)
                # Find the label with this set_id
                for label in labels:
                    if label['set_id'] == set_id:
                        # If format is missing, try to fetch XML (Local or DailyMed) to determine it
                        if not label.get('label_format'):
                            try:
                                xml_content = get_label_xml(set_id)
                                if xml_content:
                                    xml_meta = extract_metadata_from_xml(xml_content)
                                    if xml_meta and xml_meta.get('label_format'):
                                        label['label_format'] = xml_meta['label_format']
                                        # Also fill in other missing fields if possible
                                        for k, v in xml_meta.items():
                                            if not label.get(k) or label.get(k) == 'N/A':
                                                label[k] = v
                            except Exception as xe:
                                logger.error(f"Error merging XML metadata for {set_id}: {xe}")
                        return label
            except Exception as e:
                logger.error(f"Error reading imported metadata for {set_id} from {import_id}: {e}")

    # 1. Check local uploads
    local_path = os.path.join(Config.UPLOAD_FOLDER, f"{set_id}.xml")
    if os.path.exists(local_path):
        try:
            with open(local_path, 'r', encoding='utf-8') as f:
                content = f.read()
            return extract_metadata_from_xml(content)
        except Exception as e:
            logger.error(f"Error reading local metadata for {set_id}: {e}")

    # 1.5. Check Internal FDALabel DB
    try:
        internal_meta = FDALabelDBService.get_label_metadata(set_id)
        if internal_meta:
            # Fallback for label_format if it is just 'FDALabel'
            # We try to fetch XML (DailyMed) to parse real format
            if internal_meta.get('label_format') == 'FDALabel':
                 xml_content = get_label_xml(set_id)
                 if xml_content:
                     xml_meta = extract_metadata_from_xml(xml_content)
                     if xml_meta and xml_meta.get('label_format'):
                         internal_meta['label_format'] = xml_meta['label_format']
            return internal_meta
    except Exception as e:
        logger.error(f"Error checking internal DB for {set_id}: {e}")

    # 2. Fallback to openFDA
    fda_url = "https://api.fda.gov/drug/label.json"
    params = {
        'search': f'set_id:"{set_id}"'
    }
    if Config.OPENFDA_API_KEY:
        params['api_key'] = Config.OPENFDA_API_KEY

    try:
        response = requests.get(fda_url, params=params)
        response.raise_for_status()
        data = response.json()

        if 'results' in data and data['results']:
            result = data['results'][0] # Assuming set_id is unique
            openfda = result.get('openfda', {})
            effective_time_str = result.get('effective_time', '')
            try:
                effective_date = datetime.strptime(effective_time_str, '%Y%m%d').strftime('%B %d, %Y')
            except (ValueError, TypeError):
                effective_date = "N/A"

            # Determine label format
            label_format = None
            if 'warnings_and_cautions' in result and result.get('warnings_and_cautions') and len(result.get('warnings_and_cautions')) > 0:
                label_format = 'PLR'
            elif ('description' in result and result.get('description') and len(result.get('description')) > 0) and \
                 ('warnings' in result and result.get('warnings') and len(result.get('warnings')) > 0):
                label_format = 'non-PLR'

            # Fallback: If format unknown, fetch XML and parse
            if not label_format:
                logger.info(f"Format undetermined from OpenFDA JSON for {set_id}, fetching XML...")
                xml_content = get_label_xml(set_id)
                if xml_content:
                    xml_meta = extract_metadata_from_xml(xml_content)
                    if xml_meta and xml_meta.get('label_format'):
                        label_format = xml_meta['label_format']

            # Extract App Num & Product Type
            app_nums = openfda.get('application_number', [])
            app_num_str = app_nums[0] if app_nums else 'N/A'
            
            prod_types = openfda.get('product_type', [])
            prod_type_str = prod_types[0] if prod_types else 'N/A'
            if "PRESCRIPTION" in prod_type_str.upper():
                prod_type_str = "Rx"
            elif "OTC" in prod_type_str.upper():
                prod_type_str = "OTC"

            # Extract NDC
            ndc_list = openfda.get('product_ndc', []) + openfda.get('package_ndc', [])
            ndc_str = ', '.join(sorted(list(set(ndc_list)))) if ndc_list else 'N/A'

            return {
                'set_id': result.get('set_id'),
                'brand_name': ', '.join(openfda.get('brand_name', ['N/A'])),
                'generic_name': ', '.join(openfda.get('generic_name', ['N/A'])),
                'manufacturer_name': ', '.join(openfda.get('manufacturer_name', ['N/A'])),
                'effective_time': effective_date,
                'label_format': label_format,
                'application_number': app_num_str,
                'market_category': prod_type_str,
                'ndc': ndc_str
            }
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching data from openFDA for set_id {set_id}: {e}")
    except (KeyError, IndexError):
        logger.error(f"Could not parse data from openFDA response for set_id {set_id}.")
    return None

def get_label_xml(set_id):
    """
    Fetches the full drug label XML.
    Checks local uploads first, then DailyMed.
    """
    if not set_id:
        return None

    # 1. Check local uploads
    local_path = os.path.join(Config.UPLOAD_FOLDER, f"{set_id}.xml")
    if os.path.exists(local_path):
        try:
            with open(local_path, 'r', encoding='utf-8') as f:
                return f.read()
        except Exception as e:
            logger.error(f"Error reading local XML for {set_id}: {e}")

    # 2. Fallback to DailyMed
    dailymed_url = f"https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/{set_id}.xml"
    try:
        response = requests.get(dailymed_url)
        response.raise_for_status()
        return response.text
    except requests.exceptions.RequestException as e:
        logger.error(f"Error fetching data from DailyMed: {e}")
    return None

def get_faers_data(drug_name, limit=20):
    """
    Fetches aggregated safety data from openFDA FAERS endpoint for a given drug, 
    limited to the last 5 years to match the trend charts.
    """
    if not drug_name or drug_name == 'N/A':
        return None

    # Clean name: Take first part if comma/semicolon separated (e.g. "Aspirin, Bristol" -> "Aspirin")
    clean_name = re.split(r'[,;]', drug_name)[0].strip()
    
    base_url = "https://api.fda.gov/drug/event.json"
    search_term = f'(patient.drug.openfda.brand_name:"{clean_name}" OR patient.drug.openfda.generic_name:"{clean_name}")'
    
    # Time range: Last 5 years
    current_year = datetime.now().year
    start_date = f"{current_year - 5}0101"
    end_date = f"{current_year}1231"
    date_filter = f"receiptdate:[{start_date} TO {end_date}]"
    
    data = {
        'reactions': [],
        'reactions_serious': [],
        'reactions_non_serious': [],
        'dates': []
    }
    
    try:
        # 1. Overall Top Reactions (Filtered by date)
        params_reactions = {
            'search': f"{search_term} AND {date_filter}",
            'count': 'patient.reaction.reactionmeddrapt.exact',
            'limit': limit
        }
        if Config.OPENFDA_API_KEY:
            params_reactions['api_key'] = Config.OPENFDA_API_KEY
        resp = requests.get(base_url, params=params_reactions)
        if resp.status_code == 200:
            # Filter out terms with 0 count (though openFDA count queries usually only return > 0)
            data['reactions'] = [r for r in resp.json().get('results', []) if r.get('count', 0) > 0]

        # 2. Serious Reactions (Serious = 1, Filtered by date)
        params_serious = {
            'search': f"{search_term} AND serious:1 AND {date_filter}",
            'count': 'patient.reaction.reactionmeddrapt.exact',
            'limit': 1000
        }
        if Config.OPENFDA_API_KEY:
            params_serious['api_key'] = Config.OPENFDA_API_KEY
        resp = requests.get(base_url, params=params_serious)
        if resp.status_code == 200:
            data['reactions_serious'] = resp.json().get('results', [])

        # 3. Non-Serious Reactions (Non-Serious = 2, Filtered by date)
        params_non_serious = {
            'search': f"{search_term} AND serious:2 AND {date_filter}",
            'count': 'patient.reaction.reactionmeddrapt.exact',
            'limit': 1000
        }
        if Config.OPENFDA_API_KEY:
            params_non_serious['api_key'] = Config.OPENFDA_API_KEY
        resp = requests.get(base_url, params=params_non_serious)
        if resp.status_code == 200:
            data['reactions_non_serious'] = resp.json().get('results', [])

        # 4. Reports over time (receiptdate)
        params_dates = {
            'search': f"{search_term} AND {date_filter}",
            'count': 'receiptdate'
        }
        if Config.OPENFDA_API_KEY:
            params_dates['api_key'] = Config.OPENFDA_API_KEY
        resp = requests.get(base_url, params=params_dates)
        if resp.status_code == 200:
            raw_dates = resp.json().get('results', [])
            raw_dates.sort(key=lambda x: x.get('time', '')) 
            data['dates'] = raw_dates

    except Exception as e:
        logger.error(f"Error fetching FAERS data: {e}")
        return None

    return data


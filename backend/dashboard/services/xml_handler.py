import xml.etree.ElementTree as ET
from datetime import datetime
import logging
import re
from dashboard.utils import extract_numeric_section_id, clean_spl_text

logger = logging.getLogger(__name__)

def extract_metadata_from_xml(xml_string):
    """
    Parses an SPL XML string to extract metadata using a robust, namespace-agnostic approach.
    """
    if not xml_string:
        return None

    try:
        # 0. Cleanup and Basic Parsing
        xml_string_cleaned = ''.join(c for c in xml_string if c.isprintable() or c in '\n\r\t')
        try:
            root = ET.fromstring(xml_string_cleaned)
        except ET.ParseError:
            root = ET.fromstring(xml_string_cleaned.strip())

        # Helper to find tags regardless of namespace
        def get_tag_local(full_tag):
            return full_tag.split('}')[-1] if '}' in full_tag else full_tag

        def find_nodes_by_local_name(parent, local_name):
            return [n for n in parent.iter() if get_tag_local(n.tag) == local_name]

        # 1. Set ID
        set_id = "N/A"
        set_id_nodes = find_nodes_by_local_name(root, 'setId')
        if set_id_nodes:
            set_id = set_id_nodes[0].get('root', 'N/A')
        
        # 2. Effective Time
        effective_time = "N/A"
        eff_nodes = find_nodes_by_local_name(root, 'effectiveTime')
        if eff_nodes:
            val = eff_nodes[0].get('value', '')
            try:
                effective_time = datetime.strptime(val[:8], '%Y%m%d').strftime('%B %d, %Y')
            except: pass
            
        # 3. Version & Doc Type
        version = "1"
        v_nodes = find_nodes_by_local_name(root, 'versionNumber')
        if v_nodes: version = v_nodes[0].get('value', '1')

        doc_type = "Label"
        c_nodes = find_nodes_by_local_name(root, 'code')
        # Look for the first 'code' that is a direct child of document (root)
        for c in c_nodes:
            # Simple check: root code usually has a displayName and is early in the doc
            if c.get('displayName'):
                dt = c.get('displayName')
                if "HUMAN PRESCRIPTION" in dt.upper(): doc_type = "Prescription (Rx)"
                elif "OTC" in dt.upper(): doc_type = "OTC"
                else: doc_type = dt
                break

        # 4. Manufacturer (Broad search)
        manufacturer = "Unknown Manufacturer"
        # Search all nodes that might contain a name, looking specifically for organization names
        possible_orgs = find_nodes_by_local_name(root, 'representedOrganization') + \
                        find_nodes_by_local_name(root, 'assignedOrganization') + \
                        find_nodes_by_local_name(root, 'representedRegisteredOrganization')
        
        for org in possible_orgs:
            # Check for a name child anywhere inside this organization node
            name_nodes = find_nodes_by_local_name(org, 'name')
            if name_nodes:
                text = "".join(name_nodes[0].itertext()).strip()
                if text and len(text) > 2:
                    manufacturer = text
                    break
        
        # 5. Brand & Generic Name
        brand_name = "Unknown Drug"
        generic_name = "Unknown Generic"
        
        # 6. Cleaning for UI and FAERS
        def clean_name(name):
            if not name or name in ["Unknown Generic", "Unknown Drug"]: return name
            
            # Remove "HIGHLIGHTS OF PRESCRIBING INFORMATION" disclaimer
            if "highlights do not include" in name.lower():
                # Try to extract name between parentheses if they exist (common in PLR)
                m = re.search(r'\(([^)]+)\)', name)
                if m:
                    name = m.group(1).strip()
                else:
                    # Aggressively strip the highlights header
                    name = re.sub(r'^These highlights do not include.*?safely and effectively\.\s*(See full prescribing information for.*?\.)?\s*', '', name, flags=re.IGNORECASE | re.DOTALL).strip()
            
            # Remove Strengths/Units (e.g., 50mg, 10%)
            n = re.sub(r'\d+(\.\d+)?\s*(mg|mcg|g|ml|%|unit|iu)\b.*$', '', name, flags=re.IGNORECASE).strip()
            # Remove Forms (e.g., tablets, capsules)
            n = re.sub(r'\s+(tablet|capsule|injection|cream|ointment|gel|solution|suspension|spray|inhaler|powder|for oral use|for topical use|Initial U\.S\. Approval.*).*$', '', n, flags=re.IGNORECASE).strip()
            # Remove any remaining parentheses and extra punctuation
            n = re.sub(r'\(.*?\)', '', n).strip()
            return n.rstrip(',.;').strip()

        # Find the primary manufacturedMaterial or manufacturedProduct for more specific names
        material_nodes = find_nodes_by_local_name(root, 'manufacturedMaterial')
        if not material_nodes:
            material_nodes = find_nodes_by_local_name(root, 'manufacturedProduct')

        for mat in material_nodes:
            # Try to find name child
            n_nodes = [n for n in mat if get_tag_local(n.tag) == 'name']
            if n_nodes:
                name_text = "".join(n_nodes[0].itertext()).strip()
                if name_text:
                    brand_name = name_text
            
            # Try to find genericMedicine -> name
            gen_nodes = find_nodes_by_local_name(mat, 'genericMedicine')
            if gen_nodes:
                gn_nodes = [n for n in gen_nodes[0] if get_tag_local(n.tag) == 'name']
                if gn_nodes:
                    generic_name = "".join(gn_nodes[0].itertext()).strip()
            
            if brand_name != "Unknown Drug" and generic_name != "Unknown Generic":
                break

        # Primary Title Fallback (if no material names found)
        if brand_name == "Unknown Drug":
            doc_title_nodes = [n for n in root if get_tag_local(n.tag) == 'title']
            if doc_title_nodes:
                brand_name = "".join(doc_title_nodes[0].itertext()).strip()

        # Fallback for Generic Name from Active Ingredients
        if generic_name == "Unknown Generic":
            act_nodes = find_nodes_by_local_name(root, 'activeIngredient')
            ingr_names = []
            for act in act_nodes:
                sub_nodes = find_nodes_by_local_name(act, 'activeMedicine')
                if not sub_nodes: sub_nodes = find_nodes_by_local_name(act, 'ingredientSubstance')
                if sub_nodes:
                    name_nodes = [n for n in sub_nodes[0] if get_tag_local(n.tag) == 'name']
                    if name_nodes:
                        ingr_names.append("".join(name_nodes[0].itertext()).strip())
            if ingr_names:
                generic_name = ", ".join(ingr_names)

        brand_name = clean_name(brand_name)
        generic_name = clean_name(generic_name)
        
        generic_clean = clean_name(generic_name)
        faers_search_name = generic_clean.split(',')[0].strip() if generic_clean else ""

        # 7. Boxed Warning & Format
        has_boxed = False
        is_plr = False
        if find_nodes_by_local_name(root, 'excerpt'): is_plr = True
        
        for sec in find_nodes_by_local_name(root, 'section'):
            code_nodes = [n for n in sec if get_tag_local(n.tag) == 'code']
            title_nodes = [n for n in sec if get_tag_local(n.tag) == 'title']
            title_text = "".join(title_nodes[0].itertext()).strip().lower() if title_nodes else ""
            code_val = code_nodes[0].get('code', '') if code_nodes else ""
            
            if code_val == '34066-1' or 'boxed warning' in title_text: has_boxed = True
            if code_val == '43685-7' or ('precautions' in title_text and 'warnings' in title_text): is_plr = True

        # 8. NDCs and Application Numbers (OID Search)
        ndcs = set()
        apps = set()
        for elem in root.iter():
            # NDC
            if elem.get('codeSystem') == '2.16.840.1.113883.6.69':
                v = elem.get('code'); 
                if v: ndcs.add(v)
            # App Num
            if elem.get('root') == '2.16.840.1.113883.3.150':
                v = elem.get('extension');
                if v: apps.add(v)

        return {
            'set_id': set_id,
            'brand_name': brand_name,
            'generic_name': generic_name,
            'manufacturer_name': manufacturer,
            'effective_time': effective_time,
            'label_format': 'PLR' if is_plr else 'non-PLR',
            'ndc': ", ".join(sorted(list(ndcs))) if ndcs else "N/A",
            'application_number': ", ".join(sorted(list(apps))) if apps else "N/A",
            'version_number': version,
            'document_type': doc_type,
            'has_boxed_warning': has_boxed,
            'faers_search_name': faers_search_name
        }
    except Exception as e:
        logger.error(f"Metadata extraction error: {e}")
        return None

def to_html(element, media_map=None, set_id=None):
    if element is None: return ""
    
    # Helper to clean text chunks within nodes
    def _clean_chunk(text):
        if not text: return ""
        # Collapse multiple spaces and newlines into a single space
        return re.sub(r'\s+', ' ', text)

    raw_tag = element.tag.split('}')[-1] if '}' in element.tag else element.tag
    
    # 1. Handle Multimedia separately to maintain its unique wrapping
    if raw_tag == 'renderMultiMedia':
        ref_id = element.get('referencedObject')
        filename = media_map.get(ref_id) if media_map else None
        
        # Recursively process children
        child_html = ""
        for child in element:
            child_html += to_html(child, media_map, set_id)
            
        img_url = f"https://dailymed.nlm.nih.gov/dailymed/image.cfm?setid={set_id}&name={filename}" if filename and set_id else ""
        return f'<div class="spl-figure" style="text-align: center; margin: 20px 0;">{f"<img src=\'{img_url}\' style=\'max-width:100%\'/>" if img_url else ""}{child_html}</div>{_clean_chunk(element.tail)}'

    # 2. Standard Tag Mapping
    tag_map = {
        'paragraph': 'p', 
        'linkHtml': 'a', 
        'list': 'ul', 
        'item': 'li', 
        'content': 'span', 
        'sub': 'sub', 
        'sup': 'sup', 
        'br': 'br', 
        'caption': 'p'
    }
    
    html_tag = tag_map.get(raw_tag, raw_tag) 
    if raw_tag == 'list' and element.get('listType') == 'ordered': 
        html_tag = 'ol'
    
    # 3. Attribute Processing
    attrs = []
    for k, v in element.attrib.items():
        if html_tag == 'a' and k == 'href': 
            attrs.append(f'href="{v}"')
        if k == 'styleCode':
            styles = [s.lower() for s in v.split(' ')]
            classes = []
            if 'bold' in styles: classes.append('Bold')
            if 'italic' in styles: classes.append('Emphasis')
            if 'underline' in styles: classes.append('Underline')
            if classes: attrs.append(f'class="{" ".join(classes)}"')
    
    # 4. Child Processing with Context-Aware Skips
    inner_html = _clean_chunk(element.text)
    for child in element:
        child_raw_tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
        
        # HEURISTIC: Skip <caption> inside <item> as it's usually a redundant bullet marker
        if raw_tag == 'item' and child_raw_tag == 'caption':
            # Skip the tag but include its tail text in the parent's content
            inner_html += _clean_chunk(child.tail)
            continue
            
        inner_html += to_html(child, media_map, set_id)
    
    # 5. Final Assembly
    if html_tag == 'br': 
        return f"<br/>{_clean_chunk(element.tail)}"
        
    return f"<{html_tag} {' '.join(attrs)}>{inner_html}</{html_tag}>{_clean_chunk(element.tail)}"

def parse_spl_xml(xml_string, set_id=None):
    if not xml_string: return "Error", [], None, None, []
    try:
        xml_cleaned = ''.join(c for c in xml_string if c.isprintable() or c in '\n\r\t')
        root = ET.fromstring(xml_cleaned.strip())
        def local(t): return t.split('}')[-1]
        
        media_map = {}
        for m in root.iter():
            if local(m.tag) == 'observationMedia':
                mid = m.get('ID')
                for val in m:
                    if local(val.tag) == 'value':
                        for ref in val:
                            if local(ref.tag) == 'reference':
                                fname = ref.get('value')
                                if mid and fname: media_map[mid] = fname

        doc_title = "Unknown Drug"
        title_nodes = [n for n in root if local(n.tag) == 'title']
        if title_nodes: doc_title = "".join(title_nodes[0].itertext()).strip()

        sections = []
        highlights = []
        product_data = []

        # Official FDA Titles for Reconstruction
        PLR_TITLE_MAP = {
            '1': 'Indications and Usage',
            '2': 'Dosage and Administration',
            '3': 'Dosage Forms and Strengths',
            '4': 'Contraindications',
            '5': 'Warnings and Precautions',
            '6': 'Adverse Reactions',
            '7': 'Drug Interactions',
            '8': 'Use in Specific Populations',
            '9': 'Drug Abuse and Dependence',
            '10': 'Overdosage',
            '11': 'Description',
            '12': 'Clinical Pharmacology',
            '13': 'Nonclinical Toxicology',
            '14': 'Clinical Studies',
            '15': 'References',
            '16': 'How Supplied/Storage and Handling',
            '17': 'Patient Counseling Information'
        }

        # Standard PLR Section Mapping (Code -> Canonical Number)
        PLR_CODE_MAP = {
            '34067-9': '1', '34068-7': '2', '43678-2': '3', '34070-3': '4',
            '43685-7': '5', '34084-4': '6', '34073-7': '7', '43684-0': '8',
            '42227-9': '9', '34088-5': '10', '34089-3': '11', '34090-1': '12',
            '34091-9': '13', '34092-7': '14', '34093-5': '15', '34069-5': '16',
            '34076-0': '17'
        }

        def parse_product_section(sec_el):
            """Parses the SPL product data elements section (code 48780-1)."""
            products = []
            for subject in [c for c in sec_el if local(c.tag) == 'subject']:
                for manuf_prod_wrapper in [c for c in subject if local(c.tag) == 'manufacturedProduct']:
                    for manuf_prod in [c for c in manuf_prod_wrapper if local(c.tag) == 'manufacturedProduct']:
                        product = {'ndc': '', 'name': '', 'form': '', 'ingredients': [], 'packaging': []}
                        code_nodes = [c for c in manuf_prod if local(c.tag) == 'code']
                        if code_nodes: product['ndc'] = code_nodes[0].get('code', '')
                        name_nodes = [c for c in manuf_prod if local(c.tag) == 'name']
                        if name_nodes: product['name'] = "".join(name_nodes[0].itertext()).strip()
                        form_nodes = [c for c in manuf_prod if local(c.tag) == 'formCode']
                        if form_nodes: product['form'] = form_nodes[0].get('displayName', '')
                        for ingr in [c for c in manuf_prod if local(c.tag) == 'ingredient']:
                            ingr_data = {'type': ingr.get('classCode', ''), 'name': '', 'strength': ''}
                            subst_nodes = [c for c in ingr if local(c.tag) in ['ingredientSubstance', 'activeMedicine']]
                            if subst_nodes:
                                name_nodes = [c for c in subst_nodes[0] if local(c.tag) == 'name']
                                if name_nodes: ingr_data['name'] = "".join(name_nodes[0].itertext()).strip()
                            qty_nodes = [c for c in ingr if local(c.tag) == 'quantity']
                            if qty_nodes:
                                num = qty_nodes[0].find('{*}numerator')
                                den = qty_nodes[0].find('{*}denominator')
                                if num is not None:
                                    val, unit = num.get('value', ''), num.get('unit', '')
                                    ingr_data['strength'] = f"{val} {unit}".strip()
                                    if den is not None and den.get('value') and den.get('value') != '1':
                                        ingr_data['strength'] += f" / {den.get('value')} {den.get('unit', '')}".strip()
                            product['ingredients'].append(ingr_data)
                        for content in [c for c in manuf_prod if local(c.tag) == 'asContent']:
                            pkg = {'quantity': '', 'form': ''}
                            qty_nodes = [c for c in content if local(c.tag) == 'quantity']
                            if qty_nodes:
                                num = qty_nodes[0].find('{*}numerator')
                                if num is not None:
                                    pkg['quantity'] = num.get('value', '')
                                    trans = num.find('{*}translation')
                                    if trans is not None: pkg['form'] = trans.get('displayName', '')
                            product['packaging'].append(pkg)
                        products.append(product)
            return products

        def parse_sec(sec_el):
            t_nodes = [n for n in sec_el if local(n.tag) == 'title']
            txt_nodes = [n for n in sec_el if local(n.tag) == 'text']
            
            # 1. Primary Title Extraction with whitespace normalization
            title = ""
            if t_nodes:
                title = " ".join("".join(t_nodes[0].itertext()).split()).strip()
            
            code_node = None
            for child in sec_el:
                if local(child.tag) == 'code':
                    code_node = child
                    break
            
            code_val = code_node.get('code', '') if code_node is not None else ""
            code_display = code_node.get('displayName', '') if code_node is not None else ""

            # 2. Fallback to first bold text if title is missing
            if not title and txt_nodes:
                # Look for first paragraph's first bold content
                first_p = [n for n in txt_nodes[0] if local(n.tag) == 'paragraph']
                if first_p:
                    # Check for first bold content
                    first_content = [n for n in first_p[0] if local(n.tag) == 'content' and 'bold' in (n.get('styleCode') or '').lower()]
                    if first_content:
                        candidate = " ".join("".join(first_content[0].itertext()).split()).strip()
                        # If it's a reasonable length and doesn't look like a whole paragraph
                        if candidate and len(candidate) < 150:
                            title = candidate.rstrip(':').strip()
            
            # 3. Final fallback to code display
            if not title and code_display:
                title = code_display
                if title.upper().startswith('OTC - '):
                    title = title[6:]
                if title.upper().endswith(' SECTION'):
                    title = title[:-8]
                
                # Cleanup common technical parts
                title = re.sub(r'\.PRINCIPAL DISPLAY PANEL$', '', title, flags=re.IGNORECASE)
                title = title.replace('.', ' ').strip()

            # Normalize Case for consistency (especially if it was all caps)
            if title and title.isupper() and len(title) > 4:
                title = title.capitalize()

            # PLR LOGIC: ENFORCE CANONICAL TITLES AND NUMBERS
            # If we detect a standard PLR code, we FORCE the correct number and title structure
            numeric_id = extract_numeric_section_id(title)
            
            if code_val in PLR_CODE_MAP:
                canonical_num = PLR_CODE_MAP[code_val]
                canonical_title = PLR_TITLE_MAP.get(canonical_num, title)
                
                # If we have a canonical number, USE IT. Do not let extraction override it with something else.
                numeric_id = canonical_num
                
                # Reconstruction: If title is missing or generic, use canonical
                if not title or 'unclassified' in title.lower():
                    title = f"{canonical_num} {canonical_title}"
                # If title exists but lacks the number, prepend it
                elif not title.startswith(canonical_num):
                    # Clean existing title if it matches canonical text (e.g. "Warnings and Precautions" -> "5 Warnings and Precautions")
                    if canonical_title.lower() in title.lower():
                         title = f"{canonical_num} {canonical_title}"
                    else:
                         title = f"{canonical_num} {title}"

            # SPECIAL: Filter out SPL listing data elements section
            # This section is technical/structured and shouldn't be in the narrative "book"
            is_listing_section = (code_val == '48780-1') or \
                                 (title and 'LISTING DATA' in title.upper()) or \
                                 (title and 'PRODUCT DATA' in title.upper()) or \
                                 (code_display and 'PRODUCT DATA' in code_display.upper()) or \
                                 (code_display and 'LISTING DATA' in code_display.upper())
            
            if is_listing_section:
                product_data.extend(parse_product_section(sec_el))
                return None

            # ID Extraction improvement: check attribute 'ID', then child <id root="...">
            sec_id = sec_el.get('ID')
            if not sec_id:
                id_nodes = [n for n in sec_el if local(n.tag) == 'id']
                if id_nodes:
                    sec_id = id_nodes[0].get('root')
            
            # Generate stable ID if still missing (needed for TOC anchoring)
            if not sec_id:
                import hashlib
                content_sample = title + (code_val or "")
                sec_id = "gen_" + hashlib.md5(content_sample.encode()).hexdigest()[:8]

            # Extract content and apply heuristic cleaning to heal line breaks
            content = to_html(txt_nodes[0], media_map, set_id) if txt_nodes else ""
            content = clean_spl_text(content)
            
            # Check for highlights in this section
            if any(local(child.tag) == 'excerpt' for child in sec_el):
                for exc in [c for c in sec_el if local(c.tag) == 'excerpt']:
                    for hl in [c for c in exc if local(c.tag) == 'highlight']:
                        hl_html = to_html(hl, media_map, set_id)
                        highlights.append({'source_section_title': title or "Highlights", 'content_html': clean_spl_text(hl_html)})

            children = []
            for comp in [c for c in sec_el if local(c.tag) == 'component']:
                for sub in [c for c in comp if local(c.tag) == 'section']:
                    parsed_sub = parse_sec(sub)
                    if parsed_sub:
                        children.append(parsed_sub)
            
            is_boxed = (code_val == '34066-1') or \
                       (title.upper().startswith('WARNING:')) or \
                       ('BOXED WARNING' in title.upper())

            return {
                'id': sec_id, 
                'numeric_id': numeric_id, 
                'title': title, 
                'content': content, 
                'children': children, 
                'is_boxed_warning': is_boxed,
                'code': code_val
            }

        for sb in [n for n in root.iter() if local(n.tag) == 'structuredBody']:
            for comp in [c for c in sb if local(c.tag) == 'component']:
                for sec in [c for c in comp if local(c.tag) == 'section']:
                    parsed_sec_item = parse_sec(sec)
                    if parsed_sec_item:
                        sections.append(parsed_sec_item)

        # --- OTC Virtual Grouping Logic ---
        is_otc = False
        root_code = root.find("{urn:hl7-org:v3}code")
        if root_code is None: # agnostic search
            for child in root:
                if local(child.tag) == 'code':
                    root_code = child
                    break
        if root_code is not None and "OTC" in (root_code.get('displayName') or '').upper():
            is_otc = True

        def build_toc(sl, prefix="", is_otc=False, set_id=""):
            """
            Robustly builds Table of Contents with strict ID isolation to prevent 
            navigation jumping between sections (e.g., Section 11 vs 12).
            """
            res = []
            # Use a dictionary to track IDs used in this specific level to prevent collisions
            used_numeric_ids = set()
            
            # Official FDA Mappings (Keep these outside the loop for performance)
            PLR_MAP = {
                '34067-9': '1', '34068-7': '2', '43678-2': '3', '34070-3': '4',
                '43685-7': '5', '34084-4': '6', '34073-7': '7', '43684-0': '8',
                '42227-9': '9', '34088-5': '10', '34089-3': '11', '34090-1': '12',
                '34091-9': '13', '34092-7': '14', '34093-5': '15', '34069-5': '16',
                '34076-0': '17'
            }
            PLR_TITLE_MAP = {
                '1': 'Indications and Usage', '2': 'Dosage and Administration',
                '3': 'Dosage Forms and Strengths', '4': 'Contraindications',
                '5': 'Warnings and Precautions', '6': 'Adverse Reactions',
                '7': 'Drug Interactions', '8': 'Use in Specific Populations',
                '9': 'Drug Abuse and Dependence', '10': 'Overdosage',
                '11': 'Description', '12': 'Clinical Pharmacology',
                '13': 'Nonclinical Toxicology', '14': 'Clinical Studies',
                '15': 'References', '16': 'How Supplied/Storage and Handling',
                '17': 'Patient Counseling Information'
            }
            OTC_CODES = {
                '55106-9', '55105-1', '34067-9', '34071-1', '34068-7', 
                '60561-8', '51727-6', '53413-1', '50570-1', '50567-7', 
                '50566-9', '50565-1'
            }

            # Internal counter for non-PLR sections
            count = 1
            drug_facts_node = None

            for s in sl:
                title = (s.get('title') or '').strip()
                sid = s.get('id')
                code = s.get('code')
                
                # 1. Skip sections that have neither title nor children (empty noise)
                if not title and not s.get('children'):
                    continue

                # 2. Unique ID Enforcement
                # If the XML ID is missing or weak, create a GUID-like ID that includes set_id
                if not sid or sid.startswith('gen_'):
                    import hashlib
                    seed = f"{set_id}_{code}_{title}_{prefix}_{count}"
                    sid = "sec_" + hashlib.md5(seed.encode()).hexdigest()[:12]

                # 3. Handle OTC Virtual Grouping
                if is_otc and (code in OTC_CODES or title.upper() == "DRUG FACTS"):
                    if not drug_facts_node:
                        drug_facts_node = {
                            'title': 'Drug Facts',
                            'id': 'drug-facts-grouping',
                            'numeric_id': None,
                            'children': [],
                            'is_drug_facts': True
                        }
                        res.append(drug_facts_node)
                    
                    if title.upper() != "DRUG FACTS":
                        child_item = {
                            'title': title,
                            'id': sid,
                            'numeric_id': None,
                            'is_drug_facts_item': True
                        }
                        child_sub = build_toc(s.get('children', []), prefix=prefix, is_otc=is_otc, set_id=set_id)
                        if child_sub: child_item['children'] = child_sub
                        drug_facts_node['children'].append(child_item)
                    continue

                # 4. Numeric ID Resolution
                num_id = s.get('numeric_id')
                
                # Priority 1: PLR Map (The Gold Standard)
                if code in PLR_MAP:
                    num_id = PLR_MAP[code]
                    # Sync the auto-counter to follow PLR if it's a top-level integer
                    try: count = int(num_id) + 1
                    except: pass
                
                # Priority 2: Inferred from Title (e.g. "12 CLINICAL PHARMACOLOGY")
                if not num_id:
                    extracted = extract_numeric_section_id(title)
                    if extracted:
                        num_id = extracted
                
                # Priority 3: Sequential fallback (only for non-PLR/non-Boxed)
                is_boxed = s.get('is_boxed_warning', False)
                should_increment = False
                
                # Blacklist for sections that should NEVER get an auto-generated number
                NON_NUMBERED_SECTIONS = [
                    "RECENT MAJOR CHANGES", "DOCUMENT HISTORY", "REVISION HISTORY",
                    "RX ONLY", "PACKAGE LABEL", "PRINCIPAL DISPLAY PANEL"
                ]
                is_excluded = any(ex in title.upper() for ex in NON_NUMBERED_SECTIONS)

                if not num_id and not is_boxed and "HIGHLIGHTS" not in title.upper() and not is_excluded:
                    num_id = f"{prefix}{count}" if prefix else str(count)
                    should_increment = True

                # 5. Semantic Title Reconstruction
                # Fixes cases where Section 11 is labeled "Unclassified" or is missing a title
                if num_id in PLR_TITLE_MAP:
                    canonical_title = PLR_TITLE_MAP[num_id]
                    if not title or 'unclassified' in title.lower() or len(title) < 3:
                        title = f"{num_id} {canonical_title}"
                    elif str(num_id) not in title:
                        title = f"{num_id} {title}"

                # 6. Final Item Assembly
                item = {
                    'title': title,
                    'id': sid,
                    'numeric_id': num_id,
                    'is_boxed_warning': is_boxed
                }

                # Recursive call for children
                new_prefix = f"{num_id}." if num_id else prefix
                children = build_toc(s.get('children', []), prefix=new_prefix, is_otc=is_otc, set_id=set_id)
                if children:
                    item['children'] = children

                res.append(item)
                if should_increment:
                    count += 1

            return res
        toc = build_toc(sections)
        if highlights: toc.insert(0, {'title': 'Highlights', 'id': 'highlights-section', 'numeric_id': None, 'is_highlights': True})
        return doc_title, sections, None, highlights, toc, product_data
    except Exception as e:
        logger.error(f"XML parse error: {e}")
    return "Error", [], None, None, [], []

def get_aggregate_content(section):
    """
    Recursively collects content from a section and its children.
    Children that have their own numeric section IDs are skipped, as they 
    will be compared independently.
    """
    content = section.get('content', '')
    for child in section.get('children', []):
        # Check if the child has its own numeric ID
        if not extract_numeric_section_id(child.get('title', '')):
            if child.get('title'):
                # Add child title as a sub-header if it exists
                content += f"<h4>{child['title']}</h4>"
            content += get_aggregate_content(child)
    return content

def flatten_sections(sections):
    res = []
    for s in sections:
        res.append(s)
        if s.get('children'): res.extend(flatten_sections(s['children']))
    return res

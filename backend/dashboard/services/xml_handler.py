import xml.etree.ElementTree as ET
from datetime import datetime
import logging
import re
from dashboard.utils import extract_numeric_section_id

logger = logging.getLogger(__name__)

def extract_metadata_from_xml(xml_string):
    """
    Parses an XML string to extract metadata: set_id, brand_name, manufacturer_name, effective_time, label_format.
    """
    if not xml_string:
        return None

    try:
        # 0. Cleanup and Basic Parsing
        xml_string_cleaned = ''.join(c for c in xml_string if c.isprintable() or c in '\n\r\t')
        
        ns = {'spl': 'urn:hl7-org:v3'}
        try:
            root = ET.fromstring(xml_string_cleaned)
        except ET.ParseError:
            root = ET.fromstring(xml_string_cleaned.strip())

        def find_el(path):
            return root.find(path, ns)
        
        def find_all_els(path):
            return root.findall(path, ns)

        # 1. Set ID
        set_id_node = find_el('./spl:setId')
        if set_id_node is None:
            set_id_node = find_el('.//spl:setId')
        set_id = set_id_node.get('root') if set_id_node is not None else None
        
        # 2. Effective Time
        effective_time_node = find_el('./spl:effectiveTime')
        if effective_time_node is None:
            effective_time_node = find_el('.//spl:effectiveTime')
            
        effective_time_str = effective_time_node.get('value') if effective_time_node is not None else ''
        try:
            effective_time = datetime.strptime(effective_time_str[:8], '%Y%m%d').strftime('%B %d, %Y')
        except (ValueError, TypeError):
            effective_time = "N/A"
            
        # 2b. Version Number
        version_node = find_el('./spl:versionNumber')
        if version_node is None:
            version_node = find_el('.//spl:versionNumber')
        version_number = version_node.get('value') if version_node is not None else "1"

        # 2c. Document Type
        doc_code_node = find_el('./spl:code')
        document_type = doc_code_node.get('displayName') if doc_code_node is not None else "Label"
        if "HUMAN PRESCRIPTION DRUG LABEL" in document_type.upper():
            document_type = "Prescription (Rx)"
        elif "OTC" in document_type.upper():
            document_type = "OTC"

        # 3. Manufacturer (Improved recursive search)
        manufacturer_name = "Unknown Manufacturer"
        # Search all representedOrganization nodes and pick the first one with a non-empty name
        org_nodes = find_all_els('.//spl:representedOrganization')
        for org in org_nodes:
            name_node = org.find('./spl:name', ns)
            if name_node is not None:
                text = "".join(name_node.itertext()).strip()
                if text:
                    manufacturer_name = text
                    break
        
        # 4. Brand Name & Generic Name
        brand_name = "Unknown Drug"
        generic_name = "Unknown Generic"
        
        # Search all manufacturedProduct levels
        product_nodes = find_all_els('.//spl:manufacturedProduct/spl:manufacturedProduct')
        if not product_nodes:
            product_nodes = find_all_els('.//spl:manufacturedProduct')

        if product_nodes:
            # Use the first one for primary metadata
            node = product_nodes[0]
            
            # Brand Name
            name_node = node.find('./spl:name', ns)
            if name_node is not None:
                brand_name = "".join(name_node.itertext()).strip()
            
            # Generic Name
            generic_node = node.find('./spl:asEntityWithGeneric/spl:genericMedicine/spl:name', ns)
            if generic_node is not None:
                generic_name = "".join(generic_node.itertext()).strip()
            
            if generic_name == "Unknown Generic" or not generic_name:
                ingr_nodes = node.findall('.//spl:activeIngredient/spl:activeMedicine/spl:name', ns)
                if ingr_nodes:
                    generic_name = ", ".join(["".join(ingr.itertext()).strip() for ingr in ingr_nodes])

        # CLEANING for UI and FAERS
        def clean_drug_name(name):
            if not name or name == "Unknown Generic" or name == "Unknown Drug":
                return name
            
            if "highlights do not include" in name.lower():
                m = re.search(r'\(([^)]+)\)', name)
                if m: return m.group(1).strip()
                return "Unknown Generic"

            n = re.sub(r'\d+(\.\d+)?\s*(mg|mcg|g|ml|%|unit|iu)\b.*$', '', name, flags=re.IGNORECASE).strip()
            n = re.sub(r'\s+(tablet|capsule|injection|cream|ointment|gel|solution|suspension|spray|inhaler|powder).*$', '', n, flags=re.IGNORECASE).strip()
            n = re.sub(r'\(.*?\)', '', n).strip()
            return n

        generic_name_cleaned = clean_drug_name(generic_name)
        brand_name_cleaned = clean_drug_name(brand_name)

        faers_search_name = generic_name_cleaned
        if faers_search_name and ',' in faers_search_name:
            faers_search_name = faers_search_name.split(',')[0].strip()
        
        # 5. Label Format
        has_warnings_precautions = False
        has_description = False
        has_warnings = False
        has_boxed_warning = False
        
        for section in find_all_els('.//spl:section'):
            code_node = section.find('./spl:code', ns)
            if code_node is not None:
                code = code_node.get('code')
                title_node = section.find('./spl:title', ns)
                title = "".join(title_node.itertext()).strip().lower() if title_node is not None else ""
                
                if code == '34066-1' or 'boxed warning' in title or 'box warning' in title:
                    has_boxed_warning = True

                if code == '43685-7':
                    has_warnings_precautions = True
                elif code == '34071-1':
                    if 'precautions' in title: has_warnings_precautions = True
                    if 'warnings' in title and 'precautions' not in title: has_warnings = True
                
                if code == '34089-3' or 'description' in title: has_description = True

        has_highlights = find_el('.//spl:excerpt') is not None
                    
        label_format = 'non-PLR'
        if has_warnings_precautions or has_highlights:
            label_format = 'PLR'
        elif has_description and has_warnings:
            label_format = 'non-PLR'
        elif has_warnings_precautions: 
             label_format = 'PLR'
             
        # 6. NDCs and Application Numbers
        ndc_set = set()
        app_num_set = set()
        
        for elem in root.iter():
            # NDC OID
            if elem.get('codeSystem') == '2.16.840.1.113883.6.69':
                val = elem.get('code')
                if val: ndc_set.add(val)
            
            # Application Number OID
            if elem.get('root') == '2.16.840.1.113883.3.150':
                val = elem.get('extension')
                if val: app_num_set.add(val)

        try:
            full_text_norm = " ".join("".join(root.itertext()).split())
            matches = re.finditer(r'NDC(?:[:#\s]+)?(\d{4,5}\s*-\s*\d{3,4}\s*-\s*\d{1,2})', full_text_norm, re.IGNORECASE)
            for m in matches:
                clean_ndc = re.sub(r'\s+', '', m.group(1))
                ndc_set.add(clean_ndc)
        except Exception as e:
            logger.warning(f"Text extraction of NDC failed: {e}")

        ndc = ", ".join(sorted(list(ndc_set))) if ndc_set else "N/A"
        app_num = ", ".join(sorted(list(app_num_set))) if app_num_set else "N/A"

        return {
            'set_id': set_id,
            'brand_name': brand_name,
            'generic_name': generic_name,
            'manufacturer_name': manufacturer_name,
            'effective_time': effective_time,
            'label_format': label_format,
            'ndc': ndc,
            'application_number': app_num,
            'version_number': version_number,
            'document_type': document_type,
            'has_boxed_warning': has_boxed_warning,
            'faers_search_name': faers_search_name
        }
    except Exception as e:
        logger.error(f"Error extracting metadata from XML: {e}")
        return None

def to_html(element, media_map=None, set_id=None):
    if element is None: return ""
    tag_map = {'paragraph': 'p', 'linkHtml': 'a', 'list': 'ul', 'item': 'li', 'content': 'span', 'sub': 'sub', 'sup': 'sup', 'br': 'br', 'renderMultiMedia': 'div', 'caption': 'p'}
    raw_tag = element.tag.split('}')[-1] if '}' in element.tag else element.tag
    html_tag = tag_map.get(raw_tag, raw_tag) 
    if raw_tag == 'list' and element.get('listType') == 'ordered': html_tag = 'ol'
    if raw_tag == 'renderMultiMedia':
        ref_id = element.get('referencedObject')
        filename = media_map.get(ref_id) if media_map else None
        html = "".join([to_html(child, media_map, set_id) for child in element])
        img_html = f'<img src="https://dailymed.nlm.nih.gov/dailymed/image.cfm?setid={set_id}&name={filename}" alt="{filename}" class="spl-image" style="max-width: 100%; height: auto; display: block; margin: 10px auto;" />' if filename and set_id else ""
        return f'<div class="spl-figure" style="text-align: center; margin: 20px 0;">{img_html}{html}</div>{element.tail or ""}'
    attrs_list = []
    class_list = []
    for k, v in element.attrib.items():
        if 'xmlns' not in k:
            if html_tag == 'a' and k == 'href': attrs_list.append(f'{k}="{v}"')
            elif k == 'styleCode':
                style_map = {'bold': 'Bold', 'italic': 'Emphasis', 'underline': 'Underline'}
                for style in v.split(' '):
                    if style.lower() in style_map: class_list.append(style_map[style.lower()])
    if class_list: attrs_list.append(f'class="{" ".join(class_list)}"')
    attrs = ' '.join(attrs_list)
    html = (element.text or '') + "".join([to_html(child, media_map, set_id) for child in element])
    if html_tag not in ['br']: return f"<{html_tag} {attrs}>{html}</{html_tag}>{element.tail or ''}"
    else: return f"<{html_tag} {attrs}/>{element.tail or ''}"

def extract_media_map(root, ns):
    media_map = {}
    for media in root.findall('.//spl:observationMedia', ns):
        mid = media.get('ID')
        value = media.find('./spl:value', ns)
        if value is not None:
            ref = value.find('./spl:reference', ns)
            if ref is not None:
                filename = ref.get('value')
                if mid and filename: media_map[mid] = filename
    return media_map

def parse_component(component_element, ns, media_map=None, set_id=None):
    section_element = component_element.find('./spl:section', ns)
    if section_element is None: return None
    title_element = section_element.find('./spl:title', ns)
    text_element = section_element.find('./spl:text', ns)
    title = "".join(title_element.itertext()).strip() if title_element is not None else ""
    content_html = to_html(text_element, media_map, set_id) if text_element is not None else ""
    section_id = section_element.get('ID')
    numeric_id = extract_numeric_section_id(title)
    children = [parse_component(child_comp, ns, media_map, set_id) for child_comp in section_element.findall('./spl:component', ns) if parse_component(child_comp, ns, media_map, set_id) is not None]
    return {'id': section_id, 'numeric_id': numeric_id, 'title': title, 'content': content_html.strip(), 'children': children, 'is_boxed_warning': title.strip().upper().startswith('WARNING:')}

def parse_spl_xml(xml_string, set_id=None):
    if not xml_string: return "Error Parsing", [], None, None, []
    try:
        ns = {'spl': 'urn:hl7-org:v3'}
        xml_string_cleaned = ''.join(c for c in xml_string if c.isprintable() or c in '\n\r\t')
        root = ET.fromstring(xml_string_cleaned)
        media_map = extract_media_map(root, ns)
        doc_title_element = root.find('.//spl:title', ns)
        doc_title = "".join(doc_title_element.itertext()).strip() if doc_title_element is not None else "Unknown Drug"
        structured_body = root.find('.//spl:structuredBody', ns)
        if structured_body is None:
            first_text_element = root.find('.//spl:text', ns)
            if first_text_element is not None:
                fallback_html = to_html(first_text_element, media_map, set_id)
                return doc_title, [], (fallback_html if fallback_html.strip() else None), None, []
            return doc_title, [], None, None, []
        sections = [parse_component(comp, ns, media_map, set_id) for comp in structured_body.findall('./spl:component', ns) if parse_component(comp, ns, media_map, set_id) is not None]
        highlights = []
        sections_with_excerpts = root.findall('.//spl:section[spl:excerpt]', ns)
        for section in sections_with_excerpts:
            title_element = section.find('./spl:title', ns)
            title = "".join(title_element.itertext()).strip() if title_element is not None else "Untitled Section"
            highlight_node = section.find('.//spl:highlight', ns)
            if highlight_node is not None:
                highlights.append({'source_section_title': title, 'content_html': to_html(highlight_node, media_map, set_id)})
        def build_toc(section_list):
            toc = []
            for s in section_list:
                if s and s.get('title') and s.get('id'):
                    toc.append({'title': s['title'], 'id': s['id']})
                    if s.get('children'): toc.extend(build_toc(s['children']))
            return toc
        table_of_contents = build_toc(sections)
        if highlights: table_of_contents.insert(0, {'title': 'Highlights of Prescribing Information', 'id': 'highlights-section'})
        return doc_title, sections, None, highlights, table_of_contents
    except Exception as e:
        logger.error(f"XML parsing error: {e}")
    return "Error Parsing", [], None, None, []

def get_aggregate_content(section):
    content = section.get('content', '')
    for child in section.get('children', []):
        if not extract_numeric_section_id(child.get('title', '')):
            if child.get('title'): content += f"<h4>{child['title']}</h4>"
            content += get_aggregate_content(child)
    return content

def flatten_sections(sections):
    flat_list = []
    for section in sections:
        flat_list.append(section)
        if section.get('children'): flat_list.extend(flatten_sections(section['children']))
    return flat_list

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
    try:
        ns = {'spl': 'urn:hl7-org:v3'}
        root = ET.fromstring(xml_string)
        
        # 1. Set ID
        set_id_node = root.find('./spl:setId', ns)
        set_id = set_id_node.get('root') if set_id_node is not None else None
        
        # 2. Effective Time
        effective_time_node = root.find('./spl:effectiveTime', ns)
        effective_time_str = effective_time_node.get('value') if effective_time_node is not None else ''
        try:
            effective_time = datetime.strptime(effective_time_str[:8], '%Y%m%d').strftime('%B %d, %Y')
        except (ValueError, TypeError):
            effective_time = "N/A"
            
        # 2b. Version Number
        version_node = root.find('./spl:versionNumber', ns)
        version_number = version_node.get('value') if version_node is not None else "1"

        # 2c. Document Type
        doc_code_node = root.find('./spl:code', ns)
        document_type = doc_code_node.get('displayName') if doc_code_node is not None else "Label"
        # Shorten common types
        if "HUMAN PRESCRIPTION DRUG LABEL" in document_type.upper():
            document_type = "Prescription (Rx)"
        elif "OTC" in document_type.upper():
            document_type = "OTC"

        # 3. Manufacturer
        manufacturer_node = root.find('.//spl:author/spl:assignedEntity/spl:representedOrganization/spl:name', ns)
        manufacturer_name = manufacturer_node.text if manufacturer_node is not None else "Unknown Manufacturer"
        
        # 4. Brand Name & Generic Name (Need to dig into manufacturedProduct)
        brand_name = "Unknown Drug"
        generic_name = "Unknown Generic"
        
        # Try to find the first manufactured product
        product_node = root.find('.//spl:subject/spl:manufacturedProduct/spl:manufacturedProduct', ns)
        if product_node is not None:
            # Brand Name
            name_node = product_node.find('./spl:name', ns)
            if name_node is not None:
                brand_name = name_node.text
            
            # Generic Name
            generic_node = product_node.find('./spl:asEntityWithGeneric/spl:genericMedicine/spl:name', ns)
            if generic_node is not None:
                generic_name = generic_node.text
        
        # 5. Label Format (PLR vs Non-PLR) & Boxed Warning Detection
        has_warnings_precautions = False
        has_description = False
        has_warnings = False
        has_boxed_warning = False
        
        for section in root.findall('.//spl:section', ns):
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
                    if 'precautions' in title:
                        has_warnings_precautions = True
                    if 'warnings' in title and 'precautions' not in title:
                         has_warnings = True
                
                if code == '34089-3' or 'description' in title:
                    has_description = True

        # Check for Highlights (presence of excerpts is a strong indicator of PLR)
        has_highlights = False
        if root.find('.//spl:excerpt', ns) is not None:
            has_highlights = True
                    
        label_format = 'non-PLR'
        if has_warnings_precautions or has_highlights:
            label_format = 'PLR'
        elif has_description and has_warnings:
            label_format = 'non-PLR'
        elif has_warnings_precautions: # Fallback if code matches
             label_format = 'PLR'
             
        # 6. NDCs and Application Numbers (Global Search by OID + Text Pattern)
        ndc_set = set()
        app_num_set = set()
        
        # Strategy A: OID Search
        for elem in root.iter():
            if elem.get('codeSystem') == '2.16.840.1.113883.6.69':
                code = elem.get('code')
                if code:
                    ndc_set.add(code)
            
            if elem.get('root') == '2.16.840.1.113883.3.150':
                ext = elem.get('extension')
                if ext:
                    app_num_set.add(ext)

        # Strategy B: Text Pattern Search (Supplementary for NDC)
        try:
            full_text = "".join(root.itertext())
            full_text = "".join(full_text.split()) # Aggressive whitespace removal for regex matching?
            # Actually, removing all spaces first might merge "NDC" and "123". "NDC123..."
            # But the user said "remove all xml tags before the pattern match".
            # itertext() does that.
            # "sometimes they have tags round each group".
            # If tags are around groups, itertext might have spaces or not depending on the XML formatting.
            # Let's use the normalized space version from the test script.
            
            full_text_norm = " ".join("".join(root.itertext()).split())
            
            # Pattern: NDC followed by optional punctuation/space, then the code
            # Matches "NDC 12345-123-12", "NDC: 12345-123-12", "NDC# 12345-123-12"
            matches = re.finditer(r'NDC(?:[:#\s]+)?(\d{4,5}\s*-\s*\d{3,4}\s*-\s*\d{1,2})', full_text_norm, re.IGNORECASE)
            for m in matches:
                clean_ndc = re.sub(r'\s+', '', m.group(1))
                ndc_set.add(clean_ndc)
        except Exception as e:
            logger.warning(f"Text extraction of NDC failed: {e}")

        # Deduplicate and Join
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
            'has_boxed_warning': has_boxed_warning
        }
    except Exception as e:
        logger.error(f"Error extracting metadata from XML: {e}")
        return None

def to_html(element, media_map=None, set_id=None):
    """
    Recursively reconstructs the HTML content of an element, mapping SPL tags to standard HTML.
    Handles image rendering via DailyMed proxy.
    """
    if element is None:
        return ""

    # Define the mapping from SPL tags to HTML tags
    tag_map = {
        'paragraph': 'p',
        'linkHtml': 'a',
        'list': 'ul',
        'item': 'li',
        'content': 'span',
        'sub': 'sub',
        'sup': 'sup',
        'br': 'br',
        'renderMultiMedia': 'div',
        'caption': 'p'
    }

    # Get the raw tag name without the namespace
    raw_tag = element.tag.split('}')[-1] if '}' in element.tag else element.tag

    # Choose the appropriate HTML tag
    html_tag = tag_map.get(raw_tag, raw_tag) 

    # Special handling for list type
    if raw_tag == 'list' and element.get('listType') == 'ordered':
        html_tag = 'ol'

    # Special handling for images
    if raw_tag == 'renderMultiMedia':
        ref_id = element.get('referencedObject')
        filename = media_map.get(ref_id) if media_map else None
        
        # Process children (captions)
        html = ""
        for child in element:
            html += to_html(child, media_map, set_id)
            
        img_html = ""
        if filename and set_id:
            img_url = f"https://dailymed.nlm.nih.gov/dailymed/image.cfm?setid={set_id}&name={filename}"
            img_html = f'<img src="{img_url}" alt="{filename}" class="spl-image" style="max-width: 100%; height: auto; display: block; margin: 10px auto;" />'
            
        tail = element.tail or ''
        return f'<div class="spl-figure" style="text-align: center; margin: 20px 0;">{img_html}{html}</div>{tail}'

    # Build attributes string, keeping href for 'a' tags
    attrs_list = []
    class_list = []
    for k, v in element.attrib.items():
        if 'xmlns' not in k:
            if html_tag == 'a' and k == 'href':
                attrs_list.append(f'{k}="{v}"')
            elif k == 'styleCode':
                style_map = {
                    'bold': 'Bold',
                    'italic': 'Emphasis',
                    'underline': 'Underline',
                }
                for style in v.split(' '):
                    if style.lower() in style_map:
                        class_list.append(style_map[style.lower()])

    if class_list:
        attrs_list.append(f'class="{" ".join(class_list)}"')

    attrs = ' '.join(attrs_list)
    
    # The 'text' of the element is the content before the first child
    html = element.text or ''
    # Recursively process children
    for child in element:
        html += to_html(child, media_map, set_id)
    
    # The 'tail' of the element is the content after its closing tag
    tail = element.tail or ''

    if html_tag not in ['br']: 
        return f"<{html_tag} {attrs}>{html}</{html_tag}>{tail}"
    else:
        return f"<{html_tag} {attrs}/>{tail}"


def extract_media_map(root, ns):
    """ Helper to map media IDs to filenames """
    media_map = {}
    for media in root.findall('.//spl:observationMedia', ns):
        mid = media.get('ID')
        value = media.find('./spl:value', ns)
        if value is not None:
            ref = value.find('./spl:reference', ns)
            if ref is not None:
                filename = ref.get('value')
                if mid and filename:
                    media_map[mid] = filename
    return media_map

def parse_component(component_element, ns, media_map=None, set_id=None):
    """
    Recursively parses a <component> element and its children.
    """
    section_element = component_element.find('./spl:section', ns)
    if section_element is None:
        return None

    title_element = section_element.find('./spl:title', ns)
    text_element = section_element.find('./spl:text', ns)

    title = "".join(title_element.itertext()).strip() if title_element is not None else ""
    content_html = to_html(text_element, media_map, set_id) if text_element is not None else ""
    
    # Extract the section's ID for linking
    section_id = section_element.get('ID')
    
    # Extract numeric ID for smart linking/annotations
    numeric_id = extract_numeric_section_id(title)

    children = []
    for child_comp in section_element.findall('./spl:component', ns):
        child_section = parse_component(child_comp, ns, media_map, set_id)
        if child_section:
            children.append(child_section)

    return {
        'id': section_id,
        'numeric_id': numeric_id,
        'title': title,
        'content': content_html.strip(),
        'children': children,
        'is_boxed_warning': title.strip().upper().startswith('WARNING:')
    }

def parse_spl_xml(xml_string, set_id=None):
    """
    Parses the SPL XML into a hierarchical structure of sections,
    extracts highlight excerpts, and generates a Table of Contents.
    """
    if not xml_string:
        return "Error Parsing", [], None, None, []

    try:
        ns = {'spl': 'urn:hl7-org:v3'}
        xml_string_cleaned = ''.join(c for c in xml_string if c.isprintable())
        root = ET.fromstring(xml_string_cleaned)

        # Extract Media Map
        media_map = extract_media_map(root, ns)

        doc_title_element = root.find('.//spl:title', ns)
        doc_title = "".join(doc_title_element.itertext()).strip() if doc_title_element is not None else "Unknown Drug"

        structured_body = root.find('.//spl:structuredBody', ns)
        if structured_body is None:
            first_text_element = root.find('.//spl:text', ns)
            if first_text_element is not None:
                fallback_html = to_html(first_text_element, media_map, set_id)
                if fallback_html.strip():
                    return doc_title, [], fallback_html, None, []
            return doc_title, [], None, None, []

        sections = [parse_component(comp, ns, media_map, set_id) for comp in structured_body.findall('./spl:component', ns) if parse_component(comp, ns, media_map, set_id) is not None]

        # Extract highlights from excerpts and include their source section title
        highlights = []
        # Find all sections that have an excerpt
        sections_with_excerpts = root.findall('.//spl:section[spl:excerpt]', ns)
        for section in sections_with_excerpts:
            title_element = section.find('./spl:title', ns)
            title = "".join(title_element.itertext()).strip() if title_element is not None else "Untitled Section"
            
            highlight_node = section.find('.//spl:highlight', ns)
            if highlight_node is not None:
                content_html = to_html(highlight_node, media_map, set_id)
                highlights.append({
                    'source_section_title': title,
                    'content_html': content_html
                })

        # Generate Table of Contents from all top-level sections
        table_of_contents = [{'title': s['title'], 'id': s['id']} for s in sections if s and s.get('title') and s.get('id')]

        # Prepend Highlights to Table of Contents if highlights exist
        if highlights:
            table_of_contents.insert(0, {'title': 'Highlights of Prescribing Information', 'id': 'highlights-section'})

        return doc_title, sections, None, highlights, table_of_contents

    except ET.ParseError as e:
        logger.error(f"Error parsing XML: {e}")
    except Exception as e:
        logger.error(f"An unexpected error occurred during XML parsing: {e}")
    
    return "Error Parsing", [], None, None, []

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
    """
    Recursively flattens a list of sections and their children.
    """
    flat_list = []
    for section in sections:
        flat_list.append(section)
        if section.get('children'):
            flat_list.extend(flatten_sections(section['children']))
    return flat_list


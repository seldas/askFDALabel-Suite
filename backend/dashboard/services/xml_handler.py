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
        def parse_sec(sec_el):
            t_nodes = [n for n in sec_el if local(n.tag) == 'title']
            txt_nodes = [n for n in sec_el if local(n.tag) == 'text']
            title = "".join(t_nodes[0].itertext()).strip() if t_nodes else ""
            
            # Extract content and apply heuristic cleaning to heal line breaks
            content = to_html(txt_nodes[0], media_map, set_id) if txt_nodes else ""
            content = clean_spl_text(content)
            
            # Check for highlights in this section
            if any(local(child.tag) == 'excerpt' for child in sec_el):
                for exc in [c for c in sec_el if local(c.tag) == 'excerpt']:
                    for hl in [c for c in exc if local(c.tag) == 'highlight']:
                        hl_html = to_html(hl, media_map, set_id)
                        highlights.append({'source_section_title': title, 'content_html': clean_spl_text(hl_html)})

            children = []
            for comp in [c for c in sec_el if local(c.tag) == 'component']:
                for sub in [c for c in comp if local(c.tag) == 'section']:
                    children.append(parse_sec(sub))
            return {'id': sec_el.get('ID'), 'numeric_id': extract_numeric_section_id(title), 'title': title, 'content': content, 'children': children, 'is_boxed_warning': title.upper().startswith('WARNING:')}

        for sb in [n for n in root.iter() if local(n.tag) == 'structuredBody']:
            for comp in [c for c in sb if local(c.tag) == 'component']:
                for sec in [c for c in comp if local(c.tag) == 'section']:
                    sections.append(parse_sec(sec))

        if not sections:
            txt_nodes = [n for n in root if local(n.tag) == 'text']
            if txt_nodes: 
                fallback = to_html(txt_nodes[0], media_map, set_id)
                return doc_title, [], clean_spl_text(fallback), None, []

        def build_toc(sl):
            res = []
            for s in sl:
                if s['title'] and s['id']:
                    item = {
                        'title': s['title'], 
                        'id': s['id'],
                        'numeric_id': s.get('numeric_id')
                    }
                    children = build_toc(s.get('children', []))
                    if children:
                        item['children'] = children
                    res.append(item)
            return res
        toc = build_toc(sections)
        if highlights: toc.insert(0, {'title': 'Highlights of Prescribing Information', 'id': 'highlights-section', 'numeric_id': None})
        return doc_title, sections, None, highlights, toc
    except Exception as e:
        logger.error(f"XML parse error: {e}")
    return "Error", [], None, None, []

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

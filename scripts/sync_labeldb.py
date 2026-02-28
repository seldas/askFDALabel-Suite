import sqlite3
import xml.etree.ElementTree as ET
import os
import glob
import re

# Namespace for SPL XML
NS = {'ns': 'urn:hl7-org:v3'}

def strip_tags(text):
    if not text:
        return ""
    # Simple regex to remove XML tags
    return re.sub(r'<[^>]*>', ' ', text).strip()

def get_text(element):
    if element is None:
        return ""
    return ET.tostring(element, encoding='unicode', method='text').strip()

def get_xml(element):
    if element is None:
        return ""
    return ET.tostring(element, encoding='unicode').strip()

def sync_xml_to_db(xml_path, db_path="data/label.db"):
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
    except Exception as e:
        print(f"Error parsing {xml_path}: {e}")
        return

    # 1. Basic Metadata
    spl_id = root.find('ns:id', NS).get('root') if root.find('ns:id', NS) is not None else None
    set_id = root.find('ns:setId', NS).get('root') if root.find('ns:setId', NS) is not None else None
    
    if not spl_id:
        print(f"Skipping {xml_path}: No SPL ID found.")
        return

    effective_time = root.find('ns:effectiveTime', NS).get('value') if root.find('ns:effectiveTime', NS) is not None else ""
    revised_date = f"{effective_time[:4]}-{effective_time[4:6]}-{effective_time[6:8]}" if len(effective_time) >= 8 else effective_time
    
    doc_type_el = root.find('ns:code', NS)
    doc_type = doc_type_el.get('displayName') if doc_type_el is not None else ""

    # Initial Approval Year from Title (common in SPL)
    title_text = get_text(root.find('ns:title', NS))
    appr_year_match = re.search(r'Initial U.S. Approval:\s*(\d{4})', title_text)
    initial_approval_year = int(appr_year_match.group(1)) if appr_year_match else None

    # Manufacturer
    manufacturer = ""
    author_org = root.find('.//ns:author/ns:assignedEntity/ns:representedOrganization/ns:name', NS)
    if author_org is not None:
        manufacturer = author_org.text

    # 2. Product Information (Aggregation)
    product_names = []
    generic_names = []
    active_ingredients = []
    market_categories = []
    routes = []
    dosage_forms = []
    ndc_codes = []
    appr_nums = []

    # Mapping tables data
    ingr_map = [] # (spl_id, name, is_active)
    
    products = root.findall('.//ns:manufacturedProduct/ns:manufacturedProduct', NS)
    for prod in products:
        # Name
        name_el = prod.find('ns:name', NS)
        if name_el is not None:
            product_names.append(get_text(name_el))
        
        # Generic Name
        gen_name_el = prod.find('.//ns:genericMedicine/ns:name', NS)
        if gen_name_el is not None:
            generic_names.append(gen_name_el.text)
        
        # Form
        form_el = prod.find('ns:formCode', NS)
        if form_el is not None:
            dosage_forms.append(form_el.get('displayName'))
            
        # NDC
        ndc_el = prod.find('ns:code', NS)
        if ndc_el is not None:
            ndc_codes.append(ndc_el.get('code'))
            
        # Approval Num
        appr_el = root.find('.//ns:approval/ns:id', NS) # Usually global to the doc
        if appr_el is not None:
            appr_nums.append(appr_el.get('extension'))

        # Ingredients
        ingrs = prod.findall('ns:ingredient', NS)
        for ingr in ingrs:
            class_code = ingr.get('classCode')
            subst = ingr.find('ns:ingredientSubstance/ns:name', NS)
            if subst is not None:
                is_active = 1 if class_code in ['ACTIM', 'ACTIB'] else 0
                sub_name = subst.text
                if is_active:
                    active_ingredients.append(sub_name)
                ingr_map.append((spl_id, sub_name, is_active))

        # Routes
        route_els = prod.findall('.//ns:routeCode', NS)
        for rel in route_els:
            routes.append(rel.get('displayName'))

    # Dedup and join
    product_names = "; ".join(list(set(product_names)))
    generic_names = "; ".join(list(set(generic_names)))
    active_ingredients = "; ".join(list(set(active_ingredients)))
    dosage_forms = "; ".join(list(set(dosage_forms)))
    ndc_codes = "; ".join(list(set(ndc_codes)))
    routes = "; ".join(list(set(routes)))
    appr_num = "; ".join(list(set(appr_nums)))

    # 3. Sections
    sections_to_db = [] # (spl_id, loinc, title, xml)
    sections_to_fts = [] # (spl_id, loinc, title, text)
    
    sections = root.findall('.//ns:section', NS)
    for sec in sections:
        code_el = sec.find('ns:code', NS)
        loinc = code_el.get('code') if code_el is not None else ""
        title = get_text(sec.find('ns:title', NS))
        
        # We only want content from the <text> block
        text_el = sec.find('ns:text', NS)
        if text_el is not None:
            raw_xml = get_xml(text_el)
            plain_text = strip_tags(raw_xml)
            sections_to_db.append((spl_id, loinc, title, raw_xml))
            sections_to_fts.append((spl_id, loinc, title, plain_text))

    # 4. Save to DB
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    # Insert Metadata
    cursor.execute("""
    INSERT OR REPLACE INTO sum_spl (
        spl_id, set_id, product_names, generic_names, manufacturer, 
        appr_num, active_ingredients, market_categories, doc_type, 
        routes, dosage_forms, revised_date, initial_approval_year
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        spl_id, set_id, product_names, generic_names, manufacturer,
        appr_num, active_ingredients, "", doc_type,
        routes, dosage_forms, revised_date, initial_approval_year
    ))

    # Insert Ingredients Map
    cursor.executemany("INSERT INTO active_ingredients_map (spl_id, substance_name, is_active) VALUES (?, ?, ?)", ingr_map)

    # Insert Sections
    cursor.executemany("INSERT INTO spl_sections (spl_id, loinc_code, title, content_xml) VALUES (?, ?, ?, ?)", sections_to_db)
    cursor.executemany("INSERT INTO spl_sections_search (spl_id, loinc_code, title, content_text) VALUES (?, ?, ?, ?)", sections_to_fts)

    conn.commit()
    conn.close()
    print(f"Successfully synced {xml_path} (SPL: {spl_id})")

def sync_all(upload_dir="data/uploads/", db_path="data/label.db"):
    xml_files = glob.glob(os.path.join(upload_dir, "*.xml"))
    for f in xml_files:
        sync_xml_to_db(f, db_path)

if __name__ == "__main__":
    sync_all()

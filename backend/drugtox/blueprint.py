"""
drugtox/routes.py  (drop-in replacement)

Goal:
- Keep Postgres-safe quoted identifiers (mixed-case columns)
- Return JSON keys that MATCH the existing frontend expectations:
  SETID, Trade_Name, Generic_Proper_Names, Toxicity_Class, Author_Organization,
  Tox_Type, SPL_Effective_Time, Changed, is_historical, etc.
- Avoid closing Flask-SQLAlchemy sessions manually.
"""

from flask import Blueprint, request, jsonify, current_app
from sqlalchemy import text
from collections import defaultdict
from database.extensions import db
from openpyxl import Workbook
import tempfile
from flask import send_file
from datetime import datetime

drugtox_bp = Blueprint("drugtox", __name__)

# If your drug_toxicity table is in schema "public"
PG_SCHEMA = "public"


def qname(name: str) -> str:
    """Quote identifiers safely for mixed-case columns and reserved words."""
    return '"' + name.replace('"', '""') + '"'


def fq_table(table: str, schema: str = PG_SCHEMA) -> str:
    """Fully-qualified table name with schema."""
    return f"{qname(schema)}.{qname(table)}"


def get_db_session():
    # Flask-SQLAlchemy scoped session
    return db.session


# -----------------------
# Helpers (consistency)
# -----------------------

# Canonical columns your frontend expects for DrugSummary/Detail/History/Market
DRUG_COLS = [
    "SETID",
    "Trade_Name",
    "Generic_Proper_Names",
    "Toxicity_Class",
    "Author_Organization",
    "Tox_Type",
    "SPL_Effective_Time",
    "Changed",
    "is_historical",
]

# In some tables you might have additional fields (detail view)
DETAIL_EXTRA_COLS = [
    "Update_Notes",
    "AI_Summary",
]


def select_cols(cols):
    """
    Build a SELECT list that preserves exact mixed-case keys in result mapping.
    Example: "Toxicity_Class" AS "Toxicity_Class"
    """
    return ",\n               ".join([f"{qname(c)} AS {qname(c)}" for c in cols])


def rowdicts(rows):
    return [dict(r._mapping) for r in rows]


# -----------------------
# Routes
# -----------------------

@drugtox_bp.route("/stats")
def get_stats():
    tox_type = request.args.get("tox_type", "DILI")
    sess = get_db_session()

    # IMPORTANT: return Toxicity_Class key (frontend expects it)
    dist_query = text(f"""
        SELECT {qname("Toxicity_Class")} AS {qname("Toxicity_Class")},
               COUNT(*) AS count
        FROM {fq_table("drug_toxicity")}
        WHERE {qname("Tox_Type")} = :tox
          AND {qname("is_historical")} = 0
        GROUP BY {qname("Toxicity_Class")}
    """)
    dist = sess.execute(dist_query, {"tox": tox_type}).fetchall()

    changes_query = text(f"""
        SELECT COUNT(*) AS count
        FROM {fq_table("drug_toxicity")}
        WHERE {qname("Tox_Type")} = :tox
          AND {qname("is_historical")} = 0
          AND {qname("Changed")} = 'Yes'
    """)
    total_changes = sess.execute(changes_query, {"tox": tox_type}).scalar()

    return jsonify({
        "distribution": rowdicts(dist),
        "total_changes": int(total_changes or 0),
    })


@drugtox_bp.route("/drugs")
def get_drugs():
    q = request.args.get("q", "")
    tox_type = request.args.get("tox_type", "DILI")
    show_historical = request.args.get("show_historical") == "true"
    changed_only = request.args.get("changed_only") == "true"
    page = int(request.args.get("page", 1))
    limit = int(request.args.get("limit", 20))
    offset = (page - 1) * limit

    sess = get_db_session()

    where_clauses = [f"{qname('Tox_Type')} = :tox"]
    params = {"tox": tox_type, "limit": limit, "offset": offset}

    if q:
        # Use ILIKE for case-insensitive search in Postgres
        where_clauses.append(
            f"({qname('Trade_Name')} ILIKE :q "
            f" OR {qname('Generic_Proper_Names')} ILIKE :q "
            f" OR {qname('Author_Organization')} ILIKE :q)"
        )
        params["q"] = f"%{q}%"

    if not show_historical:
        where_clauses.append(f"{qname('is_historical')} = 0")

    if changed_only:
        where_clauses.append(f"{qname('Changed')} = 'Yes'")

    where_clause = " AND ".join(where_clauses)

    query = text(f"""
        SELECT {select_cols(DRUG_COLS)}
        FROM {fq_table("drug_toxicity")}
        WHERE {where_clause}
        ORDER BY {qname("Trade_Name")} ASC
        LIMIT :limit OFFSET :offset
    """)
    rows = sess.execute(query, params).fetchall()

    count_query = text(f"""
        SELECT COUNT(*) AS count
        FROM {fq_table("drug_toxicity")}
        WHERE {where_clause}
    """)
    total = sess.execute(count_query, params).scalar()

    return jsonify({
        "items": rowdicts(rows),
        "total": int(total or 0),
    })


@drugtox_bp.route("/discrepancies")
def get_discrepancies():
    tox_type = request.args.get("tox_type", "DILI")
    tox_map = {"Most": 3, "Less": 2, "No": 1, "Precaution": 0, "Unknown": 0}

    sess = get_db_session()

    # Pull rows with keys matching frontend detail objects:
    # details: { Trade_Name, Author_Organization, Toxicity_Class, SETID }
    query = text(f"""
        SELECT
            {qname("Generic_Proper_Names")} AS {qname("Generic_Proper_Names")},
            {qname("Author_Organization")} AS {qname("Author_Organization")},
            {qname("Toxicity_Class")} AS {qname("Toxicity_Class")},
            {qname("Trade_Name")} AS {qname("Trade_Name")},
            {qname("SETID")} AS {qname("SETID")}
        FROM {fq_table("drug_toxicity")}
        WHERE {qname("Tox_Type")} = :tox
          AND {qname("is_historical")} = 0
    """)
    rows = sess.execute(query, {"tox": tox_type}).fetchall()

    groups = defaultdict(list)
    for r in rows:
        d = dict(r._mapping)
        groups[d["Generic_Proper_Names"]].append(d)

    discrepancies_raw = []
    generic_names_to_check = []

    for generic_name, items in groups.items():
        unique_classes = set(item["Toxicity_Class"] for item in items)
        if len(unique_classes) > 1:
            generic_names_to_check.append(generic_name)
            discrepancies_raw.append({
                "generic_name": generic_name,
                "items": items,
                "unique_classes": unique_classes,
            })

    # Batch fetch RLD/RS status from label DB service
    from dashboard.services.fdalabel_db import FDALabelDBService

    rld_map = {}  # generic_name -> set_id
    rs_map = {}   # generic_name -> set_id

    if generic_names_to_check and FDALabelDBService.is_available():
        conn_lbl = FDALabelDBService.get_connection()
        if conn_lbl:
            try:
                cursor = conn_lbl.cursor()
                if FDALabelDBService._db_type == "oracle":
                    # Oracle: sample approach (kept close to your original)
                    for gn in generic_names_to_check[:50]:
                        sql = """
                            SELECT s.SET_ID
                            FROM druglabel.DGV_SUM_SPL s
                            JOIN druglabel.sum_spl_rld rld ON s.SPL_ID = rld.SPL_ID
                            WHERE UPPER(PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:gn)
                              AND ROWNUM = 1
                        """
                        cursor.execute(sql, {"gn": f"%{gn}%"})
                        r_row = cursor.fetchone()
                        if r_row:
                            rld_map[gn] = r_row[0]
                else:
                    # Postgres label DB: use %s placeholders; labeling.sum_spl
                    schema = "labeling."
                    for gn in generic_names_to_check:
                        sql = f"""
                            SELECT set_id, is_rld, is_rs
                            FROM {schema}sum_spl
                            WHERE generic_names ILIKE %s
                              AND (is_rld = 1 OR is_rs = 1)
                            ORDER BY is_rld DESC, is_rs DESC, revised_date DESC
                            LIMIT 1
                        """
                        cursor.execute(sql, (f"%{gn}%",))
                        r_row = cursor.fetchone()
                        if r_row:
                            if isinstance(r_row, dict):
                                sid = r_row.get("set_id")
                                is_rld = r_row.get("is_rld")
                                is_rs = r_row.get("is_rs")
                            else:
                                sid, is_rld, is_rs = r_row[0], r_row[1], r_row[2]

                            if sid:
                                if is_rld:
                                    rld_map[gn] = sid
                                elif is_rs:
                                    rs_map[gn] = sid
            finally:
                conn_lbl.close()

    # Fetch toxicity class for found RLD/RS setids from THIS drug_toxicity table
    ref_tox_map = {}
    ref_set_ids = list(set(list(rld_map.values()) + list(rs_map.values())))
    if ref_set_ids:
        tox_query = text(f"""
            SELECT {qname("SETID")} AS {qname("SETID")},
                   {qname("Toxicity_Class")} AS {qname("Toxicity_Class")}
            FROM {fq_table("drug_toxicity")}
            WHERE {qname("SETID")} = ANY(:setids)
              AND {qname("Tox_Type")} = :tox
              AND {qname("is_historical")} = 0
        """)
        t_rows = sess.execute(tox_query, {"setids": ref_set_ids, "tox": tox_type}).fetchall()
        for tr in t_rows:
            m = dict(tr._mapping)
            ref_tox_map[m["SETID"]] = m["Toxicity_Class"]

    discrepancies = []
    for raw in discrepancies_raw:
        generic_name = raw["generic_name"]
        items = raw["items"]
        unique_classes = raw["unique_classes"]

        scores = [tox_map.get(c, 0) for c in unique_classes]
        gap = (max(scores) - min(scores)) if scores else 0
        sorted_classes = sorted(list(unique_classes), key=lambda x: tox_map.get(x, 0))

        found_rld_sid = rld_map.get(generic_name)
        found_rs_sid = rs_map.get(generic_name)

        ref_sid = found_rld_sid or found_rs_sid
        rld_info = {
            "status": "Unknown",
            "setid": ref_sid,
            "is_rld": bool(found_rld_sid),
            "is_rs": bool(found_rs_sid),
        }
        if ref_sid:
            rld_info["status"] = ref_tox_map.get(ref_sid, "Not evaluated")

        discrepancies.append({
            "generic_name": generic_name,
            "tox_range": f"{sorted_classes[0]} to {sorted_classes[-1]}" if sorted_classes else "Unknown",
            "severity_gap": gap,
            "manufacturer_count": len(items),
            "classes_found": sorted_classes,
            # Frontend expects these keys inside each detail:
            # Trade_Name, Author_Organization, Toxicity_Class, SETID
            "details": items,
            "rld_info": rld_info,
        })

    discrepancies.sort(key=lambda x: (-x["severity_gap"], x["generic_name"]))
    return jsonify(discrepancies)


@drugtox_bp.route("/latest_rld")
def get_latest_rld():
    generic_name = request.args.get("generic_name")
    if not generic_name:
        return jsonify({"error": "Missing generic_name"}), 400

    from dashboard.services.fdalabel_db import FDALabelDBService
    if not FDALabelDBService.is_available():
        return jsonify({"error": "Label database not available"}), 503

    conn = None
    try:
        conn = FDALabelDBService.get_connection()
        cursor = conn.cursor()

        # 1) latest RLD
        if FDALabelDBService._db_type == "oracle":
            sql = """
                SELECT s.SET_ID, s.PRODUCT_NAMES
                FROM druglabel.DGV_SUM_SPL s
                JOIN druglabel.sum_spl_rld rld ON s.SPL_ID = rld.SPL_ID
                WHERE UPPER(s.PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:gn)
                ORDER BY s.EFF_TIME DESC
            """
            cursor.execute(sql, {"gn": f"%{generic_name}%"})
        else:
            schema = "labeling."
            sql = f"""
                SELECT set_id, product_names
                FROM {schema}sum_spl
                WHERE generic_names ILIKE %s AND is_rld = 1
                ORDER BY revised_date DESC
                LIMIT 1
            """
            cursor.execute(sql, (f"%{generic_name}%",))

        row = cursor.fetchone()
        if row:
            sid = row[0] if not isinstance(row, dict) else row.get("set_id")
            return jsonify({"set_id": sid, "is_rld": True})

        # 2) fallback: latest labeling
        if FDALabelDBService._db_type == "oracle":
            sql = """
                SELECT SET_ID
                FROM druglabel.DGV_SUM_SPL
                WHERE UPPER(PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:gn)
                ORDER BY EFF_TIME DESC
            """
            cursor.execute(sql, {"gn": f"%{generic_name}%"})
        else:
            schema = "labeling."
            sql = f"""
                SELECT set_id
                FROM {schema}sum_spl
                WHERE generic_names ILIKE %s
                ORDER BY revised_date DESC
                LIMIT 1
            """
            cursor.execute(sql, (f"%{generic_name}%",))

        row = cursor.fetchone()
        if row:
            sid = row[0] if not isinstance(row, dict) else row.get("set_id")
            return jsonify({"set_id": sid, "is_rld": False})

        return jsonify({"error": "No labeling found"}), 404

    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        if conn:
            conn.close()


@drugtox_bp.route("/autocomplete")
def autocomplete():
    q = request.args.get("q", "")
    limit = int(request.args.get("limit", 10))
    if not q:
        return jsonify([])

    sess = get_db_session()
    query = text(f"""
        SELECT DISTINCT {qname("Trade_Name")} AS {qname("Trade_Name")}
        FROM {fq_table("drug_toxicity")}
        WHERE {qname("Trade_Name")} ILIKE :q
          AND {qname("is_historical")} = 0
        LIMIT :limit
    """)
    result = sess.execute(query, {"q": f"%{q}%", "limit": limit})
    # first column is Trade_Name
    suggestions = [row[0] for row in result]
    return jsonify(suggestions)


@drugtox_bp.route("/drugs/<setid>/history")
def get_drug_history(setid):
    tox_type = request.args.get("tox_type")
    sess = get_db_session()

    # Pull reference to lock company and generic name
    res = sess.execute(text(f"""
        SELECT {qname("Generic_Proper_Names")} AS {qname("Generic_Proper_Names")},
               {qname("Tox_Type")} AS {qname("Tox_Type")},
               {qname("Author_Organization")} AS {qname("Author_Organization")}
        FROM {fq_table("drug_toxicity")}
        WHERE {qname("SETID")} = :setid
        LIMIT 1
    """), {"setid": setid})
    row = res.fetchone()
    if not row:
        return jsonify([])

    m = dict(row._mapping)
    generic_name = m["Generic_Proper_Names"]
    current_tox_type = tox_type or m["Tox_Type"]
    company = m["Author_Organization"]

    history_res = sess.execute(
        text(f"""
            SELECT
                {qname("SETID")} AS {qname("SETID")},
                {qname("Toxicity_Class")} AS {qname("Toxicity_Class")},
                {qname("SPL_Effective_Time")} AS {qname("SPL_Effective_Time")},
                {qname("is_historical")} AS {qname("is_historical")},
                {qname("Changed")} AS {qname("Changed")},
                {qname("Update_Notes")} AS {qname("Update_Notes")},
                {qname("Trade_Name")} AS {qname("Trade_Name")},
                {qname("Author_Organization")} AS {qname("Author_Organization")}
            FROM {fq_table("drug_toxicity")}
            WHERE {qname("Generic_Proper_Names")} = :name
              AND {qname("Tox_Type")} = :tox
              AND {qname("Author_Organization")} = :company
            ORDER BY {qname("SPL_Effective_Time")} DESC
        """),
        {"name": generic_name, "tox": current_tox_type, "company": company},
    )
    return jsonify(rowdicts(history_res))


@drugtox_bp.route("/drugs/<setid>")
def get_drug_detail(setid):
    tox_type = request.args.get("tox_type")
    sess = get_db_session()

    # Try to select canonical + any detail fields that exist.
    # If your table doesn't have the extra fields, remove DETAIL_EXTRA_COLS.
    cols = DRUG_COLS + DETAIL_EXTRA_COLS

    if tox_type:
        result = sess.execute(
            text(f"""
                SELECT {select_cols(cols)}
                FROM {fq_table("drug_toxicity")}
                WHERE {qname("SETID")} = :setid
                  AND {qname("Tox_Type")} = :tox_type
                LIMIT 1
            """),
            {"setid": setid, "tox_type": tox_type},
        )
    else:
        result = sess.execute(
            text(f"""
                SELECT {select_cols(cols)}
                FROM {fq_table("drug_toxicity")}
                WHERE {qname("SETID")} = :setid
                LIMIT 1
            """),
            {"setid": setid},
        )

    row = result.fetchone()
    if row:
        return jsonify(dict(row._mapping))
    return jsonify({"error": "Drug not found"}), 404


@drugtox_bp.route("/drugs/<setid>/market")
def get_drug_market(setid):
    tox_type = request.args.get("tox_type")
    sess = get_db_session()

    res = sess.execute(text(f"""
        SELECT {qname("Generic_Proper_Names")} AS {qname("Generic_Proper_Names")},
               {qname("Tox_Type")} AS {qname("Tox_Type")}
        FROM {fq_table("drug_toxicity")}
        WHERE {qname("SETID")} = :setid
        LIMIT 1
    """), {"setid": setid})
    row = res.fetchone()
    if not row:
        return jsonify([])

    m = dict(row._mapping)
    generic_name = m["Generic_Proper_Names"]
    current_tox_type = tox_type or m["Tox_Type"]

    market_res = sess.execute(
        text(f"""
            SELECT
                {qname("SETID")} AS {qname("SETID")},
                {qname("Trade_Name")} AS {qname("Trade_Name")},
                {qname("Author_Organization")} AS {qname("Author_Organization")},
                {qname("Toxicity_Class")} AS {qname("Toxicity_Class")},
                {qname("SPL_Effective_Time")} AS {qname("SPL_Effective_Time")}
            FROM {fq_table("drug_toxicity")}
            WHERE {qname("Generic_Proper_Names")} = :name
              AND {qname("Tox_Type")} = :tox
              AND {qname("is_historical")} = 0
              AND {qname("SETID")} != :setid
        """),
        {"name": generic_name, "tox": current_tox_type, "setid": setid},
    )
    return jsonify(rowdicts(market_res))


@drugtox_bp.route("/companies/<path:company_name>/stats")
def get_company_stats(company_name):
    tox_type = request.args.get("tox_type", "DILI")
    sess = get_db_session()

    dist_query = text(f"""
        SELECT {qname("Toxicity_Class")} AS {qname("Toxicity_Class")},
               COUNT(*) AS count
        FROM {fq_table("drug_toxicity")}
        WHERE {qname("Author_Organization")} = :company
          AND {qname("Tox_Type")} = :tox
          AND {qname("is_historical")} = 0
        GROUP BY {qname("Toxicity_Class")}
    """)
    dist = sess.execute(dist_query, {"company": company_name, "tox": tox_type}).fetchall()

    count_query = text(f"""
        SELECT COUNT(*) AS count
        FROM {fq_table("drug_toxicity")}
        WHERE {qname("Author_Organization")} = :company
          AND {qname("Tox_Type")} = :tox
          AND {qname("is_historical")} = 0
    """)
    total_drugs = sess.execute(count_query, {"company": company_name, "tox": tox_type}).scalar()

    return jsonify({
        "distribution": rowdicts(dist),
        "total_drugs": int(total_drugs or 0),
    })


@drugtox_bp.route("/companies/<path:company_name>/portfolio")
def get_company_portfolio(company_name):
    tox_type = request.args.get("tox_type", "DILI")
    sess = get_db_session()

    query = text(f"""
        SELECT {select_cols(DRUG_COLS)}
        FROM {fq_table("drug_toxicity")}
        WHERE {qname("Author_Organization")} = :company
          AND {qname("Tox_Type")} = :tox
          AND {qname("is_historical")} = 0
        ORDER BY {qname("Trade_Name")} ASC
    """)
    rows = sess.execute(query, {"company": company_name, "tox": tox_type}).fetchall()
    return jsonify(rowdicts(rows))

@drugtox_bp.route("/export")
def export_data():
    TOX_ORDER = {
        "Most": 5,
        "Less": 4,
        "Precaution": 3,
        "No": 2,
        "Unknown": 1,
    }

    tox_type = request.args.get("tox_type", "DILI")
    sess = get_db_session()

    query = text(f"""
        SELECT
            dt.{qname("SETID")} AS {qname("SETID")},
            dt.{qname("Generic_Proper_Names")} AS {qname("Generic_Proper_Names")},
            dt.{qname("Trade_Name")} AS {qname("Trade_Name")},
            dt.{qname("Author_Organization")} AS {qname("Author_Organization")},
            dt.{qname("Toxicity_Class")} AS {qname("Toxicity_Class")},
            s.{qname("appr_num")} AS {qname("Application_Number")},
            s.{qname("routes")} AS {qname("Route")},
            s.{qname("dosage_forms")} AS {qname("Dosage_Form")},
            s.{qname("active_ingredients")} AS {qname("Active_Ingredient")}
        FROM {fq_table("drug_toxicity")} dt
        LEFT JOIN {fq_table("sum_spl", schema="labeling")} s
          ON s.{qname("set_id")} = dt.{qname("SETID")}
        WHERE dt.{qname("Tox_Type")} = :tox
          AND dt.{qname("is_historical")} = 0
    """)

    rows = sess.execute(query, {"tox": tox_type}).fetchall()

    grouped = {}

    for row in rows:
        m = dict(row._mapping)

        application_number = (m.get("Application_Number") or "").strip()
        active_ingredient = (m.get("Active_Ingredient") or "").strip()
        dosage_form = (m.get("Dosage_Form") or "").strip()
        generic_name = (m.get("Generic_Proper_Names") or "").strip()

        if application_number:
            group_key = f"APP::{application_number}"
            display_group = application_number
            group_basis = "Application Number"
        elif active_ingredient or dosage_form:
            group_key = f"ING_DF::{active_ingredient.lower()}::{dosage_form.lower()}"
            display_group = f"{active_ingredient} | {dosage_form}".strip(" |")
            group_basis = "Active Ingredient + Dosage Form"
        elif generic_name:
            group_key = f"GENERIC::{generic_name.lower()}"
            display_group = generic_name
            group_basis = "Generic Name"
        else:
            group_key = "UNKNOWN"
            display_group = "Unknown"
            group_basis = "Unknown"

        if group_key not in grouped:
            grouped[group_key] = {
                "display_group": display_group,
                "group_basis": group_basis,
                "total_count": 0,
                "class_counts": defaultdict(int),
                "setids": set(),
                "generic_names": set(),
                "trade_names": set(),
                "author_organizations": set(),
                "routes": set(),
                "dosage_forms": set(),
                "active_ingredients": set(),
                "majority_vote": None,
                "severity_vote": None,
            }

        g = grouped[group_key]

        toxicity_class = m.get("Toxicity_Class") or "Unknown"

        g["total_count"] += 1
        g["class_counts"][toxicity_class] += 1

        if m.get("SETID"):
            g["setids"].add(m["SETID"])
        if m.get("Generic_Proper_Names"):
            g["generic_names"].add(m["Generic_Proper_Names"])
        if m.get("Trade_Name"):
            g["trade_names"].add(m["Trade_Name"])
        if m.get("Author_Organization"):
            g["author_organizations"].add(m["Author_Organization"])
        if m.get("Route"):
            g["routes"].add(str(m["Route"]).strip())
        if m.get("Dosage_Form"):
            g["dosage_forms"].add(str(m["Dosage_Form"]).strip())
        if m.get("Active_Ingredient"):
            g["active_ingredients"].add(str(m["Active_Ingredient"]).strip())

    for group_key, data in grouped.items():
        class_counts = data["class_counts"]

        if class_counts:
            data["majority_vote"] = max(class_counts, key=class_counts.get)
            data["severity_vote"] = max(class_counts, key=lambda x: TOX_ORDER.get(x, 0))

    wb = Workbook()
    ws = wb.active
    ws.title = f"{tox_type} Toxicity Data"[:31]

    headers = [
        "Application / Fallback Group",
        "Group Basis",
        "Total Count",
        "Generic Name",
        "Trade Name",
        "Author Organization",
        "SETID",
        "Route",
        "Dosage Form",
        "Active Ingredient",
        "Most",
        "Less",
        "No",
        "Precaution",
        "Unknown",
        "Majority Vote",
        "Severity Vote",
    ]
    ws.append(headers)

    for group_key, data in sorted(grouped.items(), key=lambda x: x[1]["display_group"]):
        ws.append([
            data["display_group"],
            data["group_basis"],
            data["total_count"],
            ", ".join(sorted(data["generic_names"])),
            ", ".join(sorted(data["trade_names"])),
            ", ".join(sorted(data["author_organizations"])),
            ", ".join(sorted(data["setids"])),
            ", ".join(sorted(data["routes"])),
            ", ".join(sorted(data["dosage_forms"])),
            ", ".join(sorted(data["active_ingredients"])),
            data["class_counts"]["Most"],
            data["class_counts"]["Less"],
            data["class_counts"]["No"],
            data["class_counts"]["Precaution"],
            data["class_counts"]["Unknown"],
            data["majority_vote"],
            data["severity_vote"],
        ])

    temp_file = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
    wb.save(temp_file.name)
    temp_file.close()

    return send_file(
        temp_file.name,
        as_attachment=True,
        download_name=f"{tox_type}_toxicity_data_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx",
    )
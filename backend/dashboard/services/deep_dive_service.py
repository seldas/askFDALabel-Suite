import re
import math
import random
import logging
from collections import Counter
from database import db, MeddraLLT, MeddraPT, MeddraMDHIER
from dashboard.services.xml_handler import extract_sections_by_loinc
from dashboard.services.fda_client import get_label_xml, get_label_counts, find_labels
from dashboard.services.fdalabel_db import FDALabelDBService
from dashboard.services.meddra_matcher import scan_label_for_meddra

logger = logging.getLogger(__name__)

class DeepDiveService:

    @classmethod
    def _get_meddra_mappings(cls, terms):
        """Fetches PT and SOC mappings for a list of terms to enable aggregation."""
        if not terms: return {}
        
        # 1. Map to PT
        # First check if term is a PT
        pt_map = {} # term -> {pt_name, soc_name}
        
        try:
            # Query LLTs to get their PTs
            llts = db.session.query(MeddraLLT.llt_name, MeddraPT.pt_name, MeddraMDHIER.soc_name)\
                .join(MeddraPT, MeddraLLT.pt_code == MeddraPT.pt_code)\
                .join(MeddraMDHIER, MeddraPT.pt_code == MeddraMDHIER.pt_code)\
                .filter(MeddraLLT.llt_name.in_(terms)).all()
            
            for llt_name, pt_name, soc_name in llts:
                pt_map[llt_name.upper()] = {'pt': pt_name.upper(), 'soc': soc_name}
                
            # Query PTs directly (in case some were matched as PTs)
            pts = db.session.query(MeddraPT.pt_name, MeddraMDHIER.soc_name)\
                .join(MeddraMDHIER, MeddraPT.pt_code == MeddraMDHIER.pt_code)\
                .filter(MeddraPT.pt_name.in_(terms)).all()
            
            for pt_name, soc_name in pts:
                pt_map[pt_name.upper()] = {'pt': pt_name.upper(), 'soc': soc_name}
        except Exception as e:
            logger.error(f"Error fetching MedDRA mappings: {e}")
            
        return pt_map

    @classmethod
    def get_comparison_analysis(cls, target_set_id, source='local', generic_names=None, epcs=None):
        """
        Builds a Compliance Matrix with Term Aggregation and Severity Tiering.
        """
        target_xml = get_label_xml(target_set_id)
        if not target_xml: return {"error": "Target XML not found"}
        target_sections = extract_sections_by_loinc(target_xml)
        
        peer_set_ids = cls._get_peer_sample(source, generic_names, epcs)
        
        # Regulatory Hierarchy
        HIERARCHY = {
            '34066-1': {'level': 3, 'code': 'B', 'label': 'Boxed Warning'},
            '34071-1': {'level': 2, 'code': 'W', 'label': 'Warning'},
            '43685-7': {'level': 2, 'code': 'W', 'label': 'Warning'},
            '34084-4': {'level': 1, 'code': 'A', 'label': 'Adverse Reaction'}
        }

        # Step 1: Scan and Collect Raw Terms
        def scan_sections(sections_dict):
            raw_data = {} # loinc -> list of terms
            for loinc, data in sections_dict.items():
                if loinc in HIERARCHY:
                    text = data.get('content', '')
                    if text: raw_data[loinc] = scan_label_for_meddra(text)
            return raw_data

        target_raw = scan_sections(target_sections)
        
        peers_raw = []
        all_unique_terms = set()
        for pid in peer_set_ids:
            if pid == target_set_id: continue
            pxml = get_label_xml(pid)
            if pxml:
                p_raw = scan_sections(extract_sections_by_loinc(pxml))
                peers_raw.append({'id': pid, 'data': p_raw})
                for loinc_terms in p_raw.values(): all_unique_terms.update(loinc_terms)
        for loinc_terms in target_raw.values(): all_unique_terms.update(loinc_terms)

        # Step 2: Aggregate by PT
        mappings = cls._get_meddra_mappings(list(all_unique_terms))
        
        def normalize_to_pt_levels(raw_data_dict):
            pt_levels = {} # PT_NAME -> {level, code, soc}
            for loinc, terms in raw_data_dict.items():
                lvl_info = HIERARCHY[loinc]
                for t in terms:
                    m = mappings.get(t.upper())
                    if m:
                        pt = m['pt']
                        cur = pt_levels.get(pt, {'level': 0})
                        if lvl_info['level'] > cur['level']:
                            pt_levels[pt] = {**lvl_info, 'soc': m['soc']}
            return pt_levels

        target_pt_levels = normalize_to_pt_levels(target_raw)
        peers_pt_data = [{'id': p['id'], 'pts': normalize_to_pt_levels(p['data'])} for p in peers_raw]
        
        # Step 3: Calculate Statistics and Consensus
        all_pts = set(target_pt_levels.keys())
        for p in peers_pt_data: all_pts.update(p['pts'].keys())
        
        total_peers = len(peers_pt_data)
        term_stats = {}
        for pt in all_pts:
            peer_codes = [p['pts'].get(pt, {'code': 'N'})['code'] for p in peers_pt_data]
            consensus_code = Counter(peer_codes).most_common(1)[0][0]
            peer_count = sum(1 for c in peer_codes if c != 'N')
            
            target_status = target_pt_levels.get(pt, {'level': 0, 'code': 'N', 'soc': 'Unknown'})
            peer_max_level = 0
            for p in peers_pt_data:
                if pt in p['pts']: peer_max_level = max(peer_max_level, p['pts'][pt]['level'])
            
            peer_coverage = (peer_count / total_peers * 100) if total_peers > 0 else 0
            
            term_stats[pt] = {
                'term': pt,
                'soc': target_status.get('soc', 'Unknown'),
                'target_code': target_status['code'],
                'target_level': target_status['level'],
                'consensus_code': consensus_code,
                'peer_coverage': peer_coverage,
                'peer_count': peer_count,
                'peer_max_level': peer_max_level,
                'weight': peer_max_level * peer_coverage,
                'peers': peer_codes
            }

        # Step 4: Tiering and Anomaly Detection
        tiers = {'critical': [], 'moderate': [], 'minor': []}
        matrix_rows = []

        for pt, stats in term_stats.items():
            is_discrepancy = stats['target_code'] != stats['consensus_code']
            
            # Anomaly logic
            if stats['peer_coverage'] >= 50 and stats['target_level'] == 0:
                tier = 'critical' if stats['peer_max_level'] == 3 else 'moderate'
                stats['note'] = f"Missing Signal: Present in {int(stats['peer_coverage'])}% of peers."
                tiers[tier].append(stats)
            elif stats['peer_coverage'] >= 30 and stats['target_level'] < stats['peer_max_level']:
                stats['note'] = f"Downgraded: Peer consensus is higher level."
                tiers['moderate'].append(stats)
            elif is_discrepancy and stats['peer_coverage'] > 20:
                tiers['minor'].append(stats)

            # Matrix logic: Filter noise (only show terms with coverage > 10% or discrepancy)
            if stats['peer_coverage'] > 10 or is_discrepancy or stats['target_level'] >= 2:
                matrix_rows.append({
                    'term': pt,
                    'soc': stats['soc'],
                    'target': stats['target_code'],
                    'consensus': stats['consensus_code'],
                    'coverage': f"{int(stats['peer_coverage'])}%",
                    'peers': stats['peers'],
                    'is_discrepancy': is_discrepancy
                })

        # Sorting
        matrix_rows.sort(key=lambda x: (HIERARCHY.get(f"L{x['target']}", {'level':0})['level'], x['term']), reverse=True)
        for t in tiers: tiers[t].sort(key=lambda x: x['weight'], reverse=True)

        return {
            'matrix': matrix_rows,
            'tiers': tiers,
            'peer_count': total_peers,
            'target_set_id': target_set_id
        }

    @classmethod
    def _get_peer_sample(cls, source, generic_names, epcs):

        """Finds and samples up to 20 peer set_ids using field-specific searches."""
        all_peers = set()
        
        # 1. Collect potential query terms
        name_list = [n.strip() for n in (generic_names or "").split(',') if n.strip() and n.strip().lower() != 'n/a']
        epc_list = [e.strip() for e in (epcs or "").split(',') if e.strip() and e.strip().lower() != 'n/a']

        # 2. Fetch Set IDs based on source
        try:
            if source == 'openfda':
                import requests
                from dashboard.config import Config
                fda_url = "https://api.fda.gov/drug/label.json"
                
                # Fetch for Generic Names
                for n in name_list[:2]:
                    params = {'search': f'openfda.generic_name:"{n}"', 'limit': 50}
                    if Config.OPENFDA_API_KEY: params['api_key'] = Config.OPENFDA_API_KEY
                    resp = requests.get(fda_url, params=params, timeout=10)
                    if resp.status_code == 200:
                        for r in resp.json().get('results', []):
                            if r.get('set_id'): all_peers.add(r['set_id'])
                
                # Fetch for EPCs
                for e in epc_list[:2]:
                    params = {'search': f'openfda.pharm_class_epc:"{e}"', 'limit': 50}
                    if Config.OPENFDA_API_KEY: params['api_key'] = Config.OPENFDA_API_KEY
                    resp = requests.get(fda_url, params=params, timeout=10)
                    if resp.status_code == 200:
                        for r in resp.json().get('results', []):
                            if r.get('set_id'): all_peers.add(r['set_id'])
            else:
                # Local / Oracle
                for n in name_list[:2]:
                    ids = cls._query_local_ids(generic_name=n)
                    all_peers.update(ids)
                for e in epc_list[:2]:
                    ids = cls._query_local_ids(epc=e)
                    all_peers.update(ids)
        except Exception as e:
            logger.error(f"Error sampling peers: {e}")

        peer_list = list(all_peers)
        if len(peer_list) > 20:
            return random.sample(peer_list, 20)
        return peer_list

    @staticmethod
    def _query_local_ids(generic_name=None, epc=None):
        """Helper to get set_ids from local DB for specific fields."""
        if not FDALabelDBService.check_connectivity(): return []
        conn = FDALabelDBService.get_connection()
        if not conn: return []
        
        ids = []
        try:
            cursor = conn.cursor()
            # We reuse the logic from get_label_counts but return the IDs instead
            if FDALabelDBService._db_type == 'oracle':
                if generic_name:
                    sql = "SELECT SET_ID FROM druglabel.DGV_SUM_SPL WHERE UPPER(PRODUCT_NORMD_GENERIC_NAMES) LIKE UPPER(:q) FETCH NEXT 50 ROWS ONLY"
                    cursor.execute(sql, {"q": f"%{generic_name}%"})
                else:
                    sql = "SELECT SET_ID FROM druglabel.DGV_SUM_SPL WHERE UPPER(EPC) LIKE UPPER(:q) FETCH NEXT 50 ROWS ONLY"
                    cursor.execute(sql, {"q": f"%{epc}%"})
            else:
                schema = "labeling."
                if generic_name:
                    sql = f"SELECT set_id FROM {schema}sum_spl WHERE generic_names ILIKE %(q)s LIMIT 50"
                else:
                    sql = f"SELECT set_id FROM {schema}sum_spl WHERE epc ILIKE %(q)s LIMIT 50"
                cursor.execute(sql, {"q": f"%{generic_name if generic_name else epc}%"})
            
            rows = cursor.fetchall()
            for r in rows:
                if isinstance(r, dict): ids.append(r['set_id'])
                else: ids.append(r[0])
        except Exception as e:
            logger.error(f"Local ID query error: {e}")
        finally:
            conn.close()
        return ids

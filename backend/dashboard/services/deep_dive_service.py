import re
import math
import random
import logging
from collections import Counter
from database import db, MeddraLLT, MeddraPT, MeddraMDHIER
from dashboard.services.xml_handler import extract_sections_by_loinc
from dashboard.services.fda_client import get_label_xml, get_label_counts, find_labels, get_label_metadata
from dashboard.services.fdalabel_db import FDALabelDBService
from dashboard.services.meddra_matcher import scan_label_for_meddra

logger = logging.getLogger(__name__)

class DeepDiveService:

    @classmethod
    def _get_meddra_mappings(cls, terms):
        """Fetches PT and SOC mappings for a list of terms to enable aggregation."""
        if not terms: return {}
        pt_map = {}
        try:
            llts = db.session.query(MeddraLLT.llt_name, MeddraPT.pt_name, MeddraMDHIER.soc_name)\
                .join(MeddraPT, MeddraLLT.pt_code == MeddraPT.pt_code)\
                .join(MeddraMDHIER, MeddraPT.pt_code == MeddraMDHIER.pt_code)\
                .filter(MeddraLLT.llt_name.in_(terms)).all()
            for llt_name, pt_name, soc_name in llts:
                pt_map[llt_name.upper()] = {'pt': pt_name.upper(), 'soc': soc_name}
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
        """Builds a Compliance Matrix with Traceability and Peer References."""
        target_xml = get_label_xml(target_set_id)
        if not target_xml: return {"error": "Target XML not found"}
        target_sections = extract_sections_by_loinc(target_xml)
        peer_set_ids = cls._get_peer_sample(source, generic_names, epcs)
        
        HIERARCHY = {
            '34066-1': {'level': 3, 'code': 'B', 'label': 'Boxed Warning'},
            '34071-1': {'level': 2, 'code': 'W', 'label': 'Warning'},
            '43685-7': {'level': 2, 'code': 'W', 'label': 'Warning'},
            '34084-4': {'level': 1, 'code': 'A', 'label': 'Adverse Reaction'}
        }

        def scan_sections(sections_dict):
            raw_data = {}
            for loinc, data in sections_dict.items():
                if loinc in HIERARCHY:
                    text = data.get('content', '')
                    if text: raw_data[loinc] = scan_label_for_meddra(text)
            return raw_data

        target_raw = scan_sections(target_sections)
        peers_raw = []
        all_unique_terms = set()
        peers_meta = {}
        
        for pid in peer_set_ids:
            if pid == target_set_id: continue
            pm = get_label_metadata(pid)
            if pm:
                peers_meta[pid] = {
                    'brand': pm.get('brand_name', 'Unknown'),
                    'manufacturer': pm.get('manufacturer_name', 'Unknown')
                }
            pxml = get_label_xml(pid)
            if pxml:
                p_raw = scan_sections(extract_sections_by_loinc(pxml))
                peers_raw.append({'id': pid, 'data': p_raw})
                for loinc_terms in p_raw.values(): all_unique_terms.update(loinc_terms)
        
        for loinc_terms in target_raw.values(): all_unique_terms.update(loinc_terms)
        mappings = cls._get_meddra_mappings(list(all_unique_terms))
        
        def normalize_to_pt_levels(raw_data_dict):
            pt_levels = {}
            for loinc, terms in raw_data_dict.items():
                lvl_info = HIERARCHY[loinc]
                for t in terms:
                    m = mappings.get(t.upper())
                    if m:
                        pt = m['pt']
                        cur = pt_levels.get(pt, {'level': 0, 'originals': set()})
                        new_originals = cur['originals']
                        new_originals.add(t)
                        if lvl_info['level'] > cur['level']:
                            pt_levels[pt] = {**lvl_info, 'soc': m['soc'], 'originals': new_originals}
                        else:
                            pt_levels[pt]['originals'] = new_originals
            for pt in pt_levels:
                pt_levels[pt]['originals'] = sorted(list(pt_levels[pt]['originals']))
            return pt_levels

        target_pt_levels = normalize_to_pt_levels(target_raw)
        peers_pt_data = [{'id': p['id'], 'pts': normalize_to_pt_levels(p['data'])} for p in peers_raw]
        
        all_pts = set(target_pt_levels.keys())
        for p in peers_pt_data: all_pts.update(p['pts'].keys())
        
        total_peers = len(peers_pt_data)
        term_stats = {}
        for pt in all_pts:
            peer_codes = [p['pts'].get(pt, {'code': 'N'})['code'] for p in peers_pt_data]
            counts = Counter(peer_codes)
            dist = {
                'B': round((counts['B'] / total_peers * 100) if total_peers > 0 else 0),
                'W': round((counts['W'] / total_peers * 100) if total_peers > 0 else 0),
                'A': round((counts['A'] / total_peers * 100) if total_peers > 0 else 0),
                'N': round((counts['N'] / total_peers * 100) if total_peers > 0 else 0)
            }
            consensus_code = counts.most_common(1)[0][0]
            target_status = target_pt_levels.get(pt, {'level': 0, 'code': 'N', 'soc': 'Unknown', 'originals': []})
            
            LEVEL_MAP = {'B': 3, 'W': 2, 'A': 1, 'N': 0}
            target_level = LEVEL_MAP[target_status['code']]
            consensus_level = LEVEL_MAP[consensus_code]
            
            peer_count = sum(1 for c in peer_codes if c != 'N')
            peer_coverage = (peer_count / total_peers * 100) if total_peers > 0 else 0
            
            term_stats[pt] = {
                'term': pt,
                'originals': target_status.get('originals', []),
                'soc': target_status.get('soc', 'Unknown'),
                'target_code': target_status['code'],
                'target_level': target_level,
                'consensus_code': consensus_code,
                'consensus_level': consensus_level,
                'distribution': dist,
                'peer_coverage': peer_coverage,
                'peer_count': peer_count,
                'weight': consensus_level * peer_coverage,
                'peers': peer_codes
            }

        tiers = {'critical': [], 'moderate': [], 'minor': []}
        matrix_rows = []
        for pt, stats in term_stats.items():
            is_downgraded = stats['target_level'] < stats['consensus_level'] and stats['consensus_level'] > 0
            is_missing = stats['target_level'] == 0 and stats['consensus_level'] > 0 and stats['peer_coverage'] >= 50
            if is_missing:
                tier = 'critical' if stats['consensus_level'] >= 2 else 'moderate'
                stats['note'] = f"Missing Signal: Class consensus is {stats['consensus_code']}."
                tiers[tier].append(stats)
            elif is_downgraded:
                stats['note'] = f"Downgraded: Peer consensus ({stats['consensus_code']}) is higher level."
                tiers['moderate'].append(stats)
            
            is_discrepancy = stats['target_code'] != stats['consensus_code']
            if is_discrepancy and not is_missing and not is_downgraded and stats['peer_coverage'] > 20:
                tiers['minor'].append(stats)

            if stats['peer_coverage'] > 10 or is_discrepancy or stats['target_level'] >= 2:
                matrix_rows.append({
                    'term': pt,
                    'originals': stats['originals'],
                    'soc': stats['soc'],
                    'target': stats['target_code'],
                    'consensus': stats['consensus_code'],
                    'coverage': f"{int(stats['peer_coverage'])}%",
                    'dist': stats['distribution'],
                    'peers': stats['peers'],
                    'is_discrepancy': is_discrepancy
                })

        matrix_rows.sort(key=lambda x: (HIERARCHY.get(f"34066-1" if x['target'] == 'B' else "34071-1" if x['target'] == 'W' else "34084-4", {'level':0})['level'], x['term']), reverse=True)
        for t in tiers: tiers[t].sort(key=lambda x: x['weight'], reverse=True)

        return {
            'matrix': matrix_rows,
            'tiers': tiers,
            'peer_count': total_peers,
            'peers_metadata': peers_meta,
            'target_set_id': target_set_id
        }

    @classmethod
    def _get_peer_sample(cls, source, generic_names, epcs):
        all_peers = set()
        name_list = [n.strip() for n in (generic_names or "").split(',') if n.strip() and n.strip().lower() != 'n/a']
        epc_list = [e.strip() for e in (epcs or "").split(',') if e.strip() and e.strip().lower() != 'n/a']
        try:
            if source == 'openfda':
                import requests
                from dashboard.config import Config
                fda_url = "https://api.fda.gov/drug/label.json"
                for n in name_list[:2]:
                    params = {'search': f'openfda.generic_name:"{n}"', 'limit': 50}
                    if Config.OPENFDA_API_KEY: params['api_key'] = Config.OPENFDA_API_KEY
                    resp = requests.get(fda_url, params=params, timeout=10)
                    if resp.status_code == 200:
                        for r in resp.json().get('results', []):
                            if r.get('set_id'): all_peers.add(r['set_id'])
                for e in epc_list[:2]:
                    params = {'search': f'openfda.pharm_class_epc:"{e}"', 'limit': 50}
                    if Config.OPENFDA_API_KEY: params['api_key'] = Config.OPENFDA_API_KEY
                    resp = requests.get(fda_url, params=params, timeout=10)
                    if resp.status_code == 200:
                        for r in resp.json().get('results', []):
                            if r.get('set_id'): all_peers.add(r['set_id'])
            else:
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
        if not FDALabelDBService.check_connectivity(): return []
        conn = FDALabelDBService.get_connection()
        if not conn: return []
        ids = []
        try:
            cursor = conn.cursor()
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

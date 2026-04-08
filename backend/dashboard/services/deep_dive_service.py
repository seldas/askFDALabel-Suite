import re
import math
import random
import logging
import requests
from collections import Counter
from database import db, MeddraLLT, MeddraPT, MeddraMDHIER, OrangeBook
from dashboard.services.xml_handler import extract_sections_by_loinc
from dashboard.services.fda_client import get_label_xml, get_label_counts, find_labels, get_label_metadata
from dashboard.services.fdalabel_db import FDALabelDBService
from dashboard.services.meddra_matcher import scan_label_for_meddra
from dashboard.config import Config

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

    @staticmethod
    def _determine_label_format(sections_dict):
        """
        Determines the label format based on presence of specific LOINC sections.
        PLR: has 'Warnings and Precautions' (43685-7)
        non-PLR: has 'Adverse Reactions' (34084-4) but NO 'Warnings and Precautions'
        OTC: Has neither
        """
        if '43685-7' in sections_dict:
            return 'PLR'
        if '34084-4' in sections_dict:
            return 'non-PLR'
        return 'OTC'

    @classmethod
    def get_comparison_analysis(cls, target_set_id, source='openfda', generic_names=None, epcs=None):
        """Builds a Compliance Matrix with Traceability and Peer References."""
        target_xml = get_label_xml(target_set_id)
        if not target_xml: return {"error": "Target XML not found"}
        target_sections = extract_sections_by_loinc(target_xml)
        target_format = cls._determine_label_format(target_sections)
        
        peer_set_ids = cls._get_peer_sample(source, generic_names, epcs, target_format)
        
        HIERARCHY = {
            '34066-1': {'level': 3, 'code': 'B', 'label': 'Boxed Warning'},
            '34071-1': {'level': 2, 'code': 'W', 'label': 'Warning'},
            '43685-7': {'level': 2, 'code': 'W', 'label': 'Warning'},
            '34084-4': {'level': 1, 'code': 'A', 'label': 'Adverse Reaction'}
        }

        def scan_sections(sections_dict, sid):
            raw_data = {}
            stats = {'hits': 0, 'misses': 0}
            for loinc, data in sections_dict.items():
                if loinc in HIERARCHY:
                    text = data.get('content', '')
                    if text: 
                        terms, is_hit = scan_label_for_meddra(text, set_id=sid, section_loinc=loinc, return_stats=True)
                        raw_data[loinc] = terms
                        if is_hit: stats['hits'] += 1
                        else: stats['misses'] += 1
            return raw_data, stats

        analysis_stats = {'cache_hits': 0, 'cache_misses': 0}
        target_raw, t_stats = scan_sections(target_sections, target_set_id)
        analysis_stats['cache_hits'] += t_stats['hits']
        analysis_stats['cache_misses'] += t_stats['misses']

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
                p_sections = extract_sections_by_loinc(pxml)
                p_raw, p_stats = scan_sections(p_sections, pid)
                analysis_stats['cache_hits'] += p_stats['hits']
                analysis_stats['cache_misses'] += p_stats['misses']
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
            consensus_code = counts.most_common(1)[0][0] if counts else 'N'
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

        LEVEL_MAP = {'B': 3, 'W': 2, 'A': 1, 'N': 0}
        matrix_rows.sort(key=lambda x: (LEVEL_MAP.get(x['target'], 0), x['term']), reverse=True)
        for t in tiers: tiers[t].sort(key=lambda x: x['weight'], reverse=True)

        return {
            'matrix': matrix_rows,
            'tiers': tiers,
            'peer_count': total_peers,
            'peers_metadata': peers_meta,
            'target_set_id': target_set_id,
            '_stats': analysis_stats
        }

    @classmethod
    def _get_peer_sample(cls, source, generic_names, epcs, target_format):
        """
        Samples up to 20 peers, prioritizing RLDs and matching label format.
        """
        all_peer_data = [] # List of {set_id, is_rld, format}
        name_list = [n.strip() for n in (generic_names or "").split(',') if n.strip() and n.strip().lower() != 'n/a']
        epc_list = [e.strip() for e in (epcs or "").split(',') if e.strip() and e.strip().lower() != 'n/a']
        
        try:
            # 1. Gather pool of candidates
            raw_candidates = []
            if source == 'openfda':
                fda_url = "https://api.fda.gov/drug/label.json"
                for n in name_list[:2]:
                    params = {'search': f'openfda.generic_name:"{n}"', 'limit': 100}
                    if Config.OPENFDA_API_KEY: params['api_key'] = Config.OPENFDA_API_KEY
                    resp = requests.get(fda_url, params=params, timeout=10)
                    if resp.status_code == 200:
                        raw_candidates.extend(resp.json().get('results', []))
                for e in epc_list[:2]:
                    params = {'search': f'openfda.pharm_class_epc:"{e}"', 'limit': 100}
                    if Config.OPENFDA_API_KEY: params['api_key'] = Config.OPENFDA_API_KEY
                    resp = requests.get(fda_url, params=params, timeout=10)
                    if resp.status_code == 200:
                        raw_candidates.extend(resp.json().get('results', []))
            else:
                # Local/Oracle query
                for n in name_list[:2]:
                    raw_candidates.extend(cls._query_local_full_meta(generic_name=n))
                for e in epc_list[:2]:
                    raw_candidates.extend(cls._query_local_full_meta(epc=e))

            # 2. Enrich candidates with RLD status and Format
            unique_set_ids = set()
            for c in raw_candidates:
                sid = c.get('set_id')
                if not sid or sid in unique_set_ids: continue
                unique_set_ids.add(sid)

                # Determine Format
                # OpenFDA returns effective_time and sections in slightly different ways
                # We can try to use LOINC codes if available in 'effective_time' (wrong place)
                # Better: check section headers or common PLR section names
                # For simplicity, we use the _determine_label_format logic if sections are available
                fmt = 'Unknown'
                if 'effective_time' in c and isinstance(c.get('effective_time'), dict):
                    # This happens when sections are returned instead of just metadata
                    fmt = cls._determine_label_format(c)
                else:
                    # Fallback metadata check
                    if 'warnings_and_precautions' in c: fmt = 'PLR'
                    elif 'adverse_reactions' in c: fmt = 'non-PLR'
                    else: fmt = 'OTC'

                # Determine RLD status from local Orange Book
                is_rld = False
                app_no = c.get('application_number')
                if app_no:
                    # Application numbers in OpenFDA often have prefixes like NDA, ANDA
                    # Extract numeric part
                    match = re.search(r'\d+', app_no)
                    if match:
                        clean_app_no = match.group(0).zfill(6) # Orange book often pads to 6
                        rld_check = db.session.query(OrangeBook).filter(
                            OrangeBook.appl_no.like(f"%{clean_app_no}%"),
                            OrangeBook.rld == 'Yes'
                        ).first()
                        if rld_check: is_rld = True

                all_peer_data.append({
                    'id': sid,
                    'is_rld': is_rld,
                    'format': fmt,
                    'score': (2 if is_rld else 0) + (1 if fmt == target_format else 0)
                })

            # 3. Sort and Sample
            # Primary: score (RLD + Format Match), Secondary: random to avoid same generic pool every time
            random.shuffle(all_peer_data)
            all_peer_data.sort(key=lambda x: x['score'], reverse=True)
            
            return [p['id'] for p in all_peer_data[:20]]

        except Exception as e:
            logger.error(f"Error sampling peers: {e}")
            return []

    @staticmethod
    def _query_local_full_meta(generic_name=None, epc=None):
        """Mock-like or basic query for local metadata to match sampling logic."""
        # For brevity, reusing _query_local_ids but wrapping in dict format
        ids = DeepDiveService._query_local_ids(generic_name, epc)
        return [{'set_id': i} for i in ids]

    @staticmethod
    def _query_local_ids(generic_name=None, epc=None):
        if not FDALabelDBService.check_connectivity(): return []
        conn = FDALabelDBService.get_connection()
        if not conn: return []
        ids = []
        try:
            cursor = conn.cursor()
            schema = "labeling."
            if generic_name:
                sql = f"SELECT set_id FROM {schema}sum_spl WHERE generic_names ILIKE %(q)s LIMIT 100"
            else:
                sql = f"SELECT set_id FROM {schema}sum_spl WHERE epc ILIKE %(q)s LIMIT 100"
            cursor.execute(sql, {"q": f"%{generic_name if generic_name else epc}%"})
            rows = cursor.fetchall()
            for r in rows:
                if isinstance(r, dict):
                    sid = r.get('set_id')
                    if sid: ids.append(sid)
                elif r and len(r) > 0:
                    if r[0]: ids.append(r[0])
        except Exception as e:
            logger.error(f"Local ID query error: {e}")
        finally:
            conn.close()
        return ids

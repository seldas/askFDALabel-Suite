import logging
from flashtext import KeywordProcessor
from database import db, MeddraPT, MeddraLLT

logger = logging.getLogger(__name__)

# List of MedDRA terms that are too common in general English/Labeling context
# and lead to false positives (e.g., "ALL" as in "all patients").
MEDDRA_EXCLUSION_LIST = set([
    'ALL', 'HIGH', 'LOW', 'FALL', 'MAY', 'CAN', 'OFF', 'BIT', 'SET', 'BAD', 
    'LEAD', 'MASS', 'BORN', 'AGE', 'NORMAL', 'LONG', 'SKIN', 'BODY', 'STING',
    'GAS', 'GRIP', 'TALK', 'WALK', 'HEAL', 'FEEL', 'FILL', 'IRON', 'COKE'
])

class MeddraMatcher:
    _instance = None
    _processor = None

    @classmethod
    def get_instance(cls):
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def __init__(self):
        self.processor = KeywordProcessor(case_sensitive=False)
        self._loaded = False

    def load_dictionary(self):
        """Loads all PTs and LLTs from the database into the FlashText processor, with filtering."""
        if self._loaded:
            return

        try:
            logger.info("Loading MedDRA dictionary into memory...")
            
            # 1. Load PTs
            pts = db.session.query(MeddraPT.pt_name).all()
            for pt in pts:
                name = pt.pt_name.strip()
                if name.upper() not in MEDDRA_EXCLUSION_LIST and len(name) > 2:
                    self.processor.add_keyword(name)

            # 2. Load LLTs
            llts = db.session.query(MeddraLLT.llt_name).all()
            for llt in llts:
                name = llt.llt_name.strip()
                if name.upper() not in MEDDRA_EXCLUSION_LIST and len(name) > 2:
                    self.processor.add_keyword(name)

            self._loaded = True
            logger.info(f"Loaded {len(self.processor)} MedDRA terms (filtered).")
        except Exception as e:
            logger.error(f"Error loading MedDRA dictionary: {e}")

    def scan_text(self, text):
        """
        Scans the provided text and returns a list of found MedDRA terms.
        Returns a list of unique terms found.
        """
        if not self._loaded:
            self.load_dictionary()
        
        if not text:
            return []

        # Extract keywords
        # FlashText extracts the normalized name if provided, otherwise the keyword itself.
        found_terms = self.processor.extract_keywords(text)
        
        # Deduplicate
        return list(set(found_terms))

# Global helper
def scan_label_for_meddra(text):
    matcher = MeddraMatcher.get_instance()
    return matcher.scan_text(text)


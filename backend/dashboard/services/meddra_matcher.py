import logging
from flashtext import KeywordProcessor
from dashboard.models import MeddraPT, MeddraLLT
from dashboard.extensions import db

logger = logging.getLogger(__name__)

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
        """Loads all PTs and LLTs from the database into the FlashText processor."""
        if self._loaded:
            return

        try:
            logger.info("Loading MedDRA dictionary into memory...")
            
            # 1. Load PTs
            pts = db.session.query(MeddraPT.pt_name).all()
            for pt in pts:
                self.processor.add_keyword(pt.pt_name)

            # 2. Load LLTs
            # We map LLTs to their PT name so the output is normalized, 
            # OR we can keep them as is. 
            # User asked to match PT and LLT.
            # Let's add them as is for now to highlight the exact text found.
            llts = db.session.query(MeddraLLT.llt_name).all()
            for llt in llts:
                self.processor.add_keyword(llt.llt_name)

            self._loaded = True
            logger.info(f"Loaded {len(pts) + len(llts)} MedDRA terms.")
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


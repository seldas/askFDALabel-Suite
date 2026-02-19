from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from .extensions import db

# --- Identity Models ---

project_users = db.Table('project_users',
    db.Column('project_id', db.Integer, db.ForeignKey('project.id'), primary_key=True),
    db.Column('user_id', db.Integer, db.ForeignKey('user.id'), primary_key=True)
)

class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(100), nullable=False)
    description = db.Column(db.Text)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    share_code = db.Column(db.String(36), unique=True)
    display_order = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    owner = db.relationship('User', backref=db.backref('owned_projects', lazy=True), foreign_keys=[owner_id])
    members = db.relationship('User', secondary=project_users, lazy='subquery',
        backref=db.backref('shared_projects', lazy=True))
    
    favorites = db.relationship('Favorite', backref='project', lazy=True, cascade="all, delete-orphan")
    comparisons = db.relationship('FavoriteComparison', backref='project', lazy=True, cascade="all, delete-orphan")

class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(150), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    
    # AI Preferences
    ai_provider = db.Column(db.String(20), default='gemini')
    custom_gemini_key = db.Column(db.String(255), nullable=True)
    openai_api_key = db.Column(db.String(255), nullable=True)
    openai_base_url = db.Column(db.String(255), nullable=True)
    openai_model_name = db.Column(db.String(100), nullable=True)
    
    favorites = db.relationship('Favorite', backref='user', lazy=True)
    comparisons = db.relationship('FavoriteComparison', backref='user', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

# --- User Content Models ---

class Favorite(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=True)
    set_id = db.Column(db.String(100), nullable=False)
    brand_name = db.Column(db.String(500))
    generic_name = db.Column(db.String(500))
    manufacturer_name = db.Column(db.String(500))
    market_category = db.Column(db.String(200))
    application_number = db.Column(db.String(200))
    ndc = db.Column(db.String(500))
    effective_time = db.Column(db.String(100))
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class Annotation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    set_id = db.Column(db.String(100), nullable=False)
    section_number = db.Column(db.String(50), nullable=False)
    question = db.Column(db.Text, nullable=False)
    answer = db.Column(db.Text, nullable=False)
    keywords = db.Column(db.Text) # Stored as JSON string
    is_public = db.Column(db.Boolean, default=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class FavoriteComparison(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=True)
    set_ids = db.Column(db.Text, nullable=False) # JSON string of list of set_ids
    title = db.Column(db.String(255), nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class LabelAnnotation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=True)
    set_id = db.Column(db.String(100), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    section_id = db.Column(db.String(100), nullable=False)
    start_offset = db.Column(db.Integer, nullable=False)
    end_offset = db.Column(db.Integer, nullable=False)
    selected_text = db.Column(db.Text, nullable=False)
    annotation_type = db.Column(db.String(20), nullable=False)
    color = db.Column(db.String(20))
    comment = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    user = db.relationship('User', backref=db.backref('label_annotations', lazy=True))
    project = db.relationship('Project', backref=db.backref('label_annotations', lazy=True))

class ComparisonSummary(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    set_ids_hash = db.Column(db.String(64), unique=True, nullable=False)
    set_ids = db.Column(db.Text, nullable=False)
    summary_content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

# --- Pharmacology / Toxicity Models ---

class DrugToxicity(db.Model):
    __tablename__ = 'drug_toxicity'
    id = db.Column(db.Integer, primary_key=True)
    SETID = db.Column(db.String(100), index=True)
    Trade_Name = db.Column(db.String(255), index=True)
    Generic_Proper_Names = db.Column(db.String(500), index=True)
    Toxicity_Class = db.Column(db.String(50), index=True)
    Author_Organization = db.Column(db.String(255))
    Tox_Type = db.Column(db.String(50), index=True)
    SPL_Effective_Time = db.Column(db.String(50))
    Changed = db.Column(db.String(10))
    is_historical = db.Column(db.Integer, default=0)
    Update_Notes = db.Column(db.Text)
    AI_Summary = db.Column(db.Text)

class DiliAssessment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    set_id = db.Column(db.String(100), unique=True, nullable=False)
    report_content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class DictAssessment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    set_id = db.Column(db.String(100), unique=True, nullable=False)
    report_content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class DiriAssessment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    set_id = db.Column(db.String(100), unique=True, nullable=False)
    report_content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class ToxAgent(db.Model):
    __tablename__ = 'tox_agent'
    id = db.Column(db.Integer, primary_key=True)
    set_id = db.Column(db.String(100), nullable=False, index=True)
    is_plr = db.Column(db.Integer, default=1)
    brand_name = db.Column(db.String(500))
    generic_name = db.Column(db.String(500))
    manufacturer = db.Column(db.String(500))
    spl_effective_time = db.Column(db.String(50))
    dili_report = db.Column(db.Text)
    dict_report = db.Column(db.Text)
    diri_report = db.Column(db.Text)
    last_updated = db.Column(db.DateTime, default=datetime.utcnow)
    update_notes = db.Column(db.Text)
    status = db.Column(db.String(20), default='completed')
    current = db.Column(db.String(3), default='Yes') # 'Yes' or 'No'

# --- MedDRA Models ---

class MeddraSOC(db.Model):
    __tablename__ = 'meddra_soc'
    soc_code = db.Column(db.Integer, primary_key=True)
    soc_name = db.Column(db.String(255), nullable=False)
    soc_abbrev = db.Column(db.String(50))
    soc_whoart_code = db.Column(db.String(20))
    soc_harts_code = db.Column(db.Integer)
    soc_costart_code = db.Column(db.String(20))
    soc_icd9_code = db.Column(db.String(20))
    soc_icd9cm_code = db.Column(db.String(20))
    soc_icd10_code = db.Column(db.String(20))
    soc_currency = db.Column(db.String(1))

class MeddraHLGT(db.Model):
    __tablename__ = 'meddra_hlgt'
    hlgt_code = db.Column(db.Integer, primary_key=True)
    hlgt_name = db.Column(db.String(255), nullable=False)
    hlgt_whoart_code = db.Column(db.String(20))
    hlgt_harts_code = db.Column(db.Integer)
    hlgt_costart_code = db.Column(db.String(20))
    hlgt_icd9_code = db.Column(db.String(20))
    hlgt_icd9cm_code = db.Column(db.String(20))
    hlgt_icd10_code = db.Column(db.String(20))
    hlgt_currency = db.Column(db.String(1))

class MeddraHLT(db.Model):
    __tablename__ = 'meddra_hlt'
    hlt_code = db.Column(db.Integer, primary_key=True)
    hlt_name = db.Column(db.String(255), nullable=False)
    hlt_whoart_code = db.Column(db.String(20))
    hlt_harts_code = db.Column(db.Integer)
    hlt_costart_code = db.Column(db.String(20))
    hlt_icd9_code = db.Column(db.String(20))
    hlt_icd9cm_code = db.Column(db.String(20))
    hlt_icd10_code = db.Column(db.String(20))
    hlt_currency = db.Column(db.String(1))

class MeddraPT(db.Model):
    __tablename__ = 'meddra_pt'
    pt_code = db.Column(db.Integer, primary_key=True)
    pt_name = db.Column(db.String(255), nullable=False)
    null_field = db.Column(db.String(1))
    pt_soc_code = db.Column(db.Integer)
    pt_whoart_code = db.Column(db.String(20))
    pt_harts_code = db.Column(db.Integer)
    pt_costart_code = db.Column(db.String(20))
    pt_icd9_code = db.Column(db.String(20))
    pt_icd9cm_code = db.Column(db.String(20))
    pt_icd10_code = db.Column(db.String(20))
    pt_currency = db.Column(db.String(1))

class MeddraLLT(db.Model):
    __tablename__ = 'meddra_llt'
    llt_code = db.Column(db.Integer, primary_key=True)
    llt_name = db.Column(db.String(255), nullable=False)
    pt_code = db.Column(db.Integer, db.ForeignKey('meddra_pt.pt_code'))
    llt_whoart_code = db.Column(db.String(20))
    llt_harts_code = db.Column(db.Integer)
    llt_costart_code = db.Column(db.String(20))
    llt_icd9_code = db.Column(db.String(20))
    llt_icd9cm_code = db.Column(db.String(20))
    llt_icd10_code = db.Column(db.String(20))
    llt_currency = db.Column(db.String(1))
    
    pt = db.relationship('MeddraPT', backref='llts')

class MeddraMDHIER(db.Model):
    __tablename__ = 'meddra_mdhier'
    id = db.Column(db.Integer, primary_key=True)
    pt_code = db.Column(db.Integer, db.ForeignKey('meddra_pt.pt_code'), nullable=False)
    hlt_code = db.Column(db.Integer, db.ForeignKey('meddra_hlt.hlt_code'), nullable=False)
    hlgt_code = db.Column(db.Integer, db.ForeignKey('meddra_hlgt.hlgt_code'), nullable=False)
    soc_code = db.Column(db.Integer, db.ForeignKey('meddra_soc.soc_code'), nullable=False)
    pt_name = db.Column(db.String(255))
    hlt_name = db.Column(db.String(255))
    hlgt_name = db.Column(db.String(255))
    soc_name = db.Column(db.String(255))
    soc_abbrev = db.Column(db.String(50))
    null_field = db.Column(db.String(1))
    pt_soc_code = db.Column(db.Integer)
    primary_soc_fg = db.Column(db.String(1))

    __table_args__ = (
        db.Index('idx_mdhier_pt', 'pt_code'),
        db.Index('idx_mdhier_soc', 'soc_code'),
    )

class MeddraSMQList(db.Model):
    __tablename__ = 'meddra_smq_list'
    smq_code = db.Column(db.Integer, primary_key=True)
    smq_name = db.Column(db.String(255), nullable=False)
    smq_level = db.Column(db.Integer)
    smq_description = db.Column(db.Text)
    smq_source = db.Column(db.String(255))
    smq_note = db.Column(db.Text)
    meddra_version = db.Column(db.String(10))
    status = db.Column(db.String(1))
    smq_algorithm = db.Column(db.String(255))

class MeddraSMQContent(db.Model):
    __tablename__ = 'meddra_smq_content'
    id = db.Column(db.Integer, primary_key=True)
    smq_code = db.Column(db.Integer, db.ForeignKey('meddra_smq_list.smq_code'), nullable=False)
    term_code = db.Column(db.Integer, nullable=False)
    term_level = db.Column(db.Integer, nullable=False)
    term_scope = db.Column(db.Integer)
    term_category = db.Column(db.String(1))
    term_weight = db.Column(db.Integer)
    term_status = db.Column(db.String(1))
    term_addition_version = db.Column(db.String(10))
    term_last_modified_version = db.Column(db.String(10))

    __table_args__ = (
        db.Index('idx_smq_content_smq', 'smq_code'),
        db.Index('idx_smq_content_term', 'term_code'),
    )

# --- PGx Models ---

class PgxBiomarker(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    drug_name = db.Column(db.String(255), nullable=False)
    therapeutic_area = db.Column(db.String(255))
    biomarker_name = db.Column(db.String(255), nullable=False)
    labeling_sections = db.Column(db.Text)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class PgxSynonym(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    term = db.Column(db.String(255), unique=True, nullable=False, index=True)
    normalized_name = db.Column(db.String(255), nullable=False)

class PgxAssessment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    set_id = db.Column(db.String(100), unique=True, nullable=False)
    report_content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

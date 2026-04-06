from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from .extensions import db
from pgvector.sqlalchemy import Vector

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
    is_admin = db.Column(db.Boolean, default=False)
    ai_provider = db.Column(db.String(20), default='gemini')
    custom_gemini_key = db.Column(db.String(255), nullable=True)
    openai_api_key = db.Column(db.String(255), nullable=True)
    openai_base_url = db.Column(db.String(255), nullable=True)
    openai_model_name = db.Column(db.String(100), nullable=True)
    
    favorites = db.relationship('Favorite', backref='user', lazy=True)
    comparisons = db.relationship('FavoriteComparison', backref='user', lazy=True)

    def set_password(self, password):
        self.password_hash = generate_password_hash(password, method='pbkdf2:sha256')

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

# --- User Content Models ---

class Favorite(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=True)
    set_id = db.Column(db.String(100), nullable=False)
    brand_name = db.Column(db.Text)
    generic_name = db.Column(db.Text)
    manufacturer_name = db.Column(db.Text)
    market_category = db.Column(db.Text)
    application_number = db.Column(db.Text)
    ndc = db.Column(db.Text)
    effective_time = db.Column(db.String(100))
    
    # Missing columns for full analysis
    active_ingredients = db.Column(db.Text)
    labeling_type = db.Column(db.Text)
    dosage_forms = db.Column(db.Text)
    routes = db.Column(db.Text)
    epc = db.Column(db.Text)
    fdalabel_link = db.Column(db.Text)
    dailymed_spl_link = db.Column(db.Text)
    dailymed_pdf_link = db.Column(db.Text)
    product_type = db.Column(db.Text)
    label_format = db.Column(db.Text)
    source = db.Column(db.String(50))

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
    project = db.relationship('Project', backref=db.backref('label_annotations', lazy=True, cascade="all, delete-orphan"))

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
    Generic_Proper_Names = db.Column(db.Text, index=True)
    Toxicity_Class = db.Column(db.String(50), index=True)
    Author_Organization = db.Column(db.String(255))
    Tox_Type = db.Column(db.String(50), index=True)
    SPL_Effective_Time = db.Column(db.String(50))
    Changed = db.Column(db.String(10))
    is_historical = db.Column(db.Integer, default=0)
    Update_Notes = db.Column(db.Text)
    AI_Summary = db.Column(db.Text)

class DiliAssessment(db.Model):
    __tablename__ = "dili_assessment"
    id = db.Column(db.Integer, primary_key=True)  # autoincrement/identity handled by PG
    set_id = db.Column(db.String, nullable=False, index=True)  # or UUID type
    report_content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime(timezone=True), server_default=db.func.now(), nullable=False)

class DictAssessment(db.Model):
    __tablename__ = "dict_assessment"
    id = db.Column(db.Integer, primary_key=True)
    set_id = db.Column(db.String(100), unique=True, nullable=False)
    report_content = db.Column(db.Text, nullable=False)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class DiriAssessment(db.Model):
    __tablename__ = "diri_assessment"
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

class ProjectAeReport(db.Model):
    __tablename__ = 'project_ae_report'
    id = db.Column(db.Integer, primary_key=True)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id'), nullable=False)
    target_pt = db.Column(db.String(255), nullable=False)
    status = db.Column(db.String(20), default='pending') # pending, processing, completed, failed
    progress = db.Column(db.Integer, default=0) # 0 to 100
    total_labels = db.Column(db.Integer, default=0)
    processed_labels = db.Column(db.Integer, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    completed_at = db.Column(db.DateTime)

    project = db.relationship('Project', backref=db.backref('ae_reports', lazy=True, cascade="all, delete-orphan"))
    details = db.relationship('ProjectAeReportDetail', backref='report', cascade="all, delete-orphan")

class ProjectAeReportDetail(db.Model):
    __tablename__ = 'project_ae_report_detail'
    id = db.Column(db.Integer, primary_key=True)
    report_id = db.Column(db.Integer, db.ForeignKey('project_ae_report.id'), nullable=False)
    set_id = db.Column(db.String(100), nullable=False)
    brand_name = db.Column(db.String(255))
    generic_name = db.Column(db.String(255))
    is_labeled = db.Column(db.Boolean, default=False)
    found_sections = db.Column(db.Text) # JSON string: [{"section": "Warnings", "snippet": "..."}]
    faers_count = db.Column(db.Integer, default=0)
    faers_1yr_count = db.Column(db.Integer, default=0)
    faers_5yr_count = db.Column(db.Integer, default=0)
    faers_serious_count = db.Column(db.Integer, default=0)

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
    smq_name = db.Column(db.Text, nullable=False)
    smq_level = db.Column(db.Integer)
    smq_description = db.Column(db.Text)
    smq_source = db.Column(db.Text)
    smq_note = db.Column(db.Text)
    meddra_version = db.Column(db.String(10))
    status = db.Column(db.String(1))
    smq_algorithm = db.Column(db.Text)

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

# --- Embedding Models ---

class AeAiAssessment(db.Model):
    __tablename__ = 'ae_ai_assessment'
    id = db.Column(db.Integer, primary_key=True)
    set_id = db.Column(db.String(100), nullable=False, index=True)
    drug_name = db.Column(db.String(255), nullable=False)
    result_json = db.Column(db.Text, nullable=False) # Store as JSON string
    min_count = db.Column(db.Integer, default=10)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

class LabelEmbedding(db.Model):
    __tablename__ = 'label_embeddings'
    id = db.Column(db.Integer, primary_key=True)
    set_id = db.Column(db.String(100), nullable=False, index=True)
    spl_id = db.Column(db.String(100), nullable=True)
    section_title = db.Column(db.String(500))
    loinc_code = db.Column(db.String(50))
    chunk_index = db.Column(db.Integer)
    chunk_text = db.Column(db.Text, nullable=False)
    embedding = db.Column(Vector(768)) # Default for many models, can adjust
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class OrangeBook(db.Model):
    __tablename__ = 'orange_book'
    id = db.Column(db.Integer, primary_key=True)
    ingredient = db.Column(db.String(500))
    df_route = db.Column(db.String(500))
    trade_name = db.Column(db.String(500))
    applicant = db.Column(db.String(255))
    strength = db.Column(db.String(500))
    appl_type = db.Column(db.String(10)) # N or A
    appl_no = db.Column(db.String(20), index=True)
    product_no = db.Column(db.String(10))
    te_code = db.Column(db.String(50))
    approval_date = db.Column(db.String(50))
    rld = db.Column(db.String(10)) # Yes or No
    rs = db.Column(db.String(10))  # Yes or No
    type = db.Column(db.String(20)) # RX, OTC, DISCN
    applicant_full_name = db.Column(db.String(500))

class SystemTask(db.Model):
    __tablename__ = 'system_tasks'
    id = db.Column(db.Integer, primary_key=True)
    task_type = db.Column(db.String(50), nullable=False) # 'labeling', 'orangebook', etc.
    status = db.Column(db.String(20), default='pending') # pending, processing, completed, failed
    progress = db.Column(db.Integer, default=0) # 0 to 100
    message = db.Column(db.String(255))
    error_details = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = db.Column(db.DateTime)

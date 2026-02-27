set search_path to spl;

create table form (
  ncit_code varchar(7) constraint pk_form primary key,
  spl_term varchar(200) not null
);
comment on table form is 'dose form';
comment on column form.ncit_code is 'NCI Thesaurus code';

create table pkg_type (
  ncit_code varchar(7) constraint pk_pkgt primary key,
  spl_term varchar(200) not null
);
comment on table pkg_type is 'package type';
comment on column pkg_type.ncit_code is 'NCI Thesaurus code';

create table route (
  ncit_code varchar(7) constraint pk_route primary key,
  spl_term varchar(200) not null
);
comment on table route is 'route of administration';
comment on column route.ncit_code is 'NCI Thesaurus code';

create table dea_sched (
  ncit_code varchar(7) constraint pk_deasched primary key,
  spl_term varchar(200) not null
);
comment on table dea_sched is 'Drug Enforcement Agency Schedule';
comment on column dea_sched.ncit_code is 'NCI Thesaurus code';

create table mkt_cat (
  ncit_code varchar(7) constraint pk_mktcat primary key,
  spl_term varchar(200) not null
);
comment on table mkt_cat is 'marketing category';
comment on column mkt_cat.ncit_code is 'NCI Thesaurus code';

create table mkt_stat_type (
  ncit_code varchar(7) constraint pk_mktstattype primary key,
  spl_term varchar(200) not null
);
comment on table mkt_stat_type is 'marketing status type';
comment on column mkt_stat_type.ncit_code is 'NCI Thesaurus code';

create table bus_op (
  ncit_code varchar(7) constraint pk_busop primary key,
  spl_term varchar(200) not null
);
comment on table bus_op is 'business operation';
comment on column bus_op.ncit_code is 'NCI Thesaurus code';

create table doc_type (
  loinc_code varchar(10) constraint pk_doctype primary key,
  loinc_name varchar(200) not null
);
comment on table doc_type is 'labeling document type';

create table sec_type (
  loinc_code varchar(10) constraint pk_sectype primary key,
  loinc_name varchar(200) not null
);
comment on table sec_type is 'labeling section type';

create table spl (
  set_id uuid constraint pk_spl primary key,
  guid uuid not null,
  eff_date date,
  version int not null,
  dm_archive varchar(100) not null,
  dm_archive_entry varchar(100) not null,
  type_code varchar(10) not null constraint fk_spl_doctype references doc_type,
  title text,
  appr_year int,
  has_prod_wo_equiv boolean
);
create index ix_spl_typecode on spl (type_code);
create index ix_spl_hasprodwoequiv on spl (has_prod_wo_equiv);
comment on table spl is 'structured product labeling';

create table core_doc_ref (
  set_id uuid not null,
  refd_set_id uuid not null, -- Typically these don't exist in the spl table, so no fk is defined here.
  refd_version int,
  constraint pk_coredocref primary key (set_id),
  constraint fk_coredocref_setid foreign key (set_id) references spl
);
comment on table core_doc_ref is 'core document reference';
create index ix_coredocref_tosetid on core_doc_ref (refd_set_id);

create table pred_doc_ref (
  set_id uuid not null,
  refd_set_id uuid not null,
  refd_version int not null, -- Referenced set id is often missing in the spl table, thus no fk to spl is defined for this field.
  refd_guid uuid not null,
  other_reg_doc_type_code varchar(10),
  constraint pk_preddocref primary key (set_id, refd_set_id),
  constraint fk_preddocref_setid foreign key (set_id) references spl
);
comment on table pred_doc_ref is 'predecessor document reference';
create index ix_preddocref_tosetid on pred_doc_ref (refd_set_id);

create table org (
  set_id uuid not null,
  org_num smallint not null,
  parent_org_num smallint,
  name varchar(2000),
  duns_num varchar(9),
  constraint pk_org primary key (set_id, org_num),
  constraint fk_org_spl foreign key (set_id) references spl,
  constraint fk_org_org foreign key (set_id, parent_org_num) references org
);
create index ix_org_setid_parorgnum on org (set_id, parent_org_num);
comment on table org is 'organization';

create table org_act (
  set_id uuid not null,
  org_num smallint not null,
  act_num smallint not null,
  act_code varchar(20) not null,
  constraint pk_orgact primary key (set_id, org_num, act_num),
  constraint fk_orgact_org foreign key (set_id, org_num) references org,
  constraint fk_orgact_busop foreign key (act_code) references bus_op
);
comment on table org_act is 'organization activity';

create table org_act_prod (
  set_id uuid not null,
  org_num int not null,
  act_num int not null,
  prod_num int not null,
  prod_class_code varchar(20) not null,
  prod_code varchar(50) not null,
  prod_code_system varchar(50) not null,
  constraint pk_orgactprod primary key (set_id, org_num, act_num, prod_num),
  constraint fk_orgactprod_orgact foreign key (set_id, org_num, act_num) references org_act
);
comment on table org_act_prod is 'organization activity product';

create table sec (
  set_id uuid not null,
  sec_num int not null,
  type_code varchar(10),
  act_notuc_type_code varchar(10), -- nearest ancestor type code that is not that of SPL UNCLASSIFIED SECTION
  inf_type_code varchar(10),
  id_root uuid not null,
  parent_sec_num int,
  parent_id_root uuid,
  title text,
  eff_date date,
  non_highlight_xml xml,
  highlight_xml xml,
  constraint pk_sec primary key (set_id, sec_num),
  constraint fk_sec_sectype foreign key (type_code) references sec_type,
  constraint fk_sec_actnotucsec_sectype foreign key (act_notuc_type_code) references sec_type,
  constraint fk_sec_sec foreign key (set_id, parent_sec_num) references sec
);
create index ix_sec_sectypecd on sec (type_code);
create index ix_sec_actcltypecd on sec (act_notuc_type_code);
create index ix_sec_setid_parsecnum on sec (set_id, parent_sec_num);
-- create index ix_sec_txt on sec using gin (to_tsvector('english', text));
comment on table sec is 'section';

create table sec_frg (
  set_id uuid not null,
  sec_num int not null,
  frg_num int not null,
  text text not null,
  text_tsvec tsvector not null,
  text_hash bytea not null,
  act_sec_title text,
  act_notuc_sec_type_code varchar(10), -- active not-unclassified section type code
  gen_ctx varchar(1) not null check (gen_ctx in ('t','h','s')), -- title, highlight, section text (non-highlight)
  in_par boolean not null,  -- in paragraph
  in_cap boolean not null,  -- in caption
  in_tbl boolean not null,  -- in table
  in_tblh boolean not null, -- in table heading
  in_tbld boolean not null, -- in table data
  in_tblf boolean not null, -- in table footer
  in_lst boolean not null,  -- in list
  in_lsti boolean not null, -- in list item
  in_lnk boolean not null,  -- in link
  in_ftn boolean not null,  -- in footnote
  has_rmc boolean not null, -- has recent major changes content
  constraint pk_secfrg primary key (set_id, sec_num, frg_num),
  constraint fk_secfrg_sec foreign key (set_id, sec_num) references sec,
  constraint fk_secfrg_sect foreign key (act_notuc_sec_type_code) references sec_type
);
create index ix_secfrg_actnotucsectcd on sec_frg(act_notuc_sec_type_code);
create index ix_secfrg_txt on sec_frg using gin (text_tsvec);
comment on table sec_frg is 'section fragment';
comment on column sec_frg.act_notuc_sec_type_code is 'active not-unclassified section type code';
comment on column sec_frg.in_par is 'in a paragraph';
comment on column sec_frg.in_cap is 'in a caption';
comment on column sec_frg.in_tbl is 'in a table';
comment on column sec_frg.in_tblh is 'in a table heading';
comment on column sec_frg.in_tbld is 'in table data';
comment on column sec_frg.in_tblf is 'in table footer';
comment on column sec_frg.in_lst is 'in a list';
comment on column sec_frg.in_lsti is 'in a list item';
comment on column sec_frg.in_lnk is 'in a link';
comment on column sec_frg.in_ftn is 'in a footnote';
comment on column sec_frg.has_rmc is 'has recent major changes content';

create table prod (
  set_id uuid not null constraint fk_prod_spl references spl,
  prod_num smallint not null, -- document occurrence order
  part_num smallint not null, -- 0 for non-kit products and whole kit, >= 1 for component parts of a kit
  mkt_cat_code varchar(7) constraint fk_prod_mktcat references mkt_cat, -- NOTE: Think twice before trying to "normalize" this to a separate table having appl_code as pk. This is really only the submitter's declaration of the marketing category code for this SPL, so is not just a function of the code itself.
  appl_code varchar(12),
  ndc2 varchar(14),
  name varchar(1000),
  descr text,
  gen_name varchar(1000),
  equiv_ndc varchar(24),
  form_code varchar(7) constraint fk_prod_formcode references form,
  dea_code varchar(7) constraint fk_prod_deacode references dea_sched,
  constraint pk_prod primary key (set_id, prod_num, part_num)
);
create index ix_prod_mktcatcd on prod (mkt_cat_code);
create index ix_prod_applcd on prod (appl_code);
create index ix_prod_ndc2 on prod (ndc2);
create index ix_prod_formcode on prod (form_code);
create index ix_prod_deacode on prod (dea_code);
comment on table prod is 'labeling product';

create table prod_route (
  set_id uuid not null,
  prod_num smallint not null,
  part_num smallint not null,
  route_code varchar(7) constraint fk_prodroute_route references route,
  constraint pk_prodroute primary key (set_id, prod_num, part_num, route_code),
  constraint fk_prodroute_prod foreign key(set_id, prod_num, part_num) references prod
);
create index ix_prodroute_routecode on prod_route (route_code);
comment on table prod_route is 'product route of administration';

create table prod_mkt_stat (
  set_id uuid not null,
  prod_num smallint not null,
  part_num smallint not null check (part_num = 0),
  status_type_code varchar(7) not null references mkt_stat_type,
  status_code varchar(20) not null,
  eff_date_low date,
  eff_date_high date,
  constraint pk_prodmktstat primary key (set_id, prod_num, part_num),
  constraint fk_prodmktstat_prod foreign key(set_id, prod_num, part_num) references prod
);
comment on table prod_mkt_stat is 'product marketing status';

create table prod_char
(
  set_id uuid not null,
  prod_num smallint not null,
  part_num smallint not null,
  char_num smallint not null,
  char_code varchar(20) not null,
  val_type varchar(8) not null check (val_type in ('code', 'codenull', 'text', 'mediaref')),
  val_text varchar(500) not null,
  class_code varchar(20),
  orig_text varchar(500),
  constraint pk_prodchar primary key (set_id, prod_num, part_num, char_num),
  constraint fk_prodchar_prod foreign key(set_id, prod_num, part_num) references prod
);
comment on table prod_char is 'product characteristic';

create table prod_cfr_ref (
  set_id uuid not null,
  prod_num smallint not null,
  part_num smallint not null check (part_num = 0),
  cfr_ref varchar(100) not null,
  constraint pk_prodcfrref primary key (set_id, prod_num, part_num, cfr_ref),
  constraint fk_prodcfrref_prod foreign key(set_id, prod_num, part_num) references prod
);
comment on table prod_cfr_ref is 'product CFR reference';

create table prod_mon_id (
  set_id uuid not null,
  prod_num smallint not null,
  part_num smallint not null check (part_num = 0),
  mon_id varchar(100) not null,
  constraint pk_prodmonid primary key (set_id, prod_num, part_num, mon_id),
  constraint fk_prodmonid_prod foreign key(set_id, prod_num, part_num) references prod
);
comment on table prod_mon_id is 'product monograph id';

create table pkg_qty (
  id int constraint pk_pkgqty primary key,
  numer_val varchar(100) not null,
  numer_unit varchar(100),
  numer_trans_code varchar(7),
  numer_trans_name varchar(500),
  denom_val varchar(100) not null,
  denom_unit varchar(100),
  denom_trans_code varchar(7),
  denom_trans_name varchar(500)
);
comment on table pkg_qty is 'packaging quantity';

create table pkg (
  id int constraint pk_pkg primary key,
  parent_pkg_id int references pkg,
  set_id uuid not null,
  prod_num smallint not null,
  part_num smallint not null,
  pkg_num int not null,
  qty_id int not null constraint fk_pkg_pkgqty references pkg_qty,
  type_code varchar(7) constraint fk_pkg_pkgt references pkg_type,
  ndc3 varchar(14),
  constraint fk_pkg_prod foreign key(set_id, prod_num, part_num) references prod
);
create index ix_pkg_parentpkgid on pkg(parent_pkg_id);
create index ix_pkg_qtyid on pkg(qty_id);
create index ix_pkg_typecode on pkg(type_code);
create index ix_pkg_setidprodpart on pkg(set_id, prod_num, part_num);
comment on table pkg is 'labeling product packaging';

create table pkg_mkt_stat (
  pkg_id int not null references pkg,
  status_type_code varchar(7) not null references mkt_stat_type,
  status_code varchar(9) not null,
  eff_date_low date,
  eff_date_high date,
  constraint pk_pkgmktstat primary key (pkg_id)
);
comment on table pkg_mkt_stat is 'packaging marketing status';

create table pkg_char (
  pkg_id int not null references pkg,
  char_num smallint not null,
  char_code varchar(20) not null,
  val_type varchar(8) not null check (val_type in ('code', 'codenull', 'text', 'mediaref')),
  val_text varchar(500) not null,
  class_code varchar(20),
  orig_text varchar(500),
  constraint pk_pkgchar primary key (pkg_id, char_num)
);
comment on table pkg_char is 'packaging characteristic';

create table spl_ndc_inact (
  spl_set_id uuid not null references spl,
  ndc3 varchar(14) not null,
  indexing_entry_name varchar(100) not null,
  indexing_set_id uuid not null,
  indexing_guid uuid not null,
  indexing_eff_date date not null,
  indexing_ver int not null,
  eff_date_low date,
  eff_date_high date,
  constraint ck_effdate_low_or_high_present check (eff_date_low is not null or eff_date_high is not null),
  constraint pk_splndcinact primary key (spl_set_id, ndc3)
);
comment on table spl_ndc_inact is 'labeling NDC inactivation';

create table subs_medrt_class (
  unii varchar(10) not null,
  medrt_class_nui varchar(11) not null,
  effective_time date not null,
  constraint pk_subsmedrtclass primary key (unii, medrt_class_nui)
);
create index ix_subsmedrtclass_medrtclassnui on subs_medrt_class (medrt_class_nui);
comment on table subs_medrt_class is 'substance MED-RT class';

create table ingr_qty (
  id int constraint pk_ingrqty primary key,
  numer_val varchar(100) not null,
  numer_unit varchar(100),
  numer_trans_code varchar(7),
  numer_trans_name varchar(500),
  denom_val varchar(100) not null,
  denom_unit varchar(100),
  denom_trans_code varchar(7),
  denom_trans_name varchar(500)
);
comment on table ingr_qty is 'ingredient quantity';

create table act_ingr (
  id int constraint pk_actingr primary key,
  set_id uuid not null,
  prod_num smallint not null,
  part_num smallint not null,
  unii varchar(10) not null,
  name varchar(1000) not null,
  class_code varchar(10),
  qty_id int not null constraint fk_actingr_qty references ingr_qty,
  constraint fk_actingr_prod foreign key (set_id, prod_num, part_num) references prod
);
create index ix_actingr_setidprodpart on act_ingr(set_id, prod_num, part_num);
create index ix_actingr_unii on act_ingr(unii);
create index ix_actingr_ingrqty on act_ingr(qty_id);
comment on table act_ingr is 'active ingredient';

create table act_moiety (
  act_ingr_id int not null,
  unii varchar(10) not null,
  name varchar(1000) not null,
  constraint fk_actmoi_actingr foreign key (act_ingr_id) references act_ingr,
  constraint pk_actmoi primary key (act_ingr_id, unii)
);
create index ix_actmoiety_unii on act_moiety(unii);
comment on table act_moiety is 'active moeity';

create table act_ingr_equiv_subs (
  act_ingr_id int not null constraint fk_actingrequivsubs_actingr references act_ingr,
  equiv_unii varchar(10) not null,
  equiv_subs_name varchar(1000),
  constraint pk_actingrequivsubs primary key(act_ingr_id, equiv_unii)
);
create index ix_actingreqsubs_equnii on act_ingr_equiv_subs(equiv_unii);
comment on table act_ingr_equiv_subs is 'active ingredient equivalent substance';

create table inact_ingr (
  id int constraint pk_inactingr primary key,
  set_id uuid not null,
  prod_num smallint not null,
  part_num smallint not null,
  unii varchar(10),
  name varchar(1000) not null,
  class_code varchar(10),
  qty_id int constraint fk_inactingr_qty references ingr_qty,
  constraint fk_inactingr_prod foreign key (set_id, prod_num, part_num) references prod
);
create index ix_inactingr_setidprodpart on inact_ingr(set_id, prod_num, part_num);
create index ix_inactingr_unii on inact_ingr(unii);
create index ix_inactingr_ingrqty on inact_ingr(qty_id);
comment on table inact_ingr is 'inactive ingredient';

/* TODO: Consider loading this derived table to improve structure search performance if necessary.
create table unii_chem_struct (
  unii varchar(10) not null,
  smiles text not null,
  constraint pk_uniichemstruct primary key(unii),
  constraint fk_uniichemstruct_substance foreign key (unii) references ginas.substance
);
*/

create table spl_sec_meddra_llt_occ (
  set_id uuid not null constraint fk_splsecmeddralltocc_setid references spl,
  sec_type_code varchar(10) not null constraint fk_splsecmeddralltocc_sectype references sec_type,
  sec_guid uuid not null,
  llt_code int not null,
  start_ix int not null,
  end_ix int not null,
  constraint pk_splsecmeddralltocc primary key (set_id, sec_type_code, sec_guid, llt_code, start_ix, end_ix)
);
create index ix_splsecmeddralltocc_sectype on spl_sec_meddra_llt_occ (sec_type_code);
create index ix_splsecmeddralltocc_lltsect on spl_sec_meddra_llt_occ (llt_code, sec_type_code);
comment on table spl_sec_meddra_llt_occ is 'labeling section MedDRA low level term occurrences';

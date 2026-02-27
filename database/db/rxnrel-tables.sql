set search_path to rxnrel;

create table "in" (
  rxcui varchar(12) not null,
  rxaui varchar(12) not null,
  name varchar(4000) not null unique,
  suppress varchar(1) not null,
  constraint pk_in primary key (rxcui)
);
comment on table "in" is 'ingredient';

create table min (
  rxcui varchar(12) primary key,
  rxaui varchar(12) not null,
  name varchar(4000) not null unique,
  suppress varchar(1) not null
);
comment on table min is 'multi-ingredient set';

create table pin (
  rxcui varchar(12) primary key,
  rxaui varchar(12) not null,
  name varchar(4000) not null unique,
  in_rxcui varchar(12) not null references "in",
  suppress varchar(1) not null
);
comment on table "pin" is 'precise ingredient';
create index ix_pin_in on pin(in_rxcui);

create table bn (
  rxcui varchar(12) primary key,
  rxaui varchar(12) not null,
  name varchar(4000) not null unique,
  rxn_cardinality varchar(6),
  reformulated_to_rxcui varchar(12) references bn,
  cur_pres boolean not null,
  suppress varchar(1) not null
);
comment on table bn is 'brand name';
create index ix_bn_reformbn on bn(reformulated_to_rxcui);

create table min_in (
  min_rxcui varchar(12) not null references min,
  in_rxcui varchar(12) not null references "in",
  constraint pk_minin primary key (min_rxcui, in_rxcui)
);
comment on table min_in is 'association of a multi-ingredient and member ingredient';
create index ix_minin_in on min_in(in_rxcui);

create table min_pin (
  min_rxcui varchar(12) not null references min,
  pin_rxcui varchar(12) not null references pin,
  constraint pk_minpin primary key (min_rxcui, pin_rxcui)
);
comment on table min_pin is 'association of a multi-ingredient and member precise ingredient';
create index ix_minin_pin on min_pin(pin_rxcui);

create table bn_in (
  bn_rxcui varchar(12) not null references bn,
  in_rxcui varchar(12) not null references "in",
  constraint pk_bnin primary key(bn_rxcui, in_rxcui)
);
comment on table bn_in is 'an association of a brand name and ingredient via tradename_of';
create index ix_bnin_in on bn_in(in_rxcui);

-- prescribable name
create table psn (
  rxcui varchar(12) primary key,
  rxaui varchar(12) not null,
  name varchar(4000) not null unique,
  cur_pres boolean not null,
  suppress varchar(1) not null
);
comment on table psn is 'prescribable name';

create table df (
  rxcui varchar(12) primary key,
  rxaui varchar(12) not null,
  name varchar(4000) not null,
  origin varchar(500),
  code varchar(500),
  suppress varchar(1) not null
);
comment on table df is 'dose form';

create table dfg (
  rxcui varchar(12) primary key,
  rxaui varchar(12) not null,
  name varchar(4000) not null,
  suppress varchar(1) not null
);
comment on table dfg is 'dose form group';

create table dfg_df (
  dfg_rxcui varchar(12) not null references dfg,
  df_rxcui varchar(12) not null references df,
  constraint pk_dfgdf_cui primary key (dfg_rxcui, df_rxcui)
);
comment on table dfg_df is 'association of a dose form group and a member dose form';
create index ix_dfgdf_df on dfg_df(dfg_rxcui);

create table scdf (
  rxcui varchar(12) primary key,
  rxaui varchar(12) not null,
  name varchar(4000) not null unique,
  df_rxcui varchar(12) not null references df,
  cur_pres boolean not null,
  suppress varchar(1) not null
);
comment on table scdf is 'semantic clinical drug and form';
create index ix_scdf_df on scdf(df_rxcui);

create table scdf_in (
  scdf_rxcui varchar(12) not null references scdf,
  in_rxcui varchar(12) not null references "in",
  constraint pk_scdfin_cui primary key (scdf_rxcui, in_rxcui)
);
comment on table scdf_in is 'association of a semantic clinical drug form and ingredient';
create index ix_scdfin_in on scdf_in(in_rxcui);

-- TODO: Review from here, make sure that relationships and attributes are complete.

create table scd (
  rxcui varchar(12) primary key,
  rxaui varchar(12) not null unique,
  name varchar(4000) not null,
  psn_rxcui varchar(12) references psn,
  rxterm_form varchar(100),
  df_rxcui varchar(12) not null references df,
  scdf_rxcui varchar(12) not null references scdf,
  min_rxcui varchar(12) references min,
  strengths varchar(500),
  qual_distinct varchar(500),
  qty varchar(100),
  human boolean,
  vet boolean,
  unquant_form_rxcui varchar(12) references scd,
  cur_pres boolean not null,
  suppress varchar(1) not null
);
comment on table scd is 'semantic clinical drug';
comment on column scd.strengths is 'available strengths';
comment on column scd.qual_distinct is 'qualitative distinction';
comment on column scd.human is 'human drug indicator';
comment on column scd.vet is 'veterinary drug indicator';
comment on column scd.unquant_form_rxcui is 'unquantified form RxNOrm CUI';
comment on column scd.cur_pres is 'currently prescribably';
create index ix_scd_psn on scd(psn_rxcui);
create index ix_scd_df on scd(df_rxcui);
create index ix_scd_scdf on scd(scdf_rxcui);
create index ix_scd_min on scd(min_rxcui);
create index ix_scd_uqform on scd(unquant_form_rxcui);

create table sbdf (
  rxcui varchar(12) primary key,
  rxaui varchar(12) not null,
  name varchar(4000) not null,
  bn_rxcui varchar(12) not null references bn,
  df_rxcui varchar(12) not null references df,
  scdf_rxcui varchar(12) not null references scdf,
  cur_pres boolean not null,
  constraint uq_sbdf_bn_df unique (bn_rxcui, df_rxcui)
);
comment on table sbdf is 'semantic branded drug and form';
create index ix_sbdf_bn on sbdf(bn_rxcui);
create index ix_sbdf_df on sbdf(df_rxcui);
create index ix_sbdf_scdf on sbdf(scdf_rxcui);

create table sbdc (
  rxcui varchar(12) primary key,
  rxaui varchar(12) not null,
  name varchar(4000) not null
);
comment on table sbdc is 'semantic branded drug component';

create table sbd (
  rxcui varchar(12) primary key,
  rxaui varchar(12) not null unique,
  name varchar(4000) not null,
  scd_rxcui varchar(12) not null references scd,
  bn_rxcui varchar(12) not null references bn,
  sbdf_rxcui varchar(12) not null references sbdf,
  sbdc_rxcui varchar(12) not null references sbdc,
  psn_rxcui varchar(12) references psn,
  rxterm_form varchar(100),
  df_rxcui varchar(12) not null references df,
  available_strengths varchar(500),
  qual_distinct varchar(500),
  quantity varchar(100),
  human_drug boolean,
  vet_drug boolean,
  unquantified_form_rxcui varchar(12) references sbd,
  cur_pres boolean not null,
  suppress varchar(1) not null
);
comment on table sbd is 'semantic branded drug';
create index ix_sbd_scd on sbd(scd_rxcui);
create index ix_sbd_bn on sbd(bn_rxcui);
create index ix_sbd_sbdf on sbd(sbdf_rxcui);
create index ix_sbd_sbdc on sbd(sbdc_rxcui);
create index ix_sbd_df on sbd(df_rxcui);
create index ix_sbd_uqsbd on sbd(unquantified_form_rxcui);

create table gpck (
  rxcui varchar(12) primary key,
  rxaui varchar(12) not null unique,
  name varchar(4000) not null,
  psn_rxcui varchar(12) references psn,
  df_rxcui varchar(12) not null references df,
  human_drug boolean,
  cur_pres boolean not null,
  suppress varchar(1) not null
);
comment on table gpck is 'generic drug pack';
create index ix_gpck_df on gpck(df_rxcui);

create table bpck (
  rxcui varchar(12) primary key,
  rxaui varchar(12) not null unique,
  name varchar(4000) not null,
  gpck_rxcui varchar(12) not null references gpck,
  psn_rxcui varchar(12) references psn,
  df_rxcui varchar(12) not null references df,
  human_drug boolean,
  cur_pres boolean not null,
  suppress varchar(1) not null
);
comment on table bpck is 'branded drug pack';
create index ix_bpck_gpck on bpck(gpck_rxcui);
create index ix_bpck_df on bpck(df_rxcui);

create table scdc (
  rxcui varchar(12) primary key,
  rxaui varchar(12) not null,
  name varchar(4000) not null unique,
  in_rxcui varchar(12) not null references "in",
  pin_rxcui varchar(12) references pin,
  boss_active_ingr_name varchar(4000),
  boss_active_moi_name varchar(4000),
  boss_source varchar(10),
  rxn_in_expressed_flag varchar(10),
  strength varchar(500),
  boss_str_num_unit varchar(100),
  boss_str_num_val varchar(100),
  boss_str_denom_unit varchar(100),
  boss_str_denom_val varchar(100)
);
comment on table scdc is 'semantic clinical drug component';
create index ix_scdc_in on scdc(in_rxcui);
create index ix_scdc_pin on scdc(pin_rxcui);

create table scdg (
  rxcui varchar(12) primary key,
  rxaui varchar(12) not null,
  name varchar(4000) not null unique,
  dfg_rxcui varchar(12) not null references dfg,
  cur_pres boolean not null,
  suppress varchar(1) not null
);
comment on table scdg is 'semantic clinical drug form group';
create index ix_scdg_dfg on scdg(dfg_rxcui);

create table scdg_scdf (
  scdg_rxcui varchar(12) not null references scdg,
  scdf_rxcui varchar(12) not null references scdf,
  constraint pk_scdgscdf_cui primary key (scdg_rxcui, scdf_rxcui)
);
comment on table scdg_scdf is 'association of a semantic clinical drug form group and member semantic clinical drug form';
create index ix_scdgscdf_scdf on scdg_scdf(scdf_rxcui);

create table scdg_in (
  scdg_rxcui varchar(12) not null references scdg,
  in_rxcui varchar(12) not null references "in",
  constraint pk_scdgin_cui primary key (scdg_rxcui, in_rxcui)
);
comment on table scdg_in is 'association of a semantic clinical drug form group and ingredient';
create index ix_scdgin_in on scdg_in(in_rxcui);

create table sbdg (
  rxcui varchar(12) primary key,
  rxaui varchar(12) not null,
  name varchar(4000) not null,
  bn_rxcui varchar(12) references bn,
  dfg_rxcui varchar(12) not null references dfg,
  scdg_rxcui varchar(12) not null references scdg,
  cur_pres boolean not null,
  suppress varchar(1) not null,
  constraint uq_sbdg_bn_dfg unique (bn_rxcui, dfg_rxcui)
);
comment on table sbdg is 'semantic branded drug form group';
create index ix_sbdg_bn on sbdg(bn_rxcui);
create index ix_sbdg_df on sbdg(dfg_rxcui);
create index ix_sbdg_scdg on sbdg(scdg_rxcui);

create table sbdg_sbdf (
  sbdg_rxcui varchar(12) not null references sbdg,
  sbdf_rxcui varchar(12) not null references sbdf,
  constraint pk_sbdgsbdf_cui primary key (sbdg_rxcui, sbdf_rxcui)
);
comment on table sbdg_sbdf is 'association of a semantic branded drug form group with a member semantic branded drug form';
create index ix_sbdgsbdf_sbdf on sbdg_sbdf(sbdf_rxcui);

create table sbdg_sbd (
  sbdg_rxcui varchar(12) not null references sbdg,
  sbd_rxcui varchar(12) not null references sbd,
  constraint pk_sbdgsbd_cui primary key (sbdg_rxcui, sbd_rxcui)
);
comment on table sbdg_sbd is 'association of a semantic branded drug form group with a semantic branded drug';
create index ix_sbdgsbd_sbd on sbdg_sbd(sbd_rxcui);

create table sbdc_scdc (
  sbdc_rxcui varchar(12) not null references sbdc,
  scdc_rxcui varchar(12) not null references scdc,
  constraint pk_sbdcscdc primary key (sbdc_rxcui, scdc_rxcui)
);
comment on table sbdc_scdc is 'association of a semantic branded drug component and a semantic clinical drug component';
create index ix_sbdcscdc_scdc on sbdc_scdc(scdc_rxcui);

create table bpck_sy (
  bpck_rxcui varchar(12) not null references bpck,
  sy varchar(4000) not null,
  constraint pk_bpcksy primary key (bpck_rxcui, sy)
);
comment on table bpck_sy is 'branded drug pack synonym';

create table df_sy (
  df_rxcui varchar(12) not null references df,
  sy varchar(4000) not null,
  constraint pk_dfsy primary key (df_rxcui, sy)
);
comment on table df_sy is 'dose form synonym';

create table gpck_sy (
  gpck_rxcui varchar(12) not null references gpck,
  sy varchar(4000) not null,
  constraint pk_gpcksy primary key (gpck_rxcui, sy)
);
comment on table gpck_sy is 'generic drug pack synonym';

create table in_sy (
  in_rxcui varchar(12) not null references "in",
  sy varchar(4000) not null,
  constraint pk_insy primary key (in_rxcui, sy)
);
comment on table in_sy is 'ingredient synonym';

create table min_sy (
  min_rxcui varchar(12) not null references min,
  sy varchar(4000) not null,
  constraint pk_minsy primary key (min_rxcui, sy)
);
comment on table min_sy is 'multi-ingredient synonym';

create table pin_sy (
  pin_rxcui varchar(12) not null references pin,
  sy varchar(4000) not null,
  constraint pk_pinsy primary key (pin_rxcui, sy)
);
comment on table pin_sy is 'precise ingredient synonym';

create table psn_sy (
  psn_rxcui varchar(12) not null references psn,
  sy varchar(4000) not null,
  constraint pk_psnsy primary key (psn_rxcui, sy)
);
comment on table psn_sy is 'prescribable name synonym';

create table sbd_sy (
  sbd_rxcui varchar(12) not null references sbd,
  sy varchar(4000) not null,
  constraint pk_sbdsy primary key (sbd_rxcui, sy)
);
comment on table sbd_sy is 'semantic branded drug synonym';

create table scd_sy (
  scd_rxcui varchar(12) not null references scd,
  sy varchar(4000) not null,
  constraint pk_scdsy primary key (scd_rxcui, sy)
);
comment on table scd_sy is 'semantic clinical drug synonym';

create table scdf_sy (
  scdf_rxcui varchar(12) not null references scdf,
  sy varchar(4000) not null,
  constraint pk_scdfsy primary key (scdf_rxcui, sy)
);
comment on table scdf_sy is 'semantic clinical drug and form synonym';

create table sy_tmsy (
  sy varchar(4000) not null,
  tmsy varchar(4000) not null,
  constraint pk_sytmsy primary key (sy, tmsy)
);
comment on table sy_tmsy is 'synonym tall man synonym';

create table scd_scdc (
  scd_rxcui varchar(12) not null references scd,
  scdc_rxcui varchar(12) not null references scdc,
  constraint pk_scdscdc primary key (scd_rxcui, scdc_rxcui)
);
comment on table scd_scdc is 'association of a semantic clinical drug and semantic clinical drug component';
create index ix_scdscdc_scdc on scd_scdc(scdc_rxcui);

create table scdg_scd (
  scdg_rxcui varchar(12) not null references scdg,
  scd_rxcui varchar(12) not null references scd,
  constraint pk_scdgscd_cui primary key (scdg_rxcui, scd_rxcui)
);
comment on table scdg_scd is 'association of a semantic clinical drug form group and a semantic clinical drug';
create index ix_scdgscd_scd on scdg_scd(scd_rxcui);

create table gpck_scd (
  gpck_rxcui varchar(12) not null references gpck,
  scd_rxcui varchar(12) not null references scd,
  constraint pk_gpckscd_cui primary key (gpck_rxcui, scd_rxcui)
);
comment on table gpck_scd is 'association of a semantic clinical drug pack and a semantic clinical drug';
create index ix_gpckscd_scd on gpck_scd(scd_rxcui);

create table bpck_scd (
  bpck_rxcui varchar(12) not null references bpck,
  scd_rxcui varchar(12) not null references scd,
  constraint pk_bpckscd_cui primary key (bpck_rxcui, scd_rxcui)
);
comment on table bpck_scd is 'association of a semantic branded drug pack and a semantic clinical drug';
create index ix_bpckscd_scd on bpck_scd(scd_rxcui);

create table bpck_sbd (
  bpck_rxcui varchar(12) not null references bpck,
  sbd_rxcui varchar(12) not null references sbd,
  constraint pk_bpcksbd_cui primary key (bpck_rxcui, sbd_rxcui)
);
comment on table bpck_sbd is 'association of a semantic branded drug pack and a semantic branded drug';
create index ix_bpcksbd_sbd on bpck_sbd(sbd_rxcui);

-- TODO

-- FDA drug labeling tables

create table mthspl_sub (
  rxaui varchar(12) not null primary key,
  rxcui varchar(12) not null,
  unii varchar(10),
  biologic_code varchar(18),
  name varchar(4000) not null,
  in_rxcui varchar(12) references "in",
  pin_rxcui varchar(12) references pin,
  suppress varchar(1) not null,
  constraint ck_mthspl_sub_notuniiandbiocode check (unii is null or biologic_code is null)
);
comment on table mthspl_sub is 'SPL substance';
create index ix_mthsplsub_cui on mthspl_sub(rxcui);
create index ix_mthsplsub_unii on mthspl_sub(unii);
create index ix_mthsplsub_code on mthspl_sub(biologic_code);
create index ix_mthsplsub_in on mthspl_sub(in_rxcui);
create index ix_mthsplsub_pin on mthspl_sub(pin_rxcui);

create table mthspl_prod (
  rxaui varchar(12) not null primary key,
  rxcui varchar(12) not null,
  code varchar(13), -- Most of these are NDCs without packaging (no 3rd part), some are not NDCs at all.
  rxnorm_created boolean not null,
  name varchar(4000) not null,
  scd_rxcui varchar(12) references scd,   -- | mutually exclusive
  sbd_rxcui varchar(12) references sbd,   -- |
  gpck_rxcui varchar(12) references gpck, -- |
  bpck_rxcui varchar(12) references bpck, -- |
  suppress varchar(1) not null,
  ambiguity_flag varchar(9),
  constraint ck_mthsplprod_xor_drug_refs check (
    case when scd_rxcui is null then 0 else 1 end +
    case when sbd_rxcui is null then 0 else 1 end +
    case when gpck_rxcui is null then 0 else 1 end +
    case when bpck_rxcui  is null then 0 else 1 end <= 1
  )
);
comment on table mthspl_prod is 'SPL product';
create index ix_mthsplprod_cui on mthspl_prod(rxcui);
create index ix_mthsplprod_code on mthspl_prod(code);
create index ix_mthsplprod_scd on mthspl_prod(scd_rxcui);
create index ix_mthsplprod_sbd on mthspl_prod(sbd_rxcui);
create index ix_mthsplprod_gpck on mthspl_prod(gpck_rxcui);
create index ix_mthsplprod_bpck on mthspl_prod(bpck_rxcui);

create table mthspl_sub_setid (
  sub_rxaui varchar(12) not null references mthspl_sub,
  set_id varchar(46) not null,
  suppress varchar(1) not null,
  primary key (sub_rxaui, set_id)
);
comment on table mthspl_sub_setid is 'SPL substance set id';
create index ix_mthsplsubsetid_setid on mthspl_sub_setid(set_id);

create table mthspl_ingr_type (
  ingr_type varchar(1) not null primary key,
  description varchar(1000) not null
);
comment on table mthspl_ingr_type is 'SPL ingredient type';

create table mthspl_prod_sub (
  prod_rxaui varchar(12) not null references mthspl_prod,
  ingr_type varchar(1) not null references mthspl_ingr_type,
  sub_rxaui varchar(12) not null references mthspl_sub,
  primary key (prod_rxaui, ingr_type, sub_rxaui)
);
comment on table mthspl_prod_sub is 'SPL product substance';
create index ix_mthsplprodsub_ingrtype on mthspl_prod_sub(ingr_type);
create index ix_mthsplprodsub_subaui on mthspl_prod_sub(sub_rxaui);

create table mthspl_prod_dmspl (
  prod_rxaui varchar(12) not null references mthspl_prod,
  dm_spl_id varchar(46) not null,
  primary key (prod_rxaui, dm_spl_id)
);
comment on table mthspl_prod_dmspl is 'SPL product DailyMed identifier';
create index ix_mthspl_proddmspl_dmsplid on mthspl_prod_dmspl(dm_spl_id);

create table mthspl_prod_setid (
  prod_rxaui varchar(12) not null references mthspl_prod,
  spl_set_id varchar(46) not null,
  primary key (prod_rxaui, spl_set_id)
);
comment on table mthspl_prod_setid is 'SPL product set id';
create index ix_mthsplprodsetid_setid on mthspl_prod_setid(spl_set_id);

create table mthspl_prod_ndc (
  prod_rxaui varchar(12) not null references mthspl_prod,
  full_ndc varchar(12) not null,
  two_part_ndc varchar(12) not null,
  primary key (prod_rxaui, full_ndc)
);
comment on table mthspl_prod_ndc is 'SPL product NDC';
create index ix_mthsplprodndc_fullndc on mthspl_prod_ndc(full_ndc);
create index ix_mthsplprodndc_twopartndc on mthspl_prod_ndc(two_part_ndc);

create table mthspl_prod_labeler (
  prod_rxaui varchar(12) not null references mthspl_prod,
  labeler varchar(4000) not null,
  primary key (prod_rxaui, labeler)
);
comment on table mthspl_prod_labeler is 'SPL product labeler';

create table mthspl_prod_labeltype (
  prod_rxaui varchar(12) not null references mthspl_prod,
  label_type varchar(500) not null,
  primary key (prod_rxaui, label_type)
);
comment on table mthspl_prod_labeltype is 'SPL product label type';
create index ix_mthsplprodlblt_lblt on mthspl_prod_labeltype(label_type);

create table mthspl_prod_mktstat (
  prod_rxaui varchar(12) not null references mthspl_prod,
  mkt_stat varchar(500) not null,
  primary key (prod_rxaui, mkt_stat)
);
comment on table mthspl_prod_mktstat is 'SPL product marketing status';
create index ix_mthsplprodmktstat_mktstat on mthspl_prod_mktstat(mkt_stat);

create table mthspl_prod_mkteffth (
  prod_rxaui varchar(12) not null references mthspl_prod,
  mkt_eff_time_high varchar(8) not null,
  primary key (prod_rxaui, mkt_eff_time_high)
);
comment on table mthspl_prod_mkteffth is 'SPL product marketing effective time high';
create index ix_mthsplprodmkteffth_mkteffth on mthspl_prod_mkteffth(mkt_eff_time_high);

create table mthspl_prod_mktefftl (
  prod_rxaui varchar(12) not null references mthspl_prod,
  mkt_eff_time_low varchar(8) not null,
  primary key (prod_rxaui, mkt_eff_time_low)
);
comment on table mthspl_prod_mktefftl is 'SPL product marketing effective time low';
create index ix_mthsplprodmktefftl_mktetl on mthspl_prod_mktefftl(mkt_eff_time_low);

create table mthspl_mktcat (
  name varchar(500) primary key
);
comment on table mthspl_mktcat is 'SPL marketing category';

create table mthspl_prod_mktcat (
  prod_rxaui varchar(12) not null references mthspl_prod,
  mkt_cat varchar(500) not null references mthspl_mktcat,
  primary key (prod_rxaui, mkt_cat)
);
comment on table mthspl_prod_mktcat is 'SPL product marketing category';
create index ix_mthsplprodmktcat_mktcat on mthspl_prod_mktcat(mkt_cat);

create table mthspl_prod_mktcat_code (
  prod_rxaui varchar(12) not null references mthspl_prod,
  mkt_cat varchar(500) not null references mthspl_mktcat,
  code varchar(20) not null,
  num varchar(9) not null,
  primary key (prod_rxaui, mkt_cat, code)
);
comment on table mthspl_prod_mktcat_code is 'SPL product marketing category code';
create index ix_mthsplprodmktcatcode_mktcat on mthspl_prod_mktcat_code(mkt_cat);
create index ix_mthsplprodmktcatcode_code on mthspl_prod_mktcat_code(code);
create index ix_mthsplprodmktcatcode_num on mthspl_prod_mktcat_code(num);

create table mthspl_pillattr (
  attr varchar(500) primary key
);
comment on table mthspl_pillattr is 'SPL pill attribute';

create table mthspl_prod_pillattr (
  prod_rxaui varchar(12) not null references mthspl_prod,
  attr varchar(500) not null references mthspl_pillattr,
  attr_val varchar(1000) not null,
  primary key (prod_rxaui, attr, attr_val)
);
comment on table mthspl_prod_pillattr is 'SPL product pill attribute';
create index ix_mthsplprodpillattr_attr on mthspl_prod_pillattr(attr);
create index ix_mthsplprodpillattr_attrval on mthspl_prod_pillattr(attr_val);

create table mthspl_prod_dcsa (
  prod_rxaui varchar(12) not null references mthspl_prod,
  dcsa varchar(4) not null,
  primary key (prod_rxaui, dcsa)
);
comment on table mthspl_prod_dcsa is 'SPL product DCSA';
create index ix_mthsplproddcsa_dcsa on mthspl_prod_dcsa(dcsa);

create table mthspl_prod_nhric (
  prod_rxaui varchar(12) not null references mthspl_prod,
  nhric varchar(13) not null,
  primary key (prod_rxaui, nhric)
);
comment on table mthspl_prod_nhric is 'SPL product NHRIC';
create index ix_mthsplproddcsa_nhric on mthspl_prod_nhric(nhric);


-- ingredient related tables

create table in_src_form (
  in_rxcui varchar(12) not null references "in",
  src varchar(11) not null,
  form_tty varchar(11) not null,
  form_rxaui varchar(12) not null,
  form_rxcui varchar(12) not null,
  form_name text not null,
  form_code varchar(30) not null,
  form_suppress varchar(1) not null,
  constraint pk_insrcform primary key (in_rxcui, src, form_rxaui)
);
comment on table in_src_form is 'ingredient source form';

create table in_src_tname (
  in_rxcui varchar(12) not null references "in",
  src varchar(11) not null,
  tname_tty varchar(11) not null,
  tname_rxaui varchar(12) not null,
  tname_rxcui varchar(12) not null,
  tname text not null,
  tname_code varchar(30) not null,
  tname_suppress varchar(1) not null,
  constraint pk_insrctname primary key (in_rxcui, src, tname_rxaui)
);
comment on table in_src_tname is 'ingredient source trade name';

create table in_src_in_of (
  in_rxcui varchar(12) not null references "in",
  src varchar(11) not null,
  in_of_tty varchar(11) not null,
  in_of_rxaui varchar(12) not null,
  in_of_rxcui varchar(12) not null,
  in_of text not null,
  in_of_code varchar(30) not null,
  in_of_suppress varchar(1) not null,
  constraint pk_insrcinof primary key (in_rxcui, src, in_of_rxaui)
);
comment on table in_src_in_of is 'ingredient source ingredient-of';

create table in_src_part_of (
  in_rxcui varchar(12) not null references "in",
  src varchar(11) not null,
  part_of_tty varchar(11) not null,
  part_of_rxaui varchar(12) not null,
  part_of_rxcui varchar(12) not null,
  part_of text not null,
  part_of_code varchar(30) not null,
  part_of_suppress varchar(1) not null,
  constraint pk_insrcpartof primary key (in_rxcui, src, part_of_rxaui)
);
comment on table in_src_part_of is 'ingredient source part-of';

create table in_rxn_action (
  in_rxcui varchar(12) not null references "in",
  action varchar(30) not null,
  date date not null,
  rxaui varchar(12) not null,
  constraint pk_inrxnaction primary key (in_rxcui, action)
);
comment on table in_rxn_action is 'ingredient RxNorm action';
create index ix_inrxnaction_in on in_rxn_action(in_rxcui, action);

create table msh_in_ann (
  rxaui varchar(12) not null,
  annotation text not null,
  code varchar(30) not null,
  in_rxcui varchar(12) references "in",
  constraint pk_mshinan primary key (rxaui)
);
comment on table msh_in_ann is 'MeSH ingredient annotation';
create index ix_mshinan_in on msh_in_ann (in_rxcui);

create table msh_in_aql (
  rxaui varchar(12) not null,
  qualifier varchar(2) not null,
  code varchar(10) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinaql primary key (rxaui, qualifier)
);
comment on table msh_in_aql is 'association of an ingredient with an allowed MeSH qualifier';
create index ix_mshinaql_qual on msh_in_aql(qualifier);
create index ix_mshinaql_in on msh_in_aql(in_rxcui);

create table msh_in_hnum (
  rxaui varchar(12) not null,
  hnum varchar(50) not null,
  code varchar(10) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinhnum primary key (rxaui, hnum)
);
comment on table msh_in_hnum is 'MeSH ingredient hierarchical number';
create index ix_mshinhnum_in on msh_in_hnum(in_rxcui);

create table msh_in_dc (
  rxaui varchar(12) not null,
  msh_class smallint not null,
  code varchar(10) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshindc primary key (rxaui)
)
;
comment on table msh_in_dc is 'ingredient MeSH class';
create index ix_mshindc_mshclass on msh_in_dc(msh_class);

create table msh_in_est_date (
  rxaui varchar(12) not null,
  established date not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinestdate primary key (rxaui)
);
comment on table msh_in_est_date is 'MeSH ingredient established date';
create index ix_mshinestdate_in on msh_in_est_date(in_rxcui);

create table msh_in_ent_date (
  rxaui varchar(12) not null,
  entered date not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinentdate primary key (rxaui)
);
comment on table msh_in_ent_date is 'MeSH ingredient entry date';
create index ix_mshinentdate_in on msh_in_ent_date(in_rxcui);

create table msh_in_rev_date (
  rxaui varchar(12) not null,
  revised date not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinrevdate primary key (rxaui)
);
comment on table msh_in_rev_date is 'MeSH ingredient revision date';
create index ix_mshinrevdate_in on msh_in_rev_date(in_rxcui);

create table msh_in_hdg (
  rxaui varchar(12) not null,
  main_hdg varchar(200) not null,
  code varchar(7) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_inmeshhdg primary key (rxaui, main_hdg)
);
comment on table msh_in_hdg is 'MeSH main heading';
create index ix_mshinhdg on msh_in_hdg(in_rxcui);

create table msh_in_ml_note (
  rxaui varchar(12) not null,
  note text not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinmlnote primary key (rxaui)
);
comment on table msh_in_ml_note is 'MeSH online note for MEDLINE searchers';
create index ix_mshinmlnote_in on msh_in_ml_note(in_rxcui);

create table msh_in_freq (
  rxaui varchar(12) not null,
  freq smallint not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinfreq primary key (rxaui)
);
comment on table msh_in_freq is 'MeSH ingredient frequency';
create index ix_mshinfreq_in on msh_in_freq (in_rxcui);

create table msh_in_see_hdg (
  rxaui varchar(12) not null,
  hdg varchar(30) not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinseehdg primary key (rxaui, hdg)
);
comment on table msh_in_see_hdg is 'MeSH ingredient see related main heading';
create index ix_mshinseehdg_in on msh_in_see_hdg (in_rxcui);

create table msh_in_hdg_mapped_to (
  rxaui varchar(12) not null,
  hdg_mapped_to varchar(30) not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinhdgmappedto primary key (rxaui, hdg_mapped_to)
);
comment on table msh_in_hdg_mapped_to is 'MeSH Heading Mapped To';
create index ix_mshinhdgmappedto_in on msh_in_hdg_mapped_to(in_rxcui);

create table msh_in_hist (
  rxaui varchar(12) not null,
  note text not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinhist primary key (rxaui)
);
comment on table msh_in_hist is 'MeSH ingredient history note';
create index ix_mshinhist_in on msh_in_hist(in_rxcui);

create table msh_in_rel_hdg (
  rxaui varchar(12) not null,
  rel_hdg text not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinrelhdg primary key (rxaui, rel_hdg)
);
comment on table msh_in_rel_hdg is 'MeSH ingredient maybe relevant heading';
create index ix_mshinrelhdg_in on msh_in_rel_hdg(in_rxcui);

create table msh_in_is_tname (
  rxaui varchar(12) not null,
  is_tradename boolean not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinistname primary key (rxaui)
);
comment on table msh_in_is_tname is 'MeSH ingredient is trade name';
create index ix_mshinistname_in on msh_in_is_tname(in_rxcui);

create table msh_in_hdg_dates (
  rxaui varchar(12) not null,
  hdg_dates varchar(200) not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinhdgdates primary key (rxaui, hdg_dates)
);
comment on table msh_in_hdg_dates is 'MeSH ingredient heading dates';
create index ix_mshinhdgdates_in on msh_in_hdg_dates(in_rxcui);

create table msh_in_pub_note (
  rxaui varchar(12) not null,
  note text not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinpubnote primary key (rxaui)
);
comment on table msh_in_pub_note is 'MeSH ingredient public note';
create index ix_mshinpubnote_in on msh_in_pub_note(in_rxcui);

create table msh_in_reg_num (
  rxaui varchar(12) not null,
  reg_num varchar(30) not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinregnum primary key (rxaui)
);
comment on table msh_in_reg_num is 'MeSH ingredient registry number';
create index ix_mshinregnum_in on msh_in_reg_num(in_rxcui);

create table msh_in_ca_reg_num (
  rxaui varchar(12) not null,
  ca_reg_num varchar(200) not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshincaregnum primary key (rxaui, ca_reg_num)
);
comment on table msh_in_ca_reg_num is 'MeSH ingredient Chemical Abstracts registry numbers';
create index ix_mshincaregnum_in on msh_in_ca_reg_num(in_rxcui);

create table msh_in_sup_class (
  rxaui varchar(12) not null,
  sup_class smallint not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinsupclass primary key (rxaui)
);
comment on table msh_in_sup_class is 'MeSH ingredient supplemental class';
create index ix_mshinsupclass_in on msh_in_sup_class(in_rxcui);

create table msh_in_lit_src (
  rxaui varchar(12) not null,
  lit_src varchar(500) not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinlitsrc primary key (rxaui, lit_src)
);
comment on table msh_in_lit_src is 'MeSH ingredient literature source';
create index ix_mshinlitsrc_in on msh_in_lit_src(in_rxcui);

create table msh_in_term_ui (
  rxaui varchar(12) not null,
  term_ui varchar(30) not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshintermui primary key (rxaui)
);
comment on table msh_in_term_ui is 'MeSH ingredient term unique identifier';
create index ix_mshintermui_in on msh_in_term_ui(in_rxcui);

create table msh_in_thes_id (
  rxaui varchar(12) not null,
  thesaurus_id varchar(30) not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mshinthesid primary key (rxaui, thesaurus_id)
);
comment on table msh_in_thes_id is 'MeSH ingredient thesaurus id';
create index ix_mshinthesid_in on msh_in_thes_id(in_rxcui);

create table atc_in_level (
  rxaui varchar(12) not null,
  level smallint not null,
  code varchar(10) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_inatclvl primary key (rxaui)
);
comment on table atc_in_level is 'ATC ingredient level';
create index ix_atcinlvl_in on atc_in_level(in_rxcui);

create table mmsl_in_sup_cat (
  rxaui varchar(12) not null,
  sup_cat varchar(50) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_mmslinsupcat primary key (rxaui, sup_cat)
);
comment on table mmsl_in_sup_cat is 'MMSL ingredient supply category';
create index ix_mmslinsupcat_in on mmsl_in_sup_cat(in_rxcui);

create table src_in_dcsa (
  rxaui varchar(12) not null,
  designation varchar(100) not null,
  sab varchar(11) not null,
  src_code varchar(50) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_srcindcsa primary key (rxaui, designation)
)
;
comment on table src_in_dcsa is 'ingredient Controlled Substance Act designation code';
create index ix_srcindcsa_in on src_in_dcsa (in_rxcui);

create table src_in_dpc (
  rxaui varchar(12) not null,
  dpc char(1) not null,
  sab varchar(11) not null,
  src_code varchar(50) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_srcindpc primary key (rxaui)
);
comment on table src_in_dpc is 'ingredient Multum pregnancy hazard classification, multi-source';
create index ix_srcindpc_dpc on src_in_dpc (dpc);
create index ix_srcindpc_in on src_in_dpc(in_rxcui);

create table src_in_scope_stmt (
  rxaui varchar(12) not null,
  scope_statement text not null,
  sab varchar(11) not null,
  src_code varchar(50) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_srcinscopestmt primary key (rxaui)
);
comment on table src_in_scope_stmt is 'ingredient scope statement';
create index ix_srcinscopestmt_in on src_in_scope_stmt (in_rxcui);

create table drugbank_in_unii (
  rxaui varchar(12) not null,
  unii varchar(10) not null,
  code varchar(7) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_dbinunii primary key (rxaui)
);
comment on table drugbank_in_unii is 'DrugBank ingredient UNII';
create index ix_dbinunii_in on drugbank_in_unii (in_rxcui);

create table drugbank_in_sec_go_id (
  rxaui varchar(12) not null,
  sec_go_id varchar(30) not null,
  code varchar(7) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_dbinsecgoid primary key (rxaui, sec_go_id)
);
comment on table drugbank_in_sec_go_id is 'DrugBank ingredient secondary GO ID';
create index ix_dbinsecgoid_in on drugbank_in_sec_go_id (in_rxcui);

create table vandf_in_exclude_di (
  rxaui varchar(12) not null,
  exclude_check boolean not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_vandfexcludedi primary key (rxaui)
);
comment on table vandf_in_exclude_di is 'VANDF ingredient exclude drug interaction check';
create index ix_vandfexcludedi_in on vandf_in_exclude_di(in_rxcui);

create table vandf_in_prod_src_mult (
  rxaui varchar(12) not null,
  src_mult varchar(20) not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_vandfinprodsrcmult primary key (rxaui)
);
comment on table vandf_in_prod_src_mult is 'VANDF ingredient product source multiplicity';
create index ix_vandfinprodsrcmult_in on vandf_in_prod_src_mult (in_rxcui);

create table vandf_in_nf_ind (
  rxaui varchar(12) not null,
  nf_ind boolean not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_vandfinnfind primary key (rxaui)
);
comment on table vandf_in_nf_ind is 'VANDF ingredient national formulary indicator';
create index ix_vandfinnfind_ind on vandf_in_nf_ind (in_rxcui);

create table vandf_in_nf_inact (
  rxaui varchar(12) not null,
  inactivated date not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_vandfinnfinact primary key (rxaui)
);
comment on table vandf_in_nf_inact is 'VANDF ingredient national formulary inactivation date';
create index ix_vandfinnfinact_in on vandf_in_nf_inact (in_rxcui);

create table vandf_in_nf_name (
  rxaui varchar(12) not null,
  name varchar(500) not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_vandfinnfname primary key (rxaui)
);
comment on table vandf_in_nf_name is 'VANDF ingredient national formulary name';
create index ix_vandfinnfname_in on vandf_in_nf_name(in_rxcui);

create table vandf_in_ndfht_class (
  rxaui varchar(12) not null,
  ndfht_class varchar(100) not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_vandfinndfhtclass primary key (rxaui)
);
comment on table vandf_in_ndfht_class is 'VANDF ingredient NDF/HT class';
create index ix_vandfinndfhtclass_in on vandf_in_ndfht_class (in_rxcui);

create table vandf_in_va_class (
  rxaui varchar(12) not null,
  va_class varchar(100) not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_vandfinnvaclass primary key (rxaui)
);
comment on table vandf_in_va_class is 'VANDF ingredient VA class';
create index ix_vandfinnvaclass_in on vandf_in_va_class (in_rxcui);

create table vandf_in_va_dspun (
  rxaui varchar(12) not null,
  dispense_unit varchar(100) not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_vandfinvadspun primary key (rxaui)
);
comment on table vandf_in_va_dspun is 'VANDF ingredient VA dispense unit';
create index ix_vandfinvadspun_in on vandf_in_va_dspun (in_rxcui);

create table vandf_in_gname (
  rxaui varchar(12) not null,
  generic_name varchar(100) not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_vandfingname primary key (rxaui)
);
comment on table vandf_in_gname is 'VANDF ingredient generic name';
create index ix_vandfingname_in on vandf_in_gname (in_rxcui);

create table vandf_in_cmopid (
  rxaui varchar(12) not null,
  cmop_id varchar(30) not null,
  code varchar(30) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_vandfincmopid primary key (rxaui)
);
comment on table vandf_in_cmopid is 'VANDF ingredient CMOP ID';
create index ix_vandfincmopid_in on vandf_in_cmopid (in_rxcui);

create table usp_in_monog_date (
  rxaui varchar(12) not null,
  official_date date not null,
  code varchar(10) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_uspinmonogdate primary key (rxaui)
);
comment on table usp_in_monog_date is 'USP official monograph date';
create index ix_uspinmonogdate_in on usp_in_monog_date(in_rxcui);

create table usp_in_monog_stat (
  rxaui varchar(12) not null,
  status varchar(50) not null,
  code varchar(10) not null,
  in_rxcui varchar(12) not null references "in",
  constraint pk_uspinmonogstat primary key (rxaui)
);
comment on table usp_in_monog_stat is 'USP official monograph status';
create index ix_uspinmonogstat_in on usp_in_monog_stat(in_rxcui);

create table pin_src_form_of (
  pin_rxcui varchar(12) not null references pin,
  src varchar(11) not null,
  form_of_tty varchar(11) not null,
  form_of_rxaui varchar(12) not null,
  form_of_rxcui varchar(12) not null,
  form_of_name text not null,
  form_of_code varchar(30) not null,
  form_of_suppress varchar(1) not null,
  constraint pk_pinsrcformof primary key (pin_rxcui, src, form_of_rxaui)
);
comment on table pin_src_form_of is 'precise ingredient source form of';

create table pin_src_part_of (
  pin_rxcui varchar(12) not null references pin,
  src varchar(11) not null,
  part_of_tty varchar(11) not null,
  part_of_rxaui varchar(12) not null,
  part_of_rxcui varchar(12) not null,
  part_of_name text not null,
  part_of_code varchar(30) not null,
  part_of_suppress varchar(1) not null,
  constraint pk_pinsrcpartof primary key (pin_rxcui, src, part_of_rxaui)
);
comment on table pin_src_part_of is 'precise ingredient source part of';

create table pin_src_pin_of (
  pin_rxcui varchar(12) not null references pin,
  src varchar(11) not null,
  pin_of_tty varchar(11) not null,
  pin_of_rxaui varchar(12) not null,
  pin_of_rxcui varchar(12) not null,
  pin_of_name text not null,
  pin_of_code varchar(30) not null,
  pin_of_suppress varchar(1) not null,
  constraint pk_pinsrcpinof primary key (pin_rxcui, src, pin_of_rxaui)
);
comment on table pin_src_pin_of is 'precise ingredient source precise ingredient of';





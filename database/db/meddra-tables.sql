set search_path to meddra;

create table soc_term
(
  soc_code   int not null,
  soc_name   varchar(100) not null,
  soc_abbrev varchar(5)   not null,
  constraint pk_soc primary key (soc_code)
);

create unique index ix_soc_name
  on soc_term (soc_name);

create table high_level_grouping_term
(
  hlgt_code int not null,
  hlgt_name varchar(100) not null,
  constraint pk_hlgt
    primary key (hlgt_code)
);

create unique index ix_hlgt_name
  on high_level_grouping_term (hlgt_name);

create table soc_hlgt
(
  soc_code  int not null,
  hlgt_code int not null,
  constraint pk_sochlgt
    primary key (soc_code, hlgt_code),
  constraint fk_sochlgt_hlgt
    foreign key (hlgt_code) references high_level_grouping_term,
  constraint fk_sochlgt_soc
    foreign key (soc_code) references soc_term
);

create index ix_sochlght_hlgtsoc
  on soc_hlgt (hlgt_code, soc_code);

create table high_level_term
(
  hlt_code int not null,
  hlt_name varchar(100) not null,
  constraint pk_hlt
    primary key (hlt_code)
);

create index ix_hlt_name
  on high_level_term (hlt_name);

create table hlgt_hlt
(
  hlgt_code int not null,
  hlt_code  int not null,
  constraint pk_hlgthlt
    primary key (hlgt_code, hlt_code),
  constraint fk_hlgthlt_hlgt
    foreign key (hlgt_code) references high_level_grouping_term,
  constraint fk_hlgthlt_hlt
    foreign key (hlt_code) references high_level_term
);

create index ix_hlgthlt_hlthlgt
  on hlgt_hlt (hlt_code, hlgt_code);

create table preferred_term
(
  pt_code     int not null,
  pt_name     varchar(100) not null,
  pt_soc_code int,
  constraint pk_pt
    primary key (pt_code),
  constraint fk_pt_soc
    foreign key (pt_soc_code) references soc_term
);

create index ix_pt_name
  on preferred_term (pt_name);

create index ix_pt_soccode
  on preferred_term (pt_soc_code);

create table hlt_pt
(
  hlt_code int not null,
  pt_code  int not null,
  constraint pk_hltpcomp
    primary key (hlt_code, pt_code),
  constraint fk_hltprefcomp_hlt
    foreign key (hlt_code) references high_level_term,
  constraint fk_hltprefcomp_pt
    foreign key (pt_code) references preferred_term
);

create index ix_hltpt_pthlt
  on hlt_pt (pt_code, hlt_code);

create table low_level_term
(
  llt_code     int not null,
  llt_name     varchar(100) not null,
  pt_code      int not null,
  llt_currency varchar(1) not null check(llt_currency in ('Y','N')),
  constraint pk_llt
    primary key (llt_code),
  constraint fk_llt_pt
    foreign key (pt_code) references preferred_term
);

create index ix_llt_name
  on low_level_term (llt_name);

create index ix_llt_ptcode
  on low_level_term (pt_code);

create table soc_intl_order
(
  intl_ord_code int not null,
  soc_code      int not null,
  constraint pk_socintlorder
    primary key (intl_ord_code, soc_code)
);

create index ix_socintlorder_ordsoc
  on soc_intl_order (soc_code, intl_ord_code);

create table meddra_hierarchy
(
  pt_code        int       not null,
  hlt_code       int       not null,
  hlgt_code      int       not null,
  soc_code       int       not null,
  pt_name        varchar(100) not null,
  hlt_name       varchar(100) not null,
  hlgt_name      varchar(100) not null,
  soc_name       varchar(100) not null,
  soc_abbrev     varchar(5)   not null,
  pt_soc_code    int,
  primary_soc_fg varchar(1),
  constraint pk_meddrahier primary key (pt_code, hlt_code, hlgt_code, soc_code),
  constraint fk_medrahier_hlgt
    foreign key (hlgt_code) references high_level_grouping_term,
  constraint fk_medrahier_hlt
    foreign key (hlt_code) references high_level_term,
  constraint fk_medrahier_pt
    foreign key (pt_code) references preferred_term,
  constraint fk_medrahier_soc
    foreign key (soc_code) references soc_term
);

create index ix_mdhier_hlt
  on meddra_hierarchy (hlt_code);

create index ix_mdhier_hlgt
  on meddra_hierarchy (hlgt_code);

create index ix_mdhier_soc
  on meddra_hierarchy (soc_code);

create index ix_mdhier_ptnm
  on meddra_hierarchy (pt_name);

create index ix_mdhier_hltnm
  on meddra_hierarchy (hlt_name);

create index ix_mdhier_hlgtnm
  on meddra_hierarchy (hlgt_name);

create index ix_mdhier_socnm
  on meddra_hierarchy (soc_name);

create table smq_list
(
  smq_code        int        not null,
  smq_name        varchar(100)  not null,
  smq_level       int        not null,
  smq_description varchar(4000) not null,
  smq_source      varchar(4000),
  smq_note        varchar(4000),
  meddra_version  varchar(5)    not null,
  status          varchar(1)    not null,
  smq_algorithm   varchar(256)  not null,
  constraint pk_smqlist
    primary key (smq_code)
);

create table smq_content
(
  smq_code                   int     not null,
  term_code                  int     not null,
  term_level                 int     not null,
  term_scope                 int     not null,
  term_category              varchar(1) not null,
  term_weight                int     not null,
  term_status                varchar(1) not null,
  term_addition_version      varchar(5) not null,
  term_last_modified_version varchar(5) not null,
  constraint pk_smqcontent
    primary key (smq_code, term_code),
  constraint fk_smqcontent_smq
    foreign key (smq_code) references smq_list
);

create index ix_smqcontent_termcode
  on smq_content (term_code);
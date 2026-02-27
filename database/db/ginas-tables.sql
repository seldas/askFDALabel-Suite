set search_path to ginas;

create table substance (
  unii varchar(10) not null constraint pk_substance primary key,
  pt text not null,
  rn text,
  ec text,
  ncit text,
  rxcui text,
  pubchem numeric,
  itis numeric,
  ncbi text,
  plants text,
  grin numeric,
  mpns text,
  inn_id numeric,
  usan_id text,
  mf text,
  inchikey text,
  smiles text,
  ingredient_type text not null,
  uuid uuid not null,
  substance_type text
);
set search_path to medrt;

create table concept (
  nui varchar(11) not null constraint pk_concept primary key,
  type varchar(3) not null,
  name text not null
);

create table concept_synonym (
  nui varchar(11) not null,
  syn text not null,
  constraint pk_conceptsynonym primary key (nui, syn)
);

create table concept_parent (
  nui varchar(11) not null,
  parent_nui varchar(11) not null,
  constraint pk_conceptparent primary key (nui, parent_nui), -- multiple parents of a single nui are allowed
  constraint fk_conceptparent_nui foreign key (nui) references concept,
  constraint fk_conceptparent_parentnui foreign key (parent_nui) references concept
);
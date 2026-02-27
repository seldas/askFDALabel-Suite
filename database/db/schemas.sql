create schema spl authorization splmonger;
create schema meddra authorization splmonger;
create schema ginas authorization splmonger;
create schema medrt authorization splmonger;
create schema rxnorig authorization splmonger;
create schema rxnrel authorization splmonger;

alter role splmonger set search_path to spl, meddra, ginas, medrt, rxnrel;

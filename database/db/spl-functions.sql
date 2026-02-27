set search_path to spl;

create function act_ingr_uniis_set(p_setId uuid, p_prodNum int) returns varchar(10)[] as
$body$
select array_agg(distinct ai.unii order by ai.unii)
from act_ingr ai
where ai.set_id = p_setId and ai.prod_num = p_prodNum
$body$ language sql
;

create function act_ingr_unii_names_set(p_setId uuid, p_prodNum int) returns varchar(10)[] as
$body$
select array_agg(distinct ai.name order by ai.name)
from act_ingr ai
where ai.set_id = p_setId and ai.prod_num = p_prodNum
$body$ language sql
;

create function act_ingr_moeity_uniis_set(p_setId uuid, p_prodNum int) returns varchar(10)[] as
$body$
select array_agg(distinct am.unii order by am.unii)
from act_ingr ai
join act_moiety am on am.act_ingr_id = ai.id
where ai.set_id = p_setId and ai.prod_num = p_prodNum
$body$ language sql
;

create function act_ingr_moeity_names_set(p_setId uuid, p_prodNum int) returns varchar(10)[] as
$body$
select array_agg(distinct am.name order by am.name)
from act_ingr ai
join act_moiety am on am.act_ingr_id = ai.id
where ai.set_id = p_setId and ai.prod_num = p_prodNum
$body$ language sql
;

create function prod_names(p_setId uuid) returns text[] as
$body$
select array_agg(distinct p.name order by p.name)
from prod p
where p.set_id = p_setId
$body$ language sql
;

create function prod_gen_names(p_setId uuid) returns text[] as
$body$
select array_agg(distinct p.gen_name order by p.gen_name)
from prod p
where p.set_id = p_setId
$body$ language sql
;

-- Return an array of active ingredients with strengths for given spl set id and (doc-order) product number.
create function splprod_act_ingrs_jsonarray(p_setId uuid, p_prodNum int) returns json as
$body$
select
  json_arrayagg(json_build_object(
    'unii', ai.unii,
    'numer_val', q.numer_val,
    'numer_unit', q.numer_unit,
    'denom_val', q.denom_val,
    'denom_unit', q.denom_unit
  ))
from act_ingr ai
join ingr_qty q on ai.qty_id = q.id
where ai.set_id = p_setId and ai.prod_num = p_prodNum
$body$ language sql
;

-- Return an array of active ingredients with strengths for given spl set id and two-part NDC.
create function splndc2_act_ingrs_jsonarray(p_setId uuid, p_ndc2 varchar) returns json as
$body$
select
  json_arrayagg(json_build_object(
    'unii', ai.unii,
    'numer_val', q.numer_val,
    'numer_unit', q.numer_unit,
    'denom_val', q.denom_val,
    'denom_unit', q.denom_unit
  ))
from act_ingr ai
join prod p on ai.set_id = p.set_id and ai.prod_num = p.prod_num
join ingr_qty q on ai.qty_id = q.id
where ai.set_id = p_setId and p.ndc2 = p_ndc2
$body$ language sql
;

-- Return an array of active ingredients with strengths and containing spl set id and product number for the given two-part NDC.
create function ndc2_act_ingrs_jsonarray(p_ndc2 varchar) returns json as
$body$
select
  json_arrayagg(json_build_object(
    'set_id', p.set_id,
    'prod_num', p.prod_num,
    'unii', ai.unii,
    'numer_val', q.numer_val,
    'numer_unit', q.numer_unit,
    'denom_val', q.denom_val,
    'denom_unit', q.denom_unit
  ) order by p.set_id, p.prod_num)
from act_ingr ai
join prod p on ai.set_id = p.set_id and ai.prod_num = p.prod_num
join ingr_qty q on ai.qty_id = q.id
where p.ndc2 = p_ndc2
$body$ language sql
;

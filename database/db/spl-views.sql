set search_path to spl;

create or replace view prod_act_ingrs_array_v as
select p.set_id, p.prod_num, act_ingr_uniis_set(p.set_id, p.prod_num) act_ingrs
from prod p
;

create view spl_pkg_ndc_v as
select
  psn.set_id,
  psn.ndc3,
  (lni.indexing_set_id is not null and
   (lni.eff_date_low is null or current_date >= lni.eff_date_low) and
   (lni.eff_date_high is null or current_date <= lni.eff_date_high)) inactive,
   lni.eff_date_low inactive_from_date,
   lni.eff_date_high inactive_to_date
from (select distinct set_id, ndc3 from pkg where ndc3 is not null) psn
left join spl_ndc_inact lni on lni.spl_set_id = psn.set_id and lni.ndc3 = psn.ndc3
;

create view spl_pkg_ndcs_v as
select
  set_id,
  jsonb_agg(ndc3 || case when inactive then '*' else '' end) pkg_ndcs
from spl_pkg_ndc_v
group by set_id
;

-- Package and product marketing statuses and FDA inactivation information for packages having a marketing status (pkg_mkt_stat).
create view pkg_statuses_v as
select
  pkg.set_id spl_set_id,
  (select loinc_name from doc_type where loinc_code = l.type_code) spl_type,
  pkg.prod_num,
  p.name prod_name,
  p.ndc2 prod_ndc2,
  p.appl_code prod_appl_code,
  prdms.status_code prod_status,
  prdms.eff_date_low prod_status_date_low,
  prdms.eff_date_high prod_status_date_high,
  pkg.ndc3 pkg_ndc3,
  mst.spl_term pkg_status_type,
  pkgms.status_code pkg_status,
  pkgms.eff_date_low pkg_status_date_low,
  pkgms.eff_date_high pkg_status_date_high,
  pndc.inactive fda_flagged_inactive,
  pndc.inactive_from_date,
  pndc.inactive_to_date
from pkg_mkt_stat pkgms
join pkg on pkgms.pkg_id = pkg.id
join pkg_type pt on pkg.type_code = pt.ncit_code
join mkt_stat_type mst on mst.ncit_code = pkgms.status_type_code
join prod_mkt_stat prdms on prdms.set_id = pkg.set_id and prdms.prod_num = pkg.prod_num
join prod p on p.set_id = prdms.set_id and p.prod_num = prdms.prod_num
join spl l on pkg.set_id = l.set_id
left join spl_pkg_ndc_v pndc on pkg.set_id = pndc.set_id and pkg.ndc3 = pndc.ndc3
where pkg.ndc3 is not null
;

create view spl_products_json_v as
select
  l.set_id,
  jsonb_build_object(
    'splSetId', l.set_id,
    'effectiveDate', to_char(eff_date, 'YYYY-MM-DD'),
    'version', l.version,
    'splType', dt."splType",
    'products', (
      select
        coalesce(jsonb_agg(jsonb_build_object(
          'productDocOrder', p.prod_num,
          'ndc2', p."ndc2",
          'name', p.name,
          'genericName', p.gen_name,
          'equivalentNdc', p.equiv_ndc,
          'applicationCode', p.appl_code,
          'marketingCategory', mc."marketingCategory",
          'deaSchedule', ds."deaSchedule",
          'doseForm', f."doseForm",
          'marketingStatus', (
            select
              jsonb_build_object(
                'status', pms.status_code,
                'fromDate', to_char(eff_date_low, 'YYYY-MM-DD'),
                'toDate', to_char(eff_date_high, 'YYYY-MM-DD'),
                'statusType', mst."statusType"
              ) json
            from
              spl.prod_mkt_stat pms
              -- parent table 'mkt_stat_type', joined for inlined fields
              left join (
                select
                  mst.ncit_code as "_ncit_code",
                  mst.spl_term "statusType"
                from
                  spl.mkt_stat_type mst
              ) mst on pms.status_type_code = mst."_ncit_code"
            where (
              p.set_id = pms.set_id and p.prod_num = pms.prod_num
            )
          ),
          'routesOfAdministration', (
            select
              coalesce(jsonb_agg(r."splTerm"),'[]'::jsonb) json
            from
              spl.prod_route pr
              -- parent table 'route', joined for inlined fields
              left join (
                select
                  r.ncit_code as "_ncit_code",
                  r.spl_term "splTerm"
                from
                  spl.route r
              ) r on pr.route_code = r."_ncit_code"
            where (
              pr.set_id = p.set_id and pr.prod_num = p.prod_num
            )
          ),
          'productCharacteristics', (
            select
              coalesce(jsonb_agg(jsonb_build_object(
                'charCode', pc.char_code,
                'valType', pc.val_type,
                'valText', pc.val_text,
                'classCode', pc.class_code
              )),'[]'::jsonb) json
            from
              spl.prod_char pc
            where (
              pc.set_id = p.set_id and pc.prod_num = p.prod_num
            )
          ),
          'cfrReferences', (
            select
              coalesce(jsonb_agg(pcr.cfr_ref),'[]'::jsonb) json
            from
              spl.prod_cfr_ref pcr
            where (
              pcr.set_id = p.set_id and pcr.prod_num = p.prod_num
            )
          ),
          'activeIngredients', (
            select
              coalesce(jsonb_agg(jsonb_build_object(
                'unii', ai.unii,
                'name', ai.name,
                'classCode', ai.class_code,
                'quantity', (
                  select
                    jsonb_build_object(
                      'numerVal', iq.numer_val,
                      'numerUnit', iq.numer_unit,
                      'numerTransCode', iq.numer_trans_code,
                      'numerTransName', iq.numer_trans_name,
                      'denomVal', iq.denom_val,
                      'denomUnit', iq.denom_unit,
                      'denomTransCode', iq.denom_trans_code,
                      'denomTransName', iq.denom_trans_name
                    ) json
                  from
                    spl.ingr_qty iq
                  where (
                    ai.qty_id = iq.id
                  )
                ),
                'activeMoieties', (
                  select
                    coalesce(jsonb_agg(jsonb_build_object(
                      'unii', am.unii,
                      'name', am.name
                    )),'[]'::jsonb) json
                  from
                    spl.act_moiety am
                  where (
                    am.act_ingr_id = ai.id
                  )
                ),
                'equivalentSubstances', (
                  select
                    coalesce(jsonb_agg(jsonb_build_object(
                      'unii', aies.equiv_unii,
                      'name', aies.equiv_subs_name
                    )),'[]'::jsonb) json
                  from
                    spl.act_ingr_equiv_subs aies
                  where (
                    aies.act_ingr_id = ai.id
                  )
                )
              )),'[]'::jsonb) json
            from
              spl.act_ingr ai
            where (
              ai.set_id = p.set_id and ai.prod_num = p.prod_num
            )
          ),
          'inactiveIngredients', (
            select
              coalesce(jsonb_agg(jsonb_build_object(
                'unii', ii.unii,
                'name', ii.name,
                'classCode', ii.class_code,
                'quantity', (
                  select
                    jsonb_build_object(
                      'numerVal', iq.numer_val,
                      'numerUnit', iq.numer_unit,
                      'numerTransCode', iq.numer_trans_code,
                      'numerTransName', iq.numer_trans_name,
                      'denomVal', iq.denom_val,
                      'denomUnit', iq.denom_unit,
                      'denomTransCode', iq.denom_trans_code,
                      'denomTransName', iq.denom_trans_name
                    ) json
                  from
                    spl.ingr_qty iq
                  where (
                    ii.qty_id = iq.id
                  )
                )
              )),'[]'::jsonb) json
            from
              spl.inact_ingr ii
            where (
              ii.set_id = p.set_id and ii.prod_num = p.prod_num
            )
          ),
          'packagings', (
            select
              coalesce(jsonb_agg(jsonb_build_object(
                'packagingId', pkg.id,
                'parentPackagingId', pkg.parent_pkg_id,
                'ndc3', pkg."ndc3",
                'packagingType', pt."packagingType",
                'quantity', (
                  select
                    jsonb_build_object(
                      'numerVal', pq.numer_val,
                      'numerUnit', pq.numer_unit,
                      'numerTransCode', pq.numer_trans_code,
                      'numerTransName', pq.numer_trans_name,
                      'denomVal', pq.denom_val,
                      'denomUnit', pq.denom_unit,
                      'denomTransCode', pq.denom_trans_code,
                      'denomTransName', pq.denom_trans_name
                    ) json
                  from
                    spl.pkg_qty pq
                  where (
                    pkg.qty_id = pq.id
                  )
                ),
                'marketingStatus', (
                  select
                    jsonb_build_object(
                      'status', pms.status_code,
                      'fromDate', to_char(eff_date_low, 'YYYY-MM-DD'),
                      'toDate', to_char(eff_date_high, 'YYYY-MM-DD'),
                      'statusType', mst."statusType"
                    ) json
                  from
                    spl.pkg_mkt_stat pms
                    -- parent table 'mkt_stat_type', joined for inlined fields
                    left join (
                      select
                        mst.ncit_code as "_ncit_code",
                        mst.spl_term "statusType"
                      from
                        spl.mkt_stat_type mst
                    ) mst on pms.status_type_code = mst."_ncit_code"
                  where (
                    pkg.id = pms.pkg_id
                  )
                ),
                'packagingCharacteristics', (
                  select
                    coalesce(jsonb_agg(jsonb_build_object(
                      'charCode', pc.char_code,
                      'valType', pc.val_type,
                      'valText', pc.val_text,
                      'classCode', pc.class_code
                    )),'[]'::jsonb) json
                  from
                    spl.pkg_char pc
                  where (
                    pc.pkg_id = pkg.id
                  )
                )
              ) order by pkg.pkg_num),'[]'::jsonb) json
            from
              spl.pkg pkg
              -- parent table 'pkg_type', joined for inlined fields
              left join (
                select
                  pt.ncit_code as "_ncit_code",
                  pt.spl_term "packagingType"
                from
                  spl.pkg_type pt
              ) pt on pkg.type_code = pt."_ncit_code"
            where (
              pkg.set_id = p.set_id and pkg.prod_num = p.prod_num
            )
          )
        ) order by p.prod_num),'[]'::jsonb) json
      from
        spl.prod p
        -- parent table 'mkt_cat', joined for inlined fields
        left join (
          select
            mc.ncit_code as "_ncit_code",
            mc.spl_term "marketingCategory"
          from
            spl.mkt_cat mc
        ) mc on p.mkt_cat_code = mc."_ncit_code"
        -- parent table 'dea_sched', joined for inlined fields
        left join (
          select
            ds.ncit_code as "_ncit_code",
            ds.spl_term "deaSchedule"
          from
            spl.dea_sched ds
        ) ds on p.dea_code = ds."_ncit_code"
        -- parent table 'form', joined for inlined fields
        left join (
          select
            f.ncit_code as "_ncit_code",
            f.spl_term "doseForm"
          from
            spl.form f
        ) f on p.form_code = f."_ncit_code"
      where (
        p.set_id = l.set_id
      )
    ),
    'inactivations', (
      select
        coalesce(jsonb_agg(jsonb_build_object(
          'ndc3', sni."ndc3",
          'from_date', sni.eff_date_low
        )),'[]'::jsonb) json
      from
        spl.spl_ndc_inact sni
      where (
        sni.spl_set_id = l.set_id and
        (sni.eff_date_high is null)
      )
    )
  ) json
from
  spl.spl l
  -- parent table 'doc_type', joined for inlined fields
  left join (
    select
      dt.loinc_code as "_loinc_code",
      dt.loinc_name "splType"
    from
      spl.doc_type dt
  ) dt on l.type_code = dt."_loinc_code"
;

create view spl_sec_meddra_llt_occ_v as
select
  tocc.set_id spl_set_id,
  (select coalesce(string_agg(p.name, '|' order by p.prod_num), '')
   from prod p
   where p.set_id = tocc.set_id)  product_names,
  (select coalesce(string_agg(p.ndc2, '|' order by p.prod_num), '')
   from prod p
   where p.set_id = tocc.set_id) product_ndcs,
  st.loinc_name section,
  tocc.llt_code occurring_llt_code,
  llt.llt_name occurring_llt,
  llt.pt_code,
  pt.pt_name pt,
  count(*) occurrences
from spl_sec_meddra_llt_occ tocc
join sec_type st on st.loinc_code = tocc.sec_type_code
join meddra.low_level_term llt on llt.llt_code = tocc.llt_code
join meddra.preferred_term pt on pt.pt_code = llt.pt_code
group by tocc.set_id, st.loinc_name, tocc.llt_code, llt.llt_name, llt.pt_code, pt.pt_name
order by tocc.set_id, st.loinc_name, llt.llt_name
;

create materialized view sec_tsvec_mv as
select sf.set_id, sf.sec_num, to_tsvector(string_agg(sf.text, '¶π¶' order by sf.frg_num)) sec_text_tsvec
from sec_frg sf
group by sf.set_id, sf.sec_num
;
create index ix_sectxtmv_setid_secnum on sec_tsvec_mv (set_id, sec_num);
create index ix_sectxtmv_text on sec_tsvec_mv using gin (sec_text_tsvec);


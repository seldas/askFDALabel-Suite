when using PROD, it always looks for 8842 as the backend port even if in the .env it sets to other like 8849; 
In dev:all it works all good. (solved?)

the config.ts in search_v2 always points to oracle version, so will return error (like DRUGLABEL.SPL_SEC was not found) in local db search. (solved?)

 
during a last update we added favorite.active_ingredients? in new env it returns this error:
[1] sqlalchemy.exc.OperationalError: (sqlite3.OperationalError) no such column: favorite.active_ingredients
[1] [SQL: SELECT favorite.id AS favorite_id, favorite.user_id AS favorite_user_id, favorite.project_id AS favorite_project_id, favorite.set_id AS favorite_set_id, favorite.brand_name AS favorite_brand_name, favorite.generic_name AS favorite_generic_name, favorite.manufacturer_name AS favorite_manufacturer_name, favorite.market_category AS favorite_market_category, favorite.application_number AS favorite_application_number, favorite.ndc AS favorite_ndc, favorite.effective_time AS favorite_effective_time, favorite.active_ingredients AS favorite_active_ingredients, favorite.labeling_type AS favorite_labeling_type, favorite.dosage_forms AS favorite_dosage_forms, favorite.routes AS favorite_routes, favorite.epc AS favorite_epc, favorite.fdalabel_link AS favorite_fdalabel_link, favorite.dailymed_spl_link AS favorite_dailymed_spl_link, favorite.dailymed_pdf_link AS favorite_dailymed_pdf_link, favorite.product_type AS favorite_product_type, favorite.label_format AS favorite_label_format, favorite.source AS favorite_source, favorite.timestamp AS favorite_timestamp 
[1] FROM favorite 
[1] WHERE ? = favorite.project_id]
[1] [parameters: (1,)]

[1] sqlalchemy.exc.OperationalError: (sqlite3.OperationalError) no such column: favorite.active_ingredients
[1] [SQL: SELECT favorite.id AS favorite_id, favorite.user_id AS favorite_user_id, favorite.project_id AS favorite_project_id, favorite.set_id AS favorite_set_id, favorite.brand_name AS favorite_brand_name, favorite.generic_name AS favorite_generic_name, favorite.manufacturer_name AS favorite_manufacturer_name, favorite.market_category AS favorite_market_category, favorite.application_number AS favorite_application_number, favorite.ndc AS favorite_ndc, favorite.effective_time AS favorite_effective_time, favorite.active_ingredients AS favorite_active_ingredients, favorite.labeling_type AS favorite_labeling_type, favorite.dosage_forms AS favorite_dosage_forms, favorite.routes AS favorite_routes, favorite.epc AS favorite_epc, favorite.fdalabel_link AS favorite_fdalabel_link, favorite.dailymed_spl_link AS favorite_dailymed_spl_link, favorite.dailymed_pdf_link AS favorite_dailymed_pdf_link, favorite.product_type AS favorite_product_type, favorite.label_format AS favorite_label_format, favorite.source AS favorite_source, favorite.timestamp AS favorite_timestamp 
[1] FROM favorite 
[1] WHERE favorite.set_id = ? AND favorite.project_id = ?
[1]  LIMIT ? OFFSET ?]
[1] [parameters: ('01e46f58-8bda-4ff3-ab21-57d5b540d440', 5, 1, 0)]
[1] (Background on this error at: https://sqlalche.me/e/20/e3q8)

for discrepancy panel, add a new tag of "RLD available" along with FILTER BY SEVERITY GAP
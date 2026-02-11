from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
import os
from pathlib import Path
from sqlalchemy import create_engine, text

app = FastAPI(title="askDrugTox API")

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://ncshpcgpu01:8842",
        "http://localhost:8842",  # optional for local dev
    ],
    allow_credentials=False,   # set True ONLY if you use cookies/auth
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database Configuration
BACKEND_DIR = Path(__file__).resolve().parent        # .../backend
PROJECT_DIR = BACKEND_DIR.parent                    # .../askDrugTox_db
DEFAULT_DB_PATH = (PROJECT_DIR / "data" / "drugtox.db").resolve()


DB_PATH = Path(os.environ.get("DRUGTOX_DB_PATH", str(DEFAULT_DB_PATH))).resolve()
print(f"[startup] SQLite DB path: {DB_PATH}")

DB_URL = f"sqlite:///{DB_PATH}"  # absolute path
engine = create_engine(DB_URL, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

@app.on_event("startup")
def startup_db_check():
    print(f"[startup] SQLite DB path: {DB_PATH}")

    if not DB_PATH.exists():
        raise RuntimeError(f"[startup] Database file not found: {DB_PATH}")

    with engine.connect() as conn:
        # Optional: confirm table exists
        table_ok = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='drug_toxicity'")
        ).fetchone()
        if not table_ok:
            raise RuntimeError("[startup] Table 'drug_toxicity' not found in this database.")

        # Print row count
        count = conn.execute(text("SELECT COUNT(*) FROM drug_toxicity")).scalar_one()
        print(f"[startup] drug_toxicity row count: {count}")

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/")
def read_root():
    return {"message": "Welcome to askDrugTox API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.get("/drugs")
def get_drugs(q: str = None, tox_type: str = None, show_historical: bool = False, changed_only: bool = False, page: int = 1, limit: int = 20, db: Session = Depends(get_db)):
    offset = (page - 1) * limit
    
    base_query = "FROM drug_toxicity"
    params = {"limit": limit, "offset": offset}
    
    conditions = []
    if not show_historical:
        conditions.append("is_historical = 0")
        
    if changed_only:
        conditions.append("Changed = 'Yes'")
        
    if q:
        conditions.append("(Trade_Name LIKE :q OR Generic_Proper_Names LIKE :q)")
        params["q"] = f"%{q}%"
    
    if tox_type:
        conditions.append("Tox_Type = :tox_type")
        params["tox_type"] = tox_type

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

    # Get total count for pagination
    count_result = db.execute(text(f"SELECT COUNT(*) {base_query} {where_clause}"), params)
    total_count = count_result.scalar()

    # Get paginated data
    query = text(f"SELECT SETID, Trade_Name, Generic_Proper_Names, Toxicity_Class, Author_Organization, Tox_Type, SPL_Effective_Time, Changed, is_historical {base_query} {where_clause} ORDER BY SPL_Effective_Time DESC LIMIT :limit OFFSET :offset")
    result = db.execute(query, params)
    
    drugs = [dict(row._mapping) for row in result]
    return {
        "items": drugs,
        "total": total_count,
        "page": page,
        "limit": limit
    }

@app.get("/stats")
def get_stats(tox_type: str = None, db: Session = Depends(get_db)):
    # Distribution of Toxicity Classes
    where_clause = "WHERE is_historical = 0"
    params = {}
    if tox_type:
        where_clause += " AND Tox_Type = :tox"
        params["tox"] = tox_type
        
    query = text(f"SELECT Toxicity_Class, COUNT(*) as count FROM drug_toxicity {where_clause} GROUP BY Toxicity_Class")
    result = db.execute(query, params)
    distribution = [dict(row._mapping) for row in result]
    
    # Total changes in the current dataset
    change_query = text(f"SELECT COUNT(*) FROM drug_toxicity {where_clause} AND Changed = 'Yes'")
    total_changes = db.execute(change_query, params).scalar()
    
    return {
        "distribution": distribution,
        "total_changes": total_changes
    }

@app.get("/companies/{company_name}/stats")
def get_company_stats(company_name: str, tox_type: str = None, db: Session = Depends(get_db)):
    where_clause = "WHERE is_historical = 0 AND Author_Organization = :company"
    params = {"company": company_name}
    if tox_type:
        where_clause += " AND Tox_Type = :tox"
        params["tox"] = tox_type
        
    query = text(f"SELECT Toxicity_Class, COUNT(*) as count FROM drug_toxicity {where_clause} GROUP BY Toxicity_Class")
    result = db.execute(query, params)
    distribution = [dict(row._mapping) for row in result]
    
    total_query = text(f"SELECT COUNT(*) FROM drug_toxicity {where_clause}")
    total_drugs = db.execute(total_query, params).scalar()
    
    return {
        "distribution": distribution,
        "total_drugs": total_drugs
    }

@app.get("/companies/{company_name}/portfolio")
def get_company_portfolio(company_name: str, tox_type: str = None, db: Session = Depends(get_db)):
    where_clause = "WHERE is_historical = 0 AND Author_Organization = :company"
    params = {"company": company_name}
    if tox_type:
        where_clause += " AND Tox_Type = :tox"
        params["tox"] = tox_type
        
    query = text(f"SELECT SETID, Trade_Name, Generic_Proper_Names, Toxicity_Class, SPL_Effective_Time, Changed "
                 f"FROM drug_toxicity {where_clause} ORDER BY Trade_Name ASC")
    result = db.execute(query, params)
    return [dict(row._mapping) for row in result]

@app.get("/discrepancies")
def get_discrepancies(tox_type: str = None, db: Session = Depends(get_db)):
    # Map classes to scores for gap calculation
    # No=0, Precaution=1, Less=2, Most=3
    tox_map = {"No": 0, "Precaution": 1, "Less": 2, "Most": 3}
    
    where_clause = "WHERE is_historical = 0"
    params = {}
    if tox_type:
        where_clause += " AND Tox_Type = :tox"
        params["tox"] = tox_type

    # Get all active records for the organ
    query = text(f"SELECT Generic_Proper_Names, Author_Organization, Toxicity_Class, Trade_Name, SETID "
                 f"FROM drug_toxicity {where_clause}")
    rows = db.execute(query, params).fetchall()
    
    # Group by generic name in Python for flexible analysis
    from collections import defaultdict
    groups = defaultdict(list)
    for r in rows:
        groups[r.Generic_Proper_Names].append(dict(r._mapping))
        
    discrepancies = []
    for generic_name, items in groups.items():
        unique_classes = set(item['Toxicity_Class'] for item in items)
        
        if len(unique_classes) > 1:
            # Calculate gap
            scores = [tox_map.get(c, 0) for c in unique_classes]
            gap = max(scores) - min(scores)
            
            # Map back to names for display
            sorted_classes = sorted(list(unique_classes), key=lambda x: tox_map.get(x, 0))
            
            discrepancies.append({
                "generic_name": generic_name,
                "tox_range": f"{sorted_classes[0]} to {sorted_classes[-1]}",
                "severity_gap": gap,
                "manufacturer_count": len(items),
                "classes_found": sorted_classes,
                "details": items
            })
            
    # Sort by gap severity then by generic name
    discrepancies.sort(key=lambda x: (-x['severity_gap'], x['generic_name']))
    
    return discrepancies

@app.get("/autocomplete")
def autocomplete(q: str = "", limit: int = 10, db: Session = Depends(get_db)):
    if not q:
        return []
    
    query = text("SELECT DISTINCT Trade_Name FROM drug_toxicity WHERE Trade_Name LIKE :q AND is_historical = 0 LIMIT :limit")
    result = db.execute(query, {"q": f"%{q}%", "limit": limit})
    suggestions = [row[0] for row in result]
    return suggestions

@app.get("/drugs/{setid}/history")
def get_drug_history(setid: str, tox_type: str = None, db: Session = Depends(get_db)):
    # Find the generic name, tox type, and company
    res = db.execute(text("SELECT Generic_Proper_Names, Tox_Type, Author_Organization FROM drug_toxicity WHERE SETID = :setid LIMIT 1"), {"setid": setid})
    row = res.fetchone()
    if not row:
        return []
    
    generic_name, current_tox_type, company = row[0], (tox_type or row[1]), row[2]
    
    # Get all records with same generic name, same tox type, AND SAME company
    history_res = db.execute(
        text("SELECT SETID, Toxicity_Class, SPL_Effective_Time, is_historical, Changed, Update_Notes, Trade_Name, Author_Organization "
             "FROM drug_toxicity WHERE Generic_Proper_Names = :name AND Tox_Type = :tox AND Author_Organization = :company ORDER BY SPL_Effective_Time DESC"),
        {"name": generic_name, "tox": current_tox_type, "company": company}
    )
    return [dict(r._mapping) for r in history_res]

@app.get("/drugs/{setid}")
def get_drug_detail(setid: str, tox_type: str = None, db: Session = Depends(get_db)):
    if tox_type:
        result = db.execute(text("SELECT * FROM drug_toxicity WHERE SETID = :setid AND Tox_Type = :tox_type"), 
                           {"setid": setid, "tox_type": tox_type})
    else:
        result = db.execute(text("SELECT * FROM drug_toxicity WHERE SETID = :setid"), {"setid": setid})
        
    row = result.fetchone()
    if row:
        return dict(row._mapping)
    return {"error": "Drug not found"}

@app.get("/drugs/{setid}/market")
def get_drug_market(setid: str, tox_type: str = None, db: Session = Depends(get_db)):
    # Find the generic name and tox type
    res = db.execute(text("SELECT Generic_Proper_Names, Tox_Type FROM drug_toxicity WHERE SETID = :setid LIMIT 1"), {"setid": setid})
    row = res.fetchone()
    if not row:
        return []
    
    generic_name, current_tox_type = row[0], (tox_type or row[1])
    
    # Get the latest (is_historical=0) labels from OTHER companies for the same agent/organ
    market_res = db.execute(
        text("SELECT SETID, Trade_Name, Author_Organization, Toxicity_Class, SPL_Effective_Time "
             "FROM drug_toxicity WHERE Generic_Proper_Names = :name AND Tox_Type = :tox AND is_historical = 0 AND SETID != :setid"),
        {"name": generic_name, "tox": current_tox_type, "setid": setid}
    )
    return [dict(r._mapping) for r in market_res]

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8843)

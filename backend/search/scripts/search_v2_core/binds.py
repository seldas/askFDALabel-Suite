# scripts/search_v2_core/binds.py
import re
from typing import Any, Dict

BIND_NAME_RE = re.compile(r":([A-Za-z_][A-Za-z0-9_]*)")

def prune_unused_binds(sql: str, binds: Dict[str, Any]) -> Dict[str, Any]:
    placeholders = set(BIND_NAME_RE.findall(sql))
    return {k: v for k, v in binds.items() if k in placeholders}

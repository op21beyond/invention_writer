from __future__ import annotations

from pathlib import Path
import json


def export_json(path: str, payload: dict) -> None:
    target = Path(path)
    target.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

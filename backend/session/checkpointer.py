from __future__ import annotations

from pathlib import Path

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

from backend.config import get_settings


def create_checkpointer_context():
    settings = get_settings()
    db_path = Path(__file__).resolve().parent.parent / settings.db_path
    return AsyncSqliteSaver.from_conn_string(str(db_path))

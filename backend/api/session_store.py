from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, cast
from uuid import uuid4

from fastapi.encoders import jsonable_encoder

from backend.api.models import UpdateSettingsRequest
from backend.graph.state import PatentWorkflowState, initial_state


@dataclass
class SessionRecord:
    thread_id: str
    project_name: str
    project_dir: str
    created_at: str
    updated_at: str
    status: str = "created"
    state: PatentWorkflowState = field(default_factory=initial_state)
    settings: UpdateSettingsRequest = field(default_factory=UpdateSettingsRequest)


SESSIONS: dict[str, SessionRecord] = {}


def utcnow() -> str:
    return datetime.utcnow().isoformat(timespec="seconds") + "Z"


def create_session(project_name: str, project_dir: str) -> SessionRecord:
    from backend.api.settings import get_effective_settings

    thread_id = str(uuid4())
    eff = get_effective_settings()
    eff_dump = eff.model_dump()
    st = initial_state(project_name=project_name, project_dir=project_dir)
    st["agent_configs"] = eff_dump.get("agent_configs") or st["agent_configs"]
    st["auto_run"] = bool(eff_dump.get("auto_run", False))
    st["auto_run_delay_seconds"] = int(eff_dump.get("auto_run_delay_seconds", 5))
    record = SessionRecord(
        thread_id=thread_id,
        project_name=project_name,
        project_dir=project_dir,
        created_at=utcnow(),
        updated_at=utcnow(),
        state=st,
        settings=UpdateSettingsRequest(**eff_dump),
    )
    SESSIONS[thread_id] = record
    return record


def merge_restore_state(
    client_state: dict[str, Any],
    *,
    project_name: str,
    project_dir: str,
) -> PatentWorkflowState:
    """클라이언트 상태를 initial_state 스키마 위에 얹되, 빠진 필드는 기본값 유지."""
    merged: dict[str, Any] = dict(
        initial_state(
            raw_idea=str(client_state.get("raw_idea", "") or ""),
            project_name=project_name,
            project_dir=project_dir,
        ),
    )
    merged.update(client_state)
    merged["project_name"] = project_name
    merged["project_dir"] = project_dir
    return cast(PatentWorkflowState, merged)


def serialize_session(record: SessionRecord) -> dict[str, Any]:
    return {
        "thread_id": record.thread_id,
        "project_name": record.project_name,
        "project_dir": record.project_dir,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
        "status": record.status,
        "state": jsonable_encoder(record.state),
        "settings": jsonable_encoder(record.settings.model_dump()),
    }

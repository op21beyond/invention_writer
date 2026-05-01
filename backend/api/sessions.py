from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request

from backend.api.models import (
    CreateSessionRequest,
    NavigateRequest,
    ResumeRequest,
    SessionRestorePayload,
    SessionStatePatch,
    StartSessionRequest,
    UpdateSettingsRequest,
)
from backend.api.session_store import (
    SESSIONS,
    SessionRecord,
    create_session,
    merge_restore_state,
    serialize_session,
    utcnow,
)
from backend.api.settings import get_effective_settings


router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("")
def create_session_endpoint(payload: CreateSessionRequest):
    record = create_session(payload.project_name, payload.project_dir)
    return serialize_session(record)


@router.post("/restore_snapshot")
async def restore_session_snapshot(payload: SessionRestorePayload, request: Request):
    """프로젝트 폴더 등에 저장된 스냅샷으로 서버 세션을 덮어씌운다(thread_id 유지)."""
    runtime = request.app.state.runtime
    await runtime.cancel_session(payload.thread_id)

    pn = (payload.project_name or payload.project_dir or "workspace").strip() or "workspace"
    pd = (payload.project_dir or payload.project_name or "").strip()

    merged = merge_restore_state(payload.state, project_name=pn, project_dir=pd)
    effective = get_effective_settings()

    if payload.settings:
        settings_obj = UpdateSettingsRequest(**payload.settings)
    else:
        settings_obj = UpdateSettingsRequest(**effective.model_dump())

    merged["auto_run"] = settings_obj.auto_run
    merged["auto_run_delay_seconds"] = settings_obj.auto_run_delay_seconds
    merged["agent_configs"] = settings_obj.agent_configs

    prev = SESSIONS.get(payload.thread_id)
    record = SessionRecord(
        thread_id=payload.thread_id,
        project_name=pn,
        project_dir=pd,
        created_at=(payload.created_at or (prev.created_at if prev else utcnow())),
        updated_at=utcnow(),
        status=payload.status,
        state=merged,
        settings=settings_obj,
    )
    SESSIONS[payload.thread_id] = record

    return serialize_session(record)


@router.get("")
def list_sessions():
    return [serialize_session(record) for record in SESSIONS.values()]


@router.get("/{thread_id}")
def get_session(thread_id: str):
    record = SESSIONS.get(thread_id)
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
    return serialize_session(record)


@router.patch("/{thread_id}/state")
def patch_session_state(thread_id: str, body: SessionStatePatch):
    record = SESSIONS.get(thread_id)
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
    st = record.state
    if body.anchor_document is not None:
        st["anchor_document"] = body.anchor_document
    if body.patent_document is not None:
        st["patent_document"] = body.patent_document
    if body.conversation_log is not None:
        st["conversation_log"] = body.conversation_log
    if body.expander_suggestions is not None:
        st["expander_suggestions"] = body.expander_suggestions
    if body.search_queries is not None:
        st["search_queries"] = body.search_queries
    if body.search_results is not None:
        st["search_results"] = body.search_results
    if body.examiner_objections is not None:
        st["examiner_objections"] = body.examiner_objections
    if body.examiner_status is not None:
        st["examiner_status"] = body.examiner_status
    record.updated_at = utcnow()
    return serialize_session(record)


@router.delete("/{thread_id}")
def delete_session(thread_id: str):
    if thread_id not in SESSIONS:
        raise HTTPException(status_code=404, detail="Session not found")
    del SESSIONS[thread_id]
    return {"ok": True}


@router.post("/{thread_id}/start")
async def start_session(thread_id: str, payload: StartSessionRequest, request: Request):
    record = SESSIONS.get(thread_id)
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
    record.state["raw_idea"] = payload.raw_idea
    runtime = request.app.state.runtime
    await runtime.start_session(record)
    record.status = "running"
    record.updated_at = utcnow()
    return serialize_session(record)


@router.post("/{thread_id}/resume")
async def resume_session(thread_id: str, payload: ResumeRequest, request: Request):
    record = SESSIONS.get(thread_id)
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")

    if payload.action in {"approve", "reject"} and record.status != "awaiting_human":
        raise HTTPException(status_code=400, detail="approve/reject only allowed while awaiting human review")

    runtime = request.app.state.runtime
    await runtime.resume_session(
        record,
        {
            "action": payload.action,
            "directive": payload.directive,
            "edited_document": payload.edited_document,
            "discussion_decisions": [d.model_dump() for d in (payload.discussion_decisions or [])],
            "skip_discussion_to_search": payload.skip_discussion_to_search,
            "skip_examination_to_finalize": payload.skip_examination_to_finalize,
        },
    )
    return {
        "thread_id": thread_id,
        "action": payload.action,
        "status": record.status,
        "state": record.state,
    }


@router.post("/{thread_id}/cancel")
async def cancel_session(thread_id: str, request: Request):
    record = SESSIONS.get(thread_id)
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
    runtime = request.app.state.runtime
    cancelled = await runtime.cancel_session(thread_id)
    return {"thread_id": thread_id, "cancelled": cancelled, "status": record.status}


@router.post("/{thread_id}/navigate")
async def navigate_session(thread_id: str, body: NavigateRequest, request: Request):
    record = SESSIONS.get(thread_id)
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
    if record.status == "running":
        raise HTTPException(status_code=409, detail="Cannot navigate while running; cancel first")
    if record.status == "created":
        raise HTTPException(status_code=400, detail="먼저 「다음 단계」로 워크플로를 시작해 주세요.")

    runtime = request.app.state.runtime
    try:
        await runtime.navigate_to_ribbon_step(record, body.target_step_index)
    except ValueError as exc:
        detail = str(exc)
        if detail == "structurer_must_complete_before_navigate":
            detail = "구조화가 완료된 뒤에만 단계 이동할 수 있습니다."
        raise HTTPException(status_code=400, detail=detail) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"단계 이동 처리 실패: {exc}") from exc

    await runtime.publish(
        thread_id,
        "checkpoint",
        {
            "checkpoint_id": "navigate",
            "phase": record.state.get("phase", "draft"),
            "session": serialize_session(record),
        },
    )

    record.updated_at = utcnow()
    return serialize_session(record)


@router.post("/{thread_id}/rollback/{checkpoint_id}")
def rollback_session(thread_id: str, checkpoint_id: str):
    record = SESSIONS.get(thread_id)
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
    record.status = "awaiting_human"
    record.updated_at = utcnow()
    return {"thread_id": thread_id, "checkpoint_id": checkpoint_id, "status": "awaiting_human"}


@router.get("/{thread_id}/checkpoints")
def list_checkpoints(thread_id: str):
    if thread_id not in SESSIONS:
        raise HTTPException(status_code=404, detail="Session not found")
    return []


@router.get("/{thread_id}/export")
def export_session(thread_id: str):
    record = SESSIONS.get(thread_id)
    if not record:
        raise HTTPException(status_code=404, detail="Session not found")
    return serialize_session(record)


@router.post("/import")
def import_session(payload: dict):
    record = create_session(payload.get("project_name", "imported-project"), payload.get("project_dir", ""))
    return serialize_session(record)

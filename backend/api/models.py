from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class CreateSessionRequest(BaseModel):
    project_name: str
    project_dir: str = ""


class StartSessionRequest(BaseModel):
    raw_idea: str


class DiscussionDecisionPayload(BaseModel):
    suggestion_id: str
    reason: str = ""
    merit_score: Literal[0, 1, 2] | None = None
    status: Literal["accepted", "rejected", "skipped"] | None = None


class ResumeRequest(BaseModel):
    action: Literal["continue", "approve", "reject"]
    directive: str = ""
    edited_document: dict[str, Any] | None = None
    discussion_decisions: list[DiscussionDecisionPayload] | None = None
    skip_discussion_to_search: bool = False
    skip_examination_to_finalize: bool = False


class NavigateRequest(BaseModel):
    target_step_index: int = Field(ge=1, le=5, description="플로 리본 1..5 (구조화=0 단계 없음)")


class SessionRestorePayload(BaseModel):
    """프로젝트 폴더 `session-snapshot.json` 등에서 복구."""

    thread_id: str = Field(..., min_length=1)
    project_name: str = ""
    project_dir: str = ""
    created_at: str | None = None
    updated_at: str | None = None
    status: str = "awaiting_human"
    state: dict[str, Any]
    settings: dict[str, Any] | None = None


class SettingsResponse(BaseModel):
    auto_run: bool = False
    auto_run_delay_seconds: int = 5
    agent_configs: dict[str, Any] = Field(default_factory=dict)


class UpdateSettingsRequest(SettingsResponse):
    pass


class SessionStatePatch(BaseModel):
    """사람이 대화 로그 상세에서 편집해 반영할 수 있는 상태 필드만 허용."""

    anchor_document: dict[str, Any] | None = None
    patent_document: dict[str, Any] | None = None
    conversation_log: list[Any] | None = None
    expander_suggestions: list[Any] | None = None
    search_queries: list[Any] | None = None
    search_results: list[Any] | None = None
    examiner_objections: list[Any] | None = None
    examiner_status: str | None = None

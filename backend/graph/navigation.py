"""플로 리본 단계 번호와 LangGraph 상태를 맞추기 위한 보정 패치(대화 로그는 유지)."""

from __future__ import annotations

from typing import Any

# 프런트 `WORKFLOW_STEP_LABELS` 과 동일한 순서(0 … 5).
_NAV_MIN = 1
_NAV_MAX = 5

_PLACEHOLDER_SEARCH_HIT: dict[str, Any] = {
    "patent_number": "",
    "title": "(네비게이션용 스텁 결과 — 실제 검색으로 바꿀 때까지 무시 가능)",
    "snippet": "",
}


def build_navigation_state_patch(target_step_index: int, state: dict[str, Any]) -> dict[str, Any]:
    if target_step_index < _NAV_MIN or target_step_index > _NAV_MAX:
        raise ValueError("target_step_index out of bounds")

    log_raw = state.get("conversation_log")
    log = log_raw if isinstance(log_raw, list) else []
    if not _has_anchor_message(log):
        raise ValueError("structurer_must_complete_before_navigate")

    def _discussion_base() -> dict[str, Any]:
        return {
            "phase": "discussion",
            "discussion_turn": "expander",
            "discussion_feedback_history": [],
            "expander_suggestions": [],
            "skip_discussion_to_search": False,
            "skip_examination_to_finalize": False,
            "human_approved": False,
        }

    if target_step_index == 1:
        return {
            **_discussion_base(),
            "discussion_round": 0,
            "discussion_turn": "expander",
        }

    if target_step_index == 2:
        return {
            **_discussion_base(),
            "discussion_round": 1,
            "discussion_turn": "expander",
        }

    if target_step_index == 3:
        return {
            "phase": "examination",
            "search_queries": [],
            "search_results": [],
            "search_error": None,
            "examiner_objections": [],
            "examiner_status": "rejected",
            "examination_round": 0,
            "after_human_examination": None,
            "skip_discussion_to_search": False,
            "skip_examination_to_finalize": False,
            "human_approved": False,
        }

    if target_step_index == 4:
        results = list(state.get("search_results") or [])
        if not results:
            results = [_PLACEHOLDER_SEARCH_HIT]
        return {
            "phase": "examination",
            "search_results": results,
            "search_queries": list(state.get("search_queries") or []),
            "examination_round": int(state.get("examination_round") or 0),
            "after_human_examination": state.get("after_human_examination") or "examiner",
            "examiner_status": state.get("examiner_status") or "rejected",
            "examiner_objections": list(state.get("examiner_objections") or []),
            "skip_discussion_to_search": False,
            "skip_examination_to_finalize": False,
            "human_approved": False,
        }

    # 5: 종료 상태 (사람 승인·완료)
    return {
        "human_approved": True,
        "skip_examination_to_finalize": False,
        "skip_discussion_to_search": False,
    }


def _has_anchor_message(log: list[Any]) -> bool:
    for raw in log:
        if isinstance(raw, dict) and raw.get("agent_id") == "agent0":
            return True
    return False

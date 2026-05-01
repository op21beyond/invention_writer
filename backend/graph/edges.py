from __future__ import annotations

from backend.graph.state import PatentWorkflowState


def route_after_human_review(state: PatentWorkflowState) -> str:
    phase = state["phase"]

    if phase == "discussion":
        if bool(state.get("skip_discussion_to_search")):
            return "agent3_query"
        # discussion_turn: 직전 자동 노드가 Expander면 "developer" (= 사용자가 방금 본 건 확장 제안)
        # 이때는 라운드 카운트와 관계없이 반드시 Developer(초안 반영)로 보낸다.
        turn = state.get("discussion_turn", "expander")
        if turn == "developer":
            return "agent1_respond"
        if state["discussion_round"] >= state["max_discussion_rounds"] or state["agent1_status"] == "ready":
            return "agent3_query"
        return "agent2"

    if phase == "examination":
        if bool(state.get("skip_examination_to_finalize")):
            return "finalize"
        if state["examiner_status"] == "approved" or state["examination_round"] >= state["max_examination_rounds"]:
            return "finalize"
        nxt = state.get("after_human_examination") or "examiner"
        if nxt == "rebut":
            return "agent1_rebut"
        return "agent3_examiner"

    if phase == "draft":
        return "agent1_draft"

    return "finalize"

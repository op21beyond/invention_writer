from __future__ import annotations

import copy
import json
import logging
from typing import Any

from langgraph.types import interrupt

from backend.agents.llm_runner import extract_json_array, extract_json_object, invoke_llm_text
from backend.agents.prompts.agent0 import SYSTEM_JSON
from backend.agents.prompts.agent1 import SYSTEM_PATENT_JSON
from backend.agents.prompts.agent2 import SYSTEM_EXPANDER_JSON
from backend.agents.prompts.agent3 import SYSTEM_EXAMINER_JSON, SYSTEM_QUERY_REFINE
from backend.config import get_settings
from backend.graph.state import PatentWorkflowState
from backend.patent_search.kipris import KIPRISClient
from backend.patent_search.query_generator import build_patent_search_queries
from backend.patent_search.uspto import USPTOClient

logger = logging.getLogger(__name__)


def _append_message(
    state: PatentWorkflowState,
    agent_id: str,
    content: str,
    *,
    message_detail: dict | None = None,
) -> list[dict]:
    role = "system" if agent_id == "system" else "ai"
    row: dict = {"role": role, "agent_id": agent_id, "content": content}
    if message_detail:
        row["message_detail"] = message_detail
        row["additional_kwargs"] = {"message_detail": message_detail}
    return [*state["conversation_log"], row]


def _default_patent_shell() -> dict[str, Any]:
    return {
        "title": "발명신고서 초안",
        "field": "",
        "background": "",
        "problem": "",
        "solution": "",
        "effects": "",
        "drawings": "",
        "embodiments": "",
        "claims_independent": [],
        "claims_dependent": [],
        "prior_art_comparison": "",
        "abstract": "",
    }


def _patent_text_fields_mostly_empty(doc: dict[str, Any]) -> bool:
    texts = ["background", "problem", "solution", "abstract"]
    if any(str(doc.get(k, "")).strip() for k in texts):
        return False
    if str(doc.get("draft", "")).strip():
        return False
    ci = doc.get("claims_independent")
    cd = doc.get("claims_dependent")
    if isinstance(ci, list) and ci:
        return False
    if isinstance(cd, list) and cd:
        return False
    return True


def _anchor_fallback_patch(state: PatentWorkflowState) -> dict[str, Any]:
    """LLM이 JSON을 깨졌을 때 빈 패널을 줄이기 위한 초안 채우기."""
    raw = str(state.get("raw_idea", "") or "").strip()
    anch = state.get("anchor_document")
    anch = anch if isinstance(anch, dict) else {}
    summary = str(anch.get("summary", "")).strip()
    ps = str(anch.get("problem_solved", "")).strip()
    df = str(anch.get("data_flow", "")).strip()

    hdr = (
        "(LLM이 유효한 발명신고서 JSON을 반환하지 못해 Anchor·발명 원문으로 자동 채웠습니다. "
        "아래 초안은 법적으로 완결된 명세가 아니므로 검토·편집이 필요합니다.)\n"
    )
    blocks: list[str] = []
    if summary:
        blocks.append(f"[Anchor 요약]\n{summary}")
    if df:
        blocks.append(f"[데이터 흐름]\n{df}")
    if raw:
        blocks.append(f"[발명 아이디어]\n{raw[:24000]}")
    body = hdr + ("\n\n".join(blocks) if blocks else f"\n[발명 아이디어]\n{raw[:24000]}")

    out: dict[str, Any] = {
        "background": (summary[:12000]).strip(),
        "problem": (ps[:8000]).strip(),
        "solution": body.strip()[:26000],
        "abstract": (summary[:2000]).strip(),
        "draft": body.strip()[:32000],
    }
    if summary:
        ln = summary.split("\n")[0].strip()
        if len(ln) > 3:
            out["title"] = ln[:200]
    return out


def _merge_patent(base: dict[str, Any] | None, incoming: dict[str, Any]) -> dict[str, Any]:
    """LLM이 빈 문자열·빈 청구 배열만 보낼 때 기존에 채워 둔 내용·draft를 지우지 않는다."""
    out = {**_default_patent_shell(), **(base or {})}
    for k, v in incoming.items():
        if v is None:
            continue
        if k in ("claims_independent", "claims_dependent"):
            if not isinstance(v, list):
                continue
            if len(v) == 0:
                prev = out.get(k)
                if isinstance(prev, list) and len(prev) > 0:
                    continue
            out[k] = v
            continue
        if isinstance(v, str) and not v.strip():
            prev = out.get(k)
            if isinstance(prev, str) and prev.strip():
                continue
            out[k] = v
            continue
        out[k] = v
    if not isinstance(out.get("claims_independent"), list):
        out["claims_independent"] = []
    if not isinstance(out.get("claims_dependent"), list):
        out["claims_dependent"] = []
    return out


def _normalize_anchor(data: dict[str, Any], raw_idea: str) -> dict[str, Any]:
    components = data.get("components") or []
    if not isinstance(components, list):
        components = []
    fixed: list[dict[str, Any]] = []
    for c in components:
        if not isinstance(c, dict):
            continue
        fixed.append(
            {
                "name": str(c.get("name", "구성요소"))[:200],
                "description": str(c.get("description", ""))[:2000],
                "essential": bool(c.get("essential", True)),
            }
        )
    if len(fixed) < 2:
        fixed = [
            {"name": "핵심 모듈", "description": "발명의 주요 처리 단위", "essential": True},
            {"name": "입출력", "description": "외부와의 연계", "essential": False},
        ]
    return {
        "summary": str(data.get("summary", raw_idea[:300]))[:4000],
        "problem_solved": str(data.get("problem_solved", ""))[:4000],
        "components": fixed,
        "data_flow": str(data.get("data_flow", ""))[:4000],
        "system_boundary": str(data.get("system_boundary", ""))[:4000],
        "key_technologies": [str(x)[:200] for x in (data.get("key_technologies") or []) if x][:20],
        "ipc_candidates": [str(x)[:50] for x in (data.get("ipc_candidates") or []) if x][:20],
    }


async def node_agent0_structurer(state: PatentWorkflowState) -> dict:
    raw_idea = state["raw_idea"].strip()
    configs = state.get("agent_configs") or {}
    anchor = _normalize_anchor(
        {
            "summary": raw_idea[:300],
            "problem_solved": "",
            "components": [],
            "data_flow": "",
            "system_boundary": "",
            "key_technologies": [],
            "ipc_candidates": [],
        },
        raw_idea,
    )
    msg = "Anchor Document 스켈레톤을 생성했습니다."
    if raw_idea:
        try:
            text = await invoke_llm_text("agent0", configs, SYSTEM_JSON, raw_idea, temperature=0.3)
            data = extract_json_object(text)
            anchor = _normalize_anchor(data, raw_idea)
            msg = "Anchor Document를 구조화했습니다."
        except Exception as exc:
            logger.exception("agent0 LLM failed: %s", exc)
            msg = f"구조화 LLM 호출에 실패해 요약만 반영했습니다: {exc}"

    return {
        "anchor_document": anchor,
        "phase": "discussion",
        "discussion_turn": "expander",
        "conversation_log": _append_message(
            state,
            "agent0",
            msg,
            message_detail={"kind": "anchor", "anchor_document": anchor},
        ),
    }


def node_human_review(state: PatentWorkflowState) -> dict:
    human_input = interrupt(
        {
            "type": "review",
            "phase": state["phase"],
            "document_snapshot": state["patent_document"],
            "auto_run": state["auto_run"],
            "requires_gate": False,
        }
    )
    directive_raw = human_input.get("directive", "")
    directive = directive_raw if isinstance(directive_raw, str) else ""
    edited = human_input.get("edited_document")
    dec_raw = human_input.get("discussion_decisions")
    if not isinstance(dec_raw, list):
        dec_raw = []

    normalized: list[dict[str, str]] = []
    for item in dec_raw:
        if not isinstance(item, dict):
            continue
        sid = str(item.get("suggestion_id", "")).strip()
        status = str(item.get("status", "skipped")).strip().lower()
        if status not in ("accepted", "rejected", "skipped"):
            status = "skipped"
        reason = str(item.get("reason", "")).strip()[:4000]
        if sid:
            normalized.append({"suggestion_id": sid, "status": status, "reason": reason})

    skip_ds = bool(human_input.get("skip_discussion_to_search"))
    skip_ex_f = bool(human_input.get("skip_examination_to_finalize"))

    out: dict = {
        "human_directive": directive,
        "patent_document": edited if edited is not None else state["patent_document"],
    }

    if skip_ds:
        out["skip_discussion_to_search"] = True
    elif state["phase"] == "discussion" and state.get("discussion_turn") == "developer":
        entry = {
            "discussion_turn_before_resume": state["discussion_turn"],
            "discussion_round": state["discussion_round"],
            "human_directive": directive,
            "discussion_decisions": normalized,
            "expander_suggestions_snapshot": copy.deepcopy(state.get("expander_suggestions", [])),
        }
        hist = state.get("discussion_feedback_history") or []
        out["discussion_feedback_history"] = [*hist, entry]

    if skip_ex_f:
        out["skip_examination_to_finalize"] = True

    return out


async def node_agent1(state: PatentWorkflowState) -> dict:
    phase = state["phase"]
    discussion_round_at_start = state["discussion_round"]
    base_doc = state["patent_document"] or _default_patent_shell()
    patent_document = _merge_patent(base_doc, {})
    configs = state.get("agent_configs") or {}

    payload = {
        "phase": phase,
        "human_directive": state.get("human_directive", ""),
        "anchor_document": state.get("anchor_document"),
        "expander_suggestions": state.get("expander_suggestions", []),
        "discussion_feedback_history": state.get("discussion_feedback_history") or [],
        "current_patent": patent_document,
    }
    user_text = json.dumps(payload, ensure_ascii=False)

    msg = f"{phase} 단계 초안을 유지했습니다."
    try:
        text = await invoke_llm_text("agent1", configs, SYSTEM_PATENT_JSON, user_text, temperature=0.35)
        data = extract_json_object(text)
        patent_document = _merge_patent(patent_document, data)
        msg = f"{phase} 단계 초안을 LLM으로 갱신했습니다."
    except Exception as exc:
        logger.exception("agent1 LLM failed: %s", exc)
        msg = f"{phase} 단계에서 LLM 갱신에 실패해 이전 초안을 유지합니다: {exc}"
        if _patent_text_fields_mostly_empty(patent_document):
            patent_document = _merge_patent(patent_document, _anchor_fallback_patch(state))
            msg += " Anchor·발명 원문 기반 필드를 자동 채웠습니다."

    dev_detail: dict[str, Any] = {
        "kind": "developer_patent",
        "phase": phase,
        "patent_document": patent_document,
    }
    if phase == "discussion":
        dev_detail["discussion_round_completed"] = discussion_round_at_start

    patch: dict = {
        "patent_document": patent_document,
        "agent1_status": "working",
        "conversation_log": _append_message(
            state,
            "agent1",
            msg,
            message_detail=dev_detail,
        ),
    }
    if phase == "discussion":
        hist = list(state.get("discussion_feedback_history") or [])
        if hist:
            last = copy.deepcopy(hist[-1])
            last["patent_document_after"] = copy.deepcopy(patent_document)
            hist[-1] = last
            patch["discussion_feedback_history"] = hist
        patch["discussion_round"] = state["discussion_round"] + 1
        patch["discussion_turn"] = "expander"
    if phase == "rebut":
        patch["after_human_examination"] = "examiner"
    return patch


async def node_agent2_expander(state: PatentWorkflowState) -> dict:
    configs = state.get("agent_configs") or {}
    suggestions: list[dict[str, Any]] = [
        {
            "id": f"s-{state['discussion_round'] + 1}-1",
            "type": "ORIGINAL",
            "content": "LLM 없이 생성된 예비 제안입니다.",
        }
    ]
    msg = "확장 제안 스켈레톤을 생성했습니다."

    payload = {
        "anchor_document": state.get("anchor_document"),
        "patent_document": state.get("patent_document"),
        "human_directive": state.get("human_directive", ""),
        "discussion_round": state["discussion_round"],
        "discussion_feedback_history": state.get("discussion_feedback_history") or [],
    }
    try:
        text = await invoke_llm_text(
            "agent2",
            configs,
            SYSTEM_EXPANDER_JSON,
            json.dumps(payload, ensure_ascii=False),
            temperature=0.4,
        )
        arr = extract_json_array(text)
        if isinstance(arr, list) and arr:
            suggestions = []
            for i, item in enumerate(arr):
                if not isinstance(item, dict):
                    continue
                suggestions.append(
                    {
                        "id": str(item.get("id", f"s-{state['discussion_round'] + 1}-{i + 1}"))[:80],
                        "type": str(item.get("type", "VARIANT"))[:40],
                        "content": str(item.get("content", ""))[:8000],
                    }
                )
            if suggestions:
                msg = "확장 제안을 생성했습니다."
    except Exception as exc:
        logger.exception("agent2 LLM failed: %s", exc)
        msg = f"확장 LLM 호출 실패, 예시 제안만 남깁니다: {exc}"

    return {
        "expander_suggestions": suggestions,
        "discussion_turn": "developer",
        "discussion_round": state["discussion_round"] + 1,
        "conversation_log": _append_message(
            state,
            "agent2",
            msg,
            message_detail={"kind": "expander", "suggestions": suggestions},
        ),
    }


async def node_agent3_query_generator(state: PatentWorkflowState) -> dict:
    settings = get_settings()
    db_label = "KIPRIS" if settings.patent_search_backend == "kipris" else "USPTO"
    queries = build_patent_search_queries(state["anchor_document"], database=db_label)
    configs = state.get("agent_configs") or {}
    msg = f"{db_label} 검색 쿼리 초안을 생성했습니다."

    refine_payload = {
        "database": db_label,
        "anchor": state.get("anchor_document"),
        "base_queries": queries,
    }
    try:
        text = await invoke_llm_text(
            "agent3",
            configs,
            SYSTEM_QUERY_REFINE,
            json.dumps(refine_payload, ensure_ascii=False),
            temperature=0.2,
        )
        arr = extract_json_array(text)
        if isinstance(arr, list) and arr:
            refined: list[dict[str, Any]] = []
            for item in arr:
                if not isinstance(item, dict) or "query" not in item:
                    continue
                refined.append(
                    {
                        "query": str(item.get("query", ""))[:2000],
                        "database": str(item.get("database", db_label)),
                        "target_component": str(item.get("target_component", "summary")),
                    }
                )
            if refined:
                queries = refined
                msg = f"{db_label} 검색 쿼리를 LLM으로 다듬었습니다."
    except Exception as exc:
        logger.warning("agent3 query refine skipped: %s", exc)

    return {
        "search_queries": queries,
        "phase": "examination",
        "skip_discussion_to_search": False,
        "conversation_log": _append_message(
            state,
            "agent3",
            msg,
            message_detail={"kind": "search_queries", "queries": queries},
        ),
    }


async def node_patent_search(state: PatentWorkflowState) -> dict:
    settings = get_settings()
    search_error: str | None = None
    if settings.patent_search_backend == "uspto":
        results = await USPTOClient().search(state["search_queries"])
        label = "USPTO"
        content = f"{label} 검색 결과 {len(results)}건을 수집했습니다."
    else:
        results, kipris_err = await KIPRISClient().search_with_error(state["search_queries"])
        label = "KIPRIS"
        search_error = kipris_err
        if kipris_err:
            content = f"{label} 검색: {kipris_err}"
        else:
            content = f"{label} 검색 결과 {len(results)}건을 수집했습니다."
    return {
        "search_results": results,
        "search_error": search_error,
        "after_human_examination": "examiner",
        "conversation_log": _append_message(
            state,
            "search",
            content,
            message_detail={"kind": "search_results", "results": results},
        ),
    }


async def node_agent3_examiner(state: PatentWorkflowState) -> dict:
    configs = state.get("agent_configs") or {}
    objections: list[dict[str, Any]] = []
    ex_status = "approved"

    payload = {
        "search_results": state.get("search_results", []),
        "patent_document": state.get("patent_document"),
        "anchor_document": state.get("anchor_document"),
        "examination_round": state["examination_round"],
    }
    msg = "심사 의견을 생성했습니다."
    try:
        text = await invoke_llm_text(
            "agent3",
            configs,
            SYSTEM_EXAMINER_JSON,
            json.dumps(payload, ensure_ascii=False),
            temperature=0.25,
        )
        data = extract_json_object(text)
        objections = data.get("objections") or []
        if not isinstance(objections, list):
            objections = []
        ex_status = str(data.get("examiner_status", "rejected" if objections else "approved"))
        if ex_status not in ("approved", "rejected"):
            ex_status = "rejected" if objections else "approved"
    except Exception as exc:
        logger.exception("agent3 examiner LLM failed: %s", exc)
        objections = []
        if state["search_results"]:
            objections.append(
                {
                    "type": "novelty",
                    "target_claim": "claim_1",
                    "reason": f"LLM 심사 생성 실패, 스켈레톤 의견: {exc}",
                    "cited_patents": [
                        str(r.get("patent_number", ""))
                        for r in state["search_results"][:3]
                        if r.get("patent_number")
                    ],
                }
            )
        ex_status = "rejected" if objections else "approved"
        msg = "심사 의견 LLM 호출에 실패해 기본 스켈레톤만 남겼습니다."

    results = state.get("search_results") or []
    err_note = (state.get("search_error") or "").strip()
    if not results:
        if not objections:
            reason = "특허 검색 결과가 없습니다. 선행 조사·쿼리·API 상태를 확인한 뒤 명세·청구를 보강해야 합니다."
            if err_note:
                reason = f"{reason} (검색 메시지: {err_note})"
            objections = [
                {
                    "type": "clarity",
                    "target_claim": "claim_1",
                    "reason": reason,
                    "cited_patents": [],
                }
            ]
        ex_status = "rejected"
        msg = "검색 결과가 없어 심사 스켈레톤 의견을 남깁니다."

    return {
        "examiner_objections": objections,
        "examiner_status": ex_status,
        "examination_round": state["examination_round"] + 1,
        "after_human_examination": "rebut",
        "conversation_log": _append_message(
            state,
            "agent3",
            msg,
            message_detail={
                "kind": "examiner_objections",
                "objections": objections,
                "examiner_status": ex_status,
            },
        ),
    }


def node_finalize(state: PatentWorkflowState) -> dict:
    return {
        "human_approved": True,
        "skip_examination_to_finalize": False,
        "conversation_log": _append_message(state, "system", "워크플로우를 종료합니다."),
    }

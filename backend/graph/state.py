from __future__ import annotations

from typing import Annotated, Literal, TypedDict

from langgraph.graph.message import add_messages


class AnchorComponent(TypedDict):
    name: str
    description: str
    essential: bool


class AnchorDocument(TypedDict):
    summary: str
    problem_solved: str
    components: list[AnchorComponent]
    data_flow: str
    system_boundary: str
    key_technologies: list[str]
    ipc_candidates: list[str]


class PatentDocument(TypedDict, total=False):
    title: str
    field: str
    background: str
    problem: str
    solution: str
    effects: str
    drawings: str
    embodiments: str
    claims_independent: list[str]
    claims_dependent: list[str]
    prior_art_comparison: str
    abstract: str
    draft: str
    expander_decisions_summary: str


class WorkflowMessage(TypedDict, total=False):
    role: Literal["system", "human", "ai"]
    agent_id: str
    content: str
    message_detail: dict  # 에이전트별 UI 표시용(확장 제안·초안 스냅샷 등)


DiscussionTurn = Literal["expander", "developer"]


class PatentWorkflowState(TypedDict):
    raw_idea: str
    anchor_document: AnchorDocument | None
    patent_document: PatentDocument | None
    expander_suggestions: list[dict]
    search_queries: list[dict]
    search_results: list[dict]
    search_error: str | None
    examiner_objections: list[dict]
    after_human_examination: str | None  # 다음 사람 검토 후: "examiner" | "rebut"
    phase: str
    discussion_turn: DiscussionTurn
    discussion_round: int
    examination_round: int
    max_discussion_rounds: int
    max_examination_rounds: int
    discussion_feedback_history: list[dict]
    agent1_status: str
    examiner_status: str
    human_directive: str
    human_approved: bool
    skip_discussion_to_search: bool
    skip_examination_to_finalize: bool
    auto_run: bool
    auto_run_delay_seconds: int
    project_name: str
    project_dir: str
    conversation_log: Annotated[list[WorkflowMessage], add_messages]
    agent_configs: dict


def initial_state(
    raw_idea: str = "",
    project_name: str = "",
    project_dir: str = "",
) -> PatentWorkflowState:
    return {
        "raw_idea": raw_idea,
        "anchor_document": None,
        "patent_document": None,
        "expander_suggestions": [],
        "search_queries": [],
        "search_results": [],
        "search_error": None,
        "examiner_objections": [],
        "after_human_examination": None,
        "phase": "draft",
        "discussion_turn": "expander",
        "discussion_round": 0,
        "examination_round": 0,
        "max_discussion_rounds": 3,
        "max_examination_rounds": 3,
        "discussion_feedback_history": [],
        "agent1_status": "working",
        "examiner_status": "rejected",
        "human_directive": "",
        "human_approved": False,
        "skip_discussion_to_search": False,
        "skip_examination_to_finalize": False,
        "auto_run": False,
        "auto_run_delay_seconds": 5,
        "project_name": project_name,
        "project_dir": project_dir,
        "conversation_log": [],
        "agent_configs": {
            "agent0": {"provider": "anthropic", "model": "claude-sonnet-4-5"},
            "agent1": {"provider": "anthropic", "model": "claude-sonnet-4-5"},
            "agent2": {"provider": "anthropic", "model": "claude-sonnet-4-5"},
            "agent3": {"provider": "anthropic", "model": "claude-sonnet-4-5"},
        },
    }

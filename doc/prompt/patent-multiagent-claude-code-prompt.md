# 특허 발명신고서 자동화 시스템 — Claude Code 작업 지시서

---

## 프로젝트 개요

개발자가 발명 아이디어를 입력하면 여러 AI 에이전트가 역할을 나눠 협업·충돌·검증을 반복하면서 **직무발명신고서 초안**을 자동 생성하는 웹 애플리케이션이다.

단순 문서 생성이 아니라 **논쟁 기반 특허 생성 시스템**이 핵심 콘셉트다. 사람(발명자)은 매 에이전트 턴마다 공유 문서를 읽고, 편집하고, 방향을 조정할 수 있다.

---

## 구현 방식 — LangGraph 기반 워크플로우

**이 시스템은 LangGraph(Python)를 핵심 실행 엔진으로 구현한다. 이것은 협상 불가 사항이다.**

### 구현 확정 사항 (2026-04-30 기준)

- **저장소 구조**: 처음부터 `backend/` + `frontend/` 분리
- **환경변수 위치**: 실제 런타임 키는 `backend/.env`
- **실행 중 상태 원본**: LangGraph `SqliteSaver` DB
- **프로젝트 폴더 방식**: 브라우저 `File System Access API`로 직접 열고 저장
- **Human interrupt 기본값**: 매 턴 정지, 설정으로 auto-run 허용
- **특허 검색 MVP**: USPTO만 실제 연동, KIPRIS/EPO는 후속 구현
- **`/resume` 액션**: `continue`, `edit_and_continue`, `pause`, `approve`, `reject`

### 이 방식을 선택한 근거

이 시스템의 본질은 "자율적으로 협업하는 에이전트들"이 아니라 **정해진 그래프를 순차 실행하며 Human이 각 노드 사이에서 개입하는 워크플로우**다. LangGraph는 이 요구사항과 구조적으로 정확히 맞는다.

- **순차 실행 보장**: LangGraph StateGraph가 노드 간 실행 순서와 상태 전달을 관리. 별도의 상태 머신 코드 불필요
- **Human-in-the-loop 내장**: `interrupt()` 하나로 그래프 실행을 노드 사이에서 정확히 멈추고, Human 입력 후 재개 가능. 이것이 이 시스템의 핵심 요구사항과 일치
- **체크포인터 기반 세션**: SqliteSaver 체크포인터가 모든 그래프 상태를 자동 저장. thread_id + checkpoint_id로 특정 시점부터 재개 가능. 세션 직렬화 코드를 별도로 작성할 필요 없음
- **SharedDocument = LangGraph State**: 에이전트 간 공유 문서가 LangGraph의 State 객체 자체로 표현됨. 항상 최신 상태가 보장되며 다음 노드에 자동 전달됨

---

## 기술 스택

### 백엔드
- **언어**: Python 3.11+
- **웹 프레임워크**: FastAPI
- **워크플로우 엔진**: LangGraph (`langgraph >= 0.2`, `langchain-core`)
- **세션 저장**: LangGraph SqliteSaver
- **LLM 통합**: `langchain-anthropic`, `langchain-openai`, `langchain-google-genai`
- **스트리밍**: FastAPI SSE (Server-Sent Events)
- **패키지 매니저**: uv 또는 poetry

### 프론트엔드
- **프레임워크**: React + TypeScript + Vite
- **스타일링**: Tailwind CSS
- **상태**: Zustand (UI 상태만 — 워크플로우 상태는 백엔드가 관리)
- **에디터**: TipTap (공유 문서 인라인 편집)
- **백엔드 통신**: fetch + EventSource (SSE 수신)
- **패키지 매니저**: pnpm

---

## 시스템 아키텍처

```
┌─────────────────────────────────────────────────────────────────┐
│  React Frontend                                                 │
│  - UI 렌더링, Human 입력 수집, SSE 스트림 수신                     │
│  - 워크플로우 상태는 백엔드에서 받아서 표시만 함                     │
└─────────────────┬───────────────────────────────────────────────┘
                  │ HTTP / SSE
┌─────────────────▼───────────────────────────────────────────────┐
│  FastAPI Backend                                                │
│  - REST API: 세션 관리, Human 입력 수신, 설정 관리                 │
│  - SSE: 에이전트 스트리밍 응답, 상태 변경 이벤트 전송               │
└─────────────────┬───────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────────────────────┐
│  LangGraph StateGraph                                           │
│  - 노드: agent0, agent1, agent2, agent3, human_review          │
│  - 엣지: 조건부 분기 (라운드 수, 합의 여부, Human 승인)            │
│  - 상태: PatentWorkflowState (SharedDocument 포함)              │
│  - 체크포인터: SqliteSaver → 모든 상태 자동 저장                  │
└─────────────────┬───────────────────────────────────────────────┘
                  │
       ┌──────────┴───────────┐
       │                      │
┌──────▼──────┐    ┌──────────▼────────┐
│  LLM APIs   │    │  특허 DB APIs      │
│  Anthropic  │    │  KIPRIS (한국)     │
│  OpenAI     │    │  USPTO (미국)      │
│  Google     │    │  EPO (선택)        │
└─────────────┘    └───────────────────┘
```

---

## LangGraph 그래프 설계

### State 정의

LangGraph의 State 객체가 곧 SharedDocument다. 모든 노드는 이 State를 읽고 업데이트하며, LangGraph가 항상 최신 상태를 다음 노드에 전달하는 것을 보장한다.

```python
from typing import TypedDict, Annotated, Literal
from langgraph.graph.message import add_messages

class AnchorDocument(TypedDict):
    summary: str
    problem_solved: str
    components: list[dict]
    data_flow: str
    system_boundary: str
    key_technologies: list[str]
    ipc_candidates: list[str]

class PatentDocument(TypedDict):
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

class PatentWorkflowState(TypedDict):
    # 발명자 입력
    raw_idea: str

    # Anchor Document (Agent 0 출력, 이후 모든 에이전트의 기준)
    anchor_document: AnchorDocument | None

    # 청구항 및 발명신고서 (Agent 1이 지속 업데이트)
    patent_document: PatentDocument | None

    # Agent 2 제안 목록 (현재 라운드)
    expander_suggestions: list[dict]

    # Agent 3 심사 결과
    search_queries: list[dict]
    search_results: list[dict]
    examiner_objections: list[dict]

    # 워크플로우 제어
    phase: str                          # 현재 Phase
    discussion_round: int               # Agent1↔Agent2 현재 라운드
    examination_round: int              # Agent1↔Agent3 현재 라운드
    max_discussion_rounds: int          # 설정값
    max_examination_rounds: int         # 설정값
    agent1_status: str                  # "working" | "ready"
    examiner_status: str                # "rejected" | "approved"

    # Human 개입
    human_directive: str                # Human이 입력한 지시사항
    human_approved: bool                # 의무 게이트 승인 여부

    # 대화 로그 (누적)
    conversation_log: Annotated[list[dict], add_messages]

    # 에이전트 설정
    agent_configs: dict                 # {agent_id: {provider, model}}
```

### 그래프 노드 및 조립

```python
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.sqlite import SqliteSaver
from langgraph.types import interrupt

# --- 노드 함수 ---

def node_agent0_structurer(state: PatentWorkflowState) -> dict:
    """발명 아이디어를 AnchorDocument로 구조화"""
    # state.agent_configs["agent0"] 기준 LLM 선택
    # 결과를 anchor_document에 저장
    # conversation_log에 이 턴 메시지 추가
    ...

def node_human_review(state: PatentWorkflowState) -> dict:
    """Human 검토 인터럽트 — 매 에이전트 턴 후 호출"""
    human_input = interrupt({
        "type": "review",
        "current_phase": state["phase"],
        "document_snapshot": state["patent_document"],
    })
    return {
        "human_directive": human_input.get("directive", ""),
        # edited_document가 있으면 patent_document도 업데이트
        "patent_document": human_input.get("edited_document") or state["patent_document"]
    }

def node_agent1(state: PatentWorkflowState) -> dict:
    """청구항 설계 + Agent2 제안 수용/거부 + Agent3 거절 대응
    state.phase 값으로 역할 분기: draft / respond / rebut"""
    ...

def node_agent2_expander(state: PatentWorkflowState) -> dict:
    """발명 확장 제안 생성"""
    ...

def node_agent3_query_generator(state: PatentWorkflowState) -> dict:
    """2단계 특허 검색 쿼리 생성"""
    ...

def node_patent_search(state: PatentWorkflowState) -> dict:
    """MVP는 USPTO 검색만 수행. KIPRIS/EPO는 후속 adapter 확장"""
    ...

def node_agent3_examiner(state: PatentWorkflowState) -> dict:
    """검색 결과 기반 심사 의견 작성"""
    ...

def node_finalize(state: PatentWorkflowState) -> dict:
    """최종 발명신고서 확정"""
    ...

# --- 조건부 엣지 ---

def route_after_human_review(state: PatentWorkflowState) -> str:
    """human_review 노드 이후 다음 노드 결정"""
    phase = state["phase"]
    if phase == "discussion":
        if state["discussion_round"] >= state["max_discussion_rounds"] or state["agent1_status"] == "ready":
            return "gate_draft"
        return "agent2" if state["discussion_round"] % 2 == 0 else "agent1_respond"
    if phase == "examination":
        if state["examination_round"] >= state["max_examination_rounds"] or state["examiner_status"] == "approved":
            return "gate_final"
        return "agent3_examiner" if state["examination_round"] % 2 == 0 else "agent1_rebut"
    return "next_step"  # 기타 phase → 순차 진행

# --- 그래프 조립 ---

def build_patent_graph(checkpointer: SqliteSaver) -> StateGraph:
    graph = StateGraph(PatentWorkflowState)

    graph.add_node("agent0", node_agent0_structurer)
    graph.add_node("human_review", node_human_review)
    graph.add_node("agent1_draft", lambda s: node_agent1({**s, "phase": "draft"}))
    graph.add_node("agent2", node_agent2_expander)
    graph.add_node("agent1_respond", lambda s: node_agent1({**s, "phase": "respond"}))
    graph.add_node("agent3_query", node_agent3_query_generator)
    graph.add_node("patent_search", node_patent_search)
    graph.add_node("agent3_examiner", node_agent3_examiner)
    graph.add_node("agent1_rebut", lambda s: node_agent1({**s, "phase": "rebut"}))
    graph.add_node("finalize", node_finalize)

    graph.set_entry_point("agent0")
    graph.add_edge("agent0", "human_review")
    graph.add_edge("human_review", "agent1_draft")  # Phase 1 이후
    graph.add_conditional_edges("human_review", route_after_human_review)
    graph.add_edge("agent2", "human_review")
    graph.add_edge("agent1_respond", "human_review")
    graph.add_edge("agent1_draft", "human_review")
    graph.add_edge("agent3_query", "human_review")
    graph.add_edge("patent_search", "human_review")
    graph.add_edge("agent3_examiner", "human_review")
    graph.add_edge("agent1_rebut", "human_review")
    graph.add_edge("finalize", END)

    return graph.compile(
        checkpointer=checkpointer,
        interrupt_before=["human_review"]  # human_review 노드 직전에 항상 중단
    )
```

---

## 에이전트 구성 (4개)

### Agent 0 — 기술 구조 분석기 (Structurer)
- **LangGraph 노드**: `agent0`
- **역할**: 발명자의 자유 형식 아이디어를 구조화
- **출력**: `state.anchor_document` 업데이트
- **중요**: 이 문서가 이후 모든 에이전트의 기준(Anchor)이 됨. 발명자 의도를 확장하지 말고 정확하게 구조화만 할 것

### Agent 1 — 개발자·특허 전략가 (Developer)
- **LangGraph 노드**: `agent1_draft` / `agent1_respond` / `agent1_rebut` (동일 함수, `state.phase`로 역할 분기)
- **핵심 원칙**: 청구항이 먼저, 명세서는 청구항을 설명하는 문서
- **역할**:
  - `draft`: 독립청구항 먼저 확정 → 종속청구항 설계 → 발명신고서 초안
  - `respond`: Agent 2 제안 수용/거부 (Anchor Document 기준 게이트키퍼) + 문서 업데이트
  - `rebut`: Agent 3 거절이유 반박 + 청구항 실제 수정 (단순 반박 금지)
- **출력**: `state.patent_document` 업데이트 (매 턴마다)

### Agent 2 — 동료·확장가 (Expander)
- **LangGraph 노드**: `agent2`
- **역할**: 발명 가능성 극대화 (단, Agent 1 승인 없이 범위 확장 금지)
- **제안 분류**: `ORIGINAL` / `EXTENDED` / `NEW` 태깅 필수
- **출력**: `state.expander_suggestions` 업데이트

### Agent 3 — 심사관 (Examiner)
- **LangGraph 노드**: `agent3_query` (쿼리 생성) + `agent3_examiner` (심사)
- **역할**: 공격적 심사관. 착한 리뷰어가 아니라 특허청 심사관처럼 거절
- **수행 내용**:
  - 2단계 검색 쿼리 생성 → `patent_search` 노드에서 실제 API 호출
  - 검색 결과 기반 신규성·진보성 거절, 선행기술 결합 논리 제시
  - 실제 검색된 특허만 인용 (가상 특허 절대 금지, 최소 3건 인용 필수)
- **출력**: `state.examiner_objections` 업데이트

---

## 특허 DB 검색 전략 (Agent 3 핵심)

`agent3_query` 노드에서 LLM으로 쿼리를 생성하고(`state.search_queries` 저장), `patent_search` 노드에서 실제 API를 호출한다(`state.search_results` 저장). 두 노드 사이에 Human 인터럽트가 발생하므로 Human이 쿼리를 수정할 수 있다.

### 2단계 쿼리 생성

**1단계 — 개념 분해 및 쿼리 변환** (`agent3_query` 노드)

`state.anchor_document`를 기반으로:
1. 핵심 기술 구성요소 3~4개 추출
2. 각 구성요소를 특허 명세서 스타일 용어로 변환 (기능 동사 명사화)
3. 한국어 → 영어 기술 용어 병행 생성
4. 동의어/유사어 그룹 생성 (OR 묶음)
5. 구성요소 간 AND 조합으로 쿼리 3~5개 생성
6. 예상 IPC/CPC 코드 2~3개 추론

예시:
```
발명: "사용자 행동 패턴을 AI로 분석해 모바일 UI를 자동 재배치"

[A] "user behavior analysis" OR "usage pattern recognition"
[B] "adaptive layout" OR "dynamic interface reconfiguration"
[C] "machine learning" OR "neural network"

Q1: [A] AND [B]
Q2: [A] AND [C] AND "mobile interface"
Q3: "adaptive user interface" AND "behavior prediction"
IPC: G06F 3/0481, G06N 20/00
```

**2단계 — 결과 기반 쿼리 정제** (`agent3_examiner` 노드 진입 전)

`state.search_results`를 분석하여 실제 사용되는 특허 용어를 학습, 2차 정밀 쿼리 재생성. 이 과정 전체를 UI에 표시한다.

### 검색 API

**MVP에서는 USPTO PatentsView API만 실제 연동한다.** KIPRIS와 EPO는 같은 adapter 구조를 염두에 두고 후속 단계에서 붙인다.

백엔드에서 직접 호출하므로 CORS 문제 없음.

```
1순위(MVP): USPTO PatentsView API — 미국 특허 (완전 무료, 인증 불필요)
   Endpoint: https://api.patentsview.org/patents/query

2순위(후속): KIPRIS Plus API — 한국 특허
   Endpoint: https://plus.kipris.or.kr/openapi/rest/
   인증: 환경변수 KIPRIS_API_KEY

3순위(후속): EPO OPS — 유럽/PCT 특허 (OAuth, 선택적)
   Endpoint: https://ops.epo.org/3.2/rest-services/
```

MVP의 `patent_search` 노드는 USPTO 단일 호출로 시작한다. KIPRIS와 EPO는 이후 adapter 확장 시 추가한다.

---

## 워크플로우 (Phase 구조)

LangGraph 노드 실행 순서와 Human 인터럽트 지점:

```
[입력] 발명자 아이디어
   ↓
[node: agent0] AnchorDocument 생성
   ↓
[interrupt → human_review] 기본은 수동 진행, 설정 시 자동 계속
   ↓
[node: agent1_draft] 청구항 초안 + 발명신고서 초안
   ↓
[interrupt → human_review]
   ↓
[node: agent2] 확장 제안 (round N)
   ↓
[interrupt → human_review]
   ↓
[node: agent1_respond] 제안 수용/거부 + 문서 업데이트
   ↓
[interrupt → human_review]
   ↓ ← max_discussion_rounds 도달 또는 agent1_status=ready까지 반복
   ↓
[interrupt → human_review — 의무 게이트] Human 초안 승인 (필수)
   ↓
[node: agent3_query] 검색 쿼리 생성 → state.search_queries
   ↓
[interrupt → human_review] 쿼리 수정 가능
   ↓
[node: patent_search] USPTO 검색 → state.search_results
   ↓
[interrupt → human_review] 검색 결과 확인
   ↓
[node: agent3_examiner] 심사 의견 → state.examiner_objections
   ↓
[interrupt → human_review]
   ↓
[node: agent1_rebut] 반박 + 청구항 수정
   ↓
[interrupt → human_review]
   ↓ ← max_examination_rounds 또는 examiner_status=approved까지 반복
   ↓
[interrupt → human_review — 의무 게이트] Human 최종 승인 (필수)
   ↓
[node: finalize] 최종 발명신고서 확정
   ↓
[END]
```

---

## FastAPI 백엔드 API 설계

### 엔드포인트

```
POST   /sessions                              새 세션 생성, thread_id 반환
GET    /sessions                              세션 목록 조회
GET    /sessions/{thread_id}                  세션 현재 상태 조회
DELETE /sessions/{thread_id}                  세션 삭제

POST   /sessions/{thread_id}/start            아이디어 입력 + 그래프 실행 시작
POST   /sessions/{thread_id}/resume           Human 입력으로 interrupt 재개
POST   /sessions/{thread_id}/pause            실행 일시 중단
POST   /sessions/{thread_id}/rollback/{checkpoint_id}  특정 체크포인트로 롤백

GET    /sessions/{thread_id}/stream           SSE 스트리밍 (에이전트 응답 + 상태 이벤트)
GET    /sessions/{thread_id}/checkpoints      체크포인트 히스토리 목록

GET    /sessions/{thread_id}/export           세션 전체를 JSON 파일로 다운로드
POST   /sessions/import                       JSON 파일로 세션 복원

GET    /settings                              현재 설정 조회
PUT    /settings                              설정 저장 (API 키 포함, 서버 메모리 보관)
```

### SSE 이벤트 스키마

프론트엔드는 `/stream` 엔드포인트를 EventSource로 구독:

```python
# 에이전트 스트리밍 토큰
{"event": "token",         "data": {"agent_id": "agent1", "token": "청구항 1은..."}}

# 노드 실행 완료 + State 패치
{"event": "node_complete", "data": {"node": "agent1_draft", "state_patch": {...}}}

# Human 인터럽트 발생 (프론트엔드가 ActionBar 표시)
{"event": "interrupt",     "data": {"type": "review" | "gate", "phase": "...", "round": 1}}

# 체크포인트 저장 완료
{"event": "checkpoint",    "data": {"checkpoint_id": "...", "phase": "..."}}

# 에러
{"event": "error",         "data": {"message": "...", "recoverable": true}}
```

### `/resume` 요청 스키마

```python
class ResumeRequest(BaseModel):
    action: Literal["continue", "edit_and_continue", "pause", "approve", "reject"]
    directive: str = ""                  # Human 지시사항
    edited_document: dict | None = None  # Human이 편집한 문서 (편집 시만)
```

액션 의미:
- `continue`: 다음 노드로 그대로 진행
- `edit_and_continue`: Human 편집본을 반영하고 진행
- `pause`: 현재 상태를 저장한 채 종료
- `approve`: 의무 검토 게이트 승인
- `reject`: 의무 검토 게이트 반려 및 보완 지시
- 잘못된 조합은 `400 Bad Request`

---

## 세션 저장 / 불러오기 / 재개

### LangGraph 체크포인터 활용

**별도의 세션 직렬화 코드를 작성하지 않는다.** LangGraph SqliteSaver가 모든 상태를 자동으로 저장한다.

```python
from langgraph.checkpoint.sqlite import SqliteSaver

# 앱 시작 시 초기화
checkpointer = SqliteSaver.from_conn_string("./patent_sessions.db")
graph = build_patent_graph(checkpointer)

# 실행: thread_id로 세션 구분
config = {"configurable": {"thread_id": thread_id}}
async for chunk in graph.astream(input_state, config=config, stream_mode="updates"):
    # SSE로 프론트엔드에 전송
    ...

# 특정 체크포인트로 롤백
config = {"configurable": {"thread_id": thread_id, "checkpoint_id": target_checkpoint_id}}
graph.invoke(None, config=config)
```

### 세션 내보내기 / 가져오기

외부 파일로 저장하거나 다른 환경에서 재개할 때 사용. 파일 확장자: `.patent-session.json`

```python
# 내보내기: 체크포인터 DB에서 thread_id의 모든 체크포인트 추출
def export_session(thread_id: str) -> dict:
    checkpoints = list(checkpointer.list({"configurable": {"thread_id": thread_id}}))
    return {
        "meta": {
            "thread_id": thread_id,
            "exported_at": datetime.now().isoformat(),
            "schema_version": "1.0"
        },
        "settings_snapshot": get_settings_without_api_keys(),  # API 키 제외
        "checkpoints": [serialize_checkpoint(cp) for cp in checkpoints]
    }

# 가져오기: 새 thread_id로 체크포인트 복원
def import_session(session_data: dict) -> str:
    new_thread_id = str(uuid4())
    for cp in session_data["checkpoints"]:
        checkpointer.put(
            {"configurable": {"thread_id": new_thread_id}},
            deserialize_checkpoint(cp)
        )
    return new_thread_id
```

### 재개 지점 선택 UI

세션 불러오기 후 `GET /sessions/{thread_id}/checkpoints`로 히스토리를 받아 표시:

```
┌─────────────────────────────────────────────────────────────────┐
│  📋 세션 불러오기: "AI 기반 UI 재배치 시스템"                      │
│  마지막 저장: 2025-05-03 14:32                                   │
├─────────────────────────────────────────────────────────────────┤
│  재개할 지점을 선택하세요 (체크포인트 목록):                         │
│                                                                 │
│  ○ [cp_001] Phase 1  agent0 완료 — AnchorDocument 생성됨        │
│  ○ [cp_004] Phase 2  Round 2 — agent2 제안 완료                │
│  ● [cp_007] Phase 2  Round 3 — agent1_respond 완료  ← 최신     │
│  ○ [cp_010] Phase 3  agent3_query 완료                         │
│                                                                 │
│  선택한 체크포인트의 State(SharedDocument + 대화 로그)가 복원됩니다. │
│                                                                 │
│  [ 취소 ]                          [ 이 지점부터 재개 ▶ ]        │
└─────────────────────────────────────────────────────────────────┘
```

재개 시: `POST /sessions/{thread_id}/rollback/{checkpoint_id}` → `awaiting_human` 상태 진입 → Human이 수동으로 다음 단계 시작.

---

## Human 개입 메커니즘

### 매 에이전트 턴 후 인터럽트

LangGraph `interrupt_before=["human_review"]` 설정으로 `human_review` 노드 실행 전 그래프가 자동으로 멈춘다. 백엔드는 SSE `interrupt` 이벤트를 전송하고, 프론트엔드는 ActionBar를 표시한다.

```
┌──────────────────────────────────────────────────────────────────┐
│  🤖 agent1_draft가 완료되었습니다. (Phase 2-A, Round 1)           │
├──────────────────────────────────────────────────────────────────┤
│  [ ✏️ 문서 편집 후 다음 진행 ]  [ ▶ 다음 단계 ]  [ ⏸ 일시정지 ]  │
│  자동 진행: ○ OFF  ● ON  (5초 후 자동 진행)  [취소]               │
└──────────────────────────────────────────────────────────────────┘
```

**[ ✏️ 문서 편집 후 다음 진행 ]**: SharedDocPanel 편집 모드 활성화 → 완료 후 `POST /resume` (`action=edit_and_continue`, `edited_document={...}`)

**[ ▶ 다음 단계 ]**: `POST /resume` (`action=continue`)

**[ ⏸ 일시정지 ]**: `POST /resume` (`action=pause`) → SqliteSaver 자동 저장, 나중에 재개

**자동 진행 ON**: N초 카운트다운 후 자동으로 `continue` 전송. 의무 게이트(초안 승인, 최종 승인)에서는 무조건 중단하며 `approve` 또는 `reject`를 명시적으로 받아야 한다.

### 2가지 진행 모드

**수동 모드 (Manual, 기본값)**: 매 인터럽트마다 Human이 직접 버튼 클릭

**자동 진행 모드 (Auto-run)**: N초(설정 가능, 기본 5초) 대기 후 자동으로 `continue`. 의무 게이트에서는 강제 중단

### 단계 되돌리기

`POST /sessions/{thread_id}/rollback/{checkpoint_id}` → 해당 시점의 State 복원 → `awaiting_human` 상태 재진입. 이후 히스토리는 SqliteSaver에 보존되되 현재 진행에서 분기됨.

---

## 에이전트 시스템 프롬프트

### Agent 0 — Structurer

```
역할: 발명자의 자유 형식 아이디어를 특허 작성 가능한 구조로 분해한다.
이 문서는 이후 모든 에이전트의 기준(Anchor)이 된다.
발명자 의도를 확장하거나 변형하지 말고 정확하게 구조화만 할 것.

출력 JSON (코드블록 없이 순수 JSON):
{
  "summary": "발명의 핵심 한 문장 요약",
  "problem_solved": "해결하는 핵심 문제",
  "components": [{"name": "...", "description": "...", "essential": true}],
  "data_flow": "데이터/정보 흐름 설명",
  "system_boundary": "발명 범위 (포함/제외 명시)",
  "key_technologies": ["기술1"],
  "ipc_candidates": ["G06F 3/00"]
}
```

### Agent 1 — Developer

```
역할: 특허 전략가. 청구항 중심으로 발명신고서를 설계한다.
핵심 원칙: 청구항이 먼저, 명세서는 청구항을 뒷받침하는 문서다.

state.phase 값에 따라 역할 분기:
- "draft": 초기 청구항 + 발명신고서 초안 작성
- "respond": Agent 2 제안 수용/거부 + 문서 업데이트
- "rebut": Agent 3 거절이유 반박 + 청구항 실제 수정

오리지널 범위 수호:
- anchor_document를 항상 참조하여 범위 이탈 여부 판단
- 제안 수용 시 "왜 오리지널 범위 내인가" 명시
- 제안 거부 시 "왜 범위를 벗어나는가" 명시

심사 대응:
- 거절이유를 단순 반박하지 말고 청구항을 실제로 수정
- 선행기술과 차별화되는 기술 특징을 청구항 언어로 명시

출력 JSON:
{
  "message": "에이전트 메시지",
  "claims_independent": ["청구항 1 전문"],
  "claims_dependent": ["청구항 2 (청구항 1에 종속)"],
  "accepted_suggestions": [{"id": "s1", "reason": "수용 이유"}],
  "rejected_suggestions": [{"id": "s2", "reason": "거부 이유 (범위 이탈)"}],
  "patent_document": { /* 전체 발명신고서 섹션 */ },
  "status": "working" | "ready"
}
```

### Agent 2 — Expander

```
역할: 발명 가능성을 최대화하는 동료. Agent 1 승인 없이 범위 확장 금지.

제안 분류:
- "ORIGINAL": 오리지널 아이디어 내 구체화
- "EXTENDED": 오리지널 기반 확장 (Agent 1 판단 필요)
- "NEW": 새 방향 (거부 가능성 높음, 반드시 명시)

출력 JSON:
{
  "message": "동료 피드백 메시지",
  "suggestions": [
    {
      "id": "s1",
      "type": "ORIGINAL" | "EXTENDED" | "NEW",
      "category": "청구항확장" | "실시예추가" | "응용분야" | "우회방지" | "효과강화",
      "content": "제안 내용",
      "rationale": "제안 근거",
      "provenance_note": "오리지널의 어느 부분에서 파생되었는가"
    }
  ],
  "status": "suggesting" | "satisfied"
}
```

### Agent 3 — Examiner

```
역할: 공격적 심사관. 특허법 제29조 기준으로 엄격하게 거절한다.

[agent3_query 노드] 쿼리 생성 출력 JSON:
{
  "phase1_queries": [
    {"query": "검색 쿼리 문자열", "target_component": "대상 구성요소", "database": "KIPRIS" | "USPTO"}
  ],
  "ipc_codes": ["G06F 3/00"],
  "phase2_queries": []  // state.search_results 수신 후 채움
}

[agent3_examiner 노드] 심사 의견 출력 JSON:
{
  "message": "공식 심사 의견",
  "selected_prior_art": [
    {"patent_number": "KR10-2023-XXXXXXX", "title": "제목", "relevance": "관련성 설명"}
  ],
  "objections": [
    {
      "type": "신규성" | "진보성" | "기재불비" | "명확성",
      "target_claim": "청구항 1",
      "reason": "거절 이유 상세",
      "cited_patents": ["특허번호1", "특허번호2"],
      "combination_logic": "결합 논리 (진보성 거절 시)"
    }
  ],
  "requirements": ["보완 요구사항"],
  "status": "rejected" | "approved"
}

거절이유 원칙:
- 반드시 state.search_results에서 실제 검색된 특허만 인용 (가상 특허 절대 금지)
- 최소 3건 인용 후 심사 의견 완성
- 진보성: "선행기술 A(특허번호) + B(특허번호) 결합 시 통상의 기술자가 쉽게 도달 가능"
- 신규성: "선행기술 C(특허번호)에 청구항 1의 모든 구성요소가 개시되어 있음"
```

---

## 핵심 UI 요구사항

### 3패널 레이아웃

```
┌─────────────────────────────────────────────────────────────────┐
│  상단: Phase 진행 표시바 + 현재 노드 상태 + 세션 메뉴 + 설정 버튼  │
├──────────────┬──────────────────────┬───────────────────────────┤
│              │                      │                           │
│  에이전트    │   공유 작업 문서      │   발명신고서               │
│  대화 패널  │   (TipTap 에디터)     │   (실시간 업데이트)        │
│              │                      │                           │
│  SSE token  │  백엔드 State와      │  섹션별 표시               │
│  이벤트로   │  항상 동기화          │  변경 부분 하이라이트      │
│  실시간 표시│  Human 직접 편집 가능 │  체크포인트 타임라인       │
│              │  편집자 색상 구분    │  다운로드 버튼             │
│              │  (에이전트/Human)    │                           │
└──────────────┴──────────────────────┴───────────────────────────┘
│  하단: Human 액션 바 (SSE interrupt 이벤트 수신 시 표시)            │
└─────────────────────────────────────────────────────────────────┘
```

### 에이전트 대화 패널
- 에이전트별 색상: agent0(보라), agent1(파랑), agent2(초록), agent3(주황), Human(금색)
- SSE `token` 이벤트로 스트리밍 타이핑 효과 표시
- 각 메시지에 Phase, Round, 타임스탬프 표시
- Agent 2 제안은 `type` 배지(ORIGINAL/EXTENDED/NEW) + Agent 1 수용/거부 태그 시각화
- Agent 3 거절이유는 인용 특허 링크와 함께 카드 형태로 표시

### 공유 작업 문서 패널 (TipTap)
- SSE `node_complete` 이벤트의 `state_patch` 수신 시 자동 업데이트
- Human 편집 모드: interrupt 발생 시 또는 언제든 편집 활성화
- 에이전트 수정 → 파란 하이라이트, Human 수정 → 노란 하이라이트
- "편집 완료 → 에이전트에게 전달" 버튼: `POST /resume` (`action=edit_and_continue`)

### 발명신고서 패널
다음 섹션을 포함하며 각 섹션 옆에 "재생성" 버튼 제공:
1. 발명 명칭 / 2. 기술 분야 / 3. 배경 기술 / 4. 해결 과제 / 5. 과제 해결 수단
6. 발명 효과 / 7. 도면 설명 / 8. 실시를 위한 구체적 내용 / 9. 실시예
10. 청구항 (독립항 + 종속항) / 11. 선행기술 비교표 / 12. 요약서

---

## 설정 패널

우측 상단 설정 아이콘 클릭 시 사이드패널. 설정값은 `PUT /settings`로 백엔드에 전달.

### 에이전트별 모델 선택 (각 에이전트 독립 설정)

```
모델 옵션:
- Claude: claude-opus-4-5 / claude-sonnet-4-5 / claude-haiku-4-5
- OpenAI: gpt-4o / gpt-4o-mini / o1-mini
- Google: gemini-2.0-flash / gemini-1.5-pro

API 키 (실제 런타임은 `backend/.env`, 설정 패널 입력값은 서버 메모리 보관, 절대 프론트엔드 노출 금지):
- ANTHROPIC_API_KEY
- OPENAI_API_KEY
- GOOGLE_API_KEY
- KIPRIS_API_KEY
- EPO_CLIENT_ID / EPO_CLIENT_SECRET (선택)
```

### 워크플로우 파라미터

```
Agent 1 ↔ Agent 2 최대 피드백 라운드: 1~5 (기본 3)
Agent 1 ↔ Agent 3 최대 심사 라운드: 1~5 (기본 3)
특허 검색 결과 최대 건수: 10~50 (기본 20)
검색 DB: USPTO ☑ / KIPRIS ☐(후속) / EPO ☐(후속)
Human 인터럽트 자동 진행: OFF (기본) / ON
자동 진행 대기 시간: 3~10초 (기본 5초)
```

---

## 파일 구조

```
project/
├── backend/
│   ├── main.py                          # FastAPI 앱 엔트리포인트 + CORS 설정
│   ├── graph/
│   │   ├── state.py                     # PatentWorkflowState 정의
│   │   ├── nodes.py                     # 모든 LangGraph 노드 함수
│   │   ├── edges.py                     # 조건부 엣지 함수 (route_after_human_review 등)
│   │   └── builder.py                   # build_patent_graph() — 그래프 조립
│   ├── api/
│   │   ├── sessions.py                  # 세션 CRUD + rollback + export/import
│   │   ├── stream.py                    # SSE 스트리밍 엔드포인트
│   │   └── settings.py                  # 설정 관리
│   ├── agents/
│   │   ├── llm_router.py                # LLM provider 라우터 (Anthropic/OpenAI/Google)
│   │   └── prompts/
│   │       ├── agent0.py
│   │       ├── agent1.py
│   │       ├── agent2.py
│   │       └── agent3.py
│   ├── patent_search/
│   │   ├── kipris.py                    # KIPRIS API 클라이언트
│   │   ├── uspto.py                     # USPTO PatentsView 클라이언트
│   │   ├── epo.py                       # EPO OPS 클라이언트 (선택)
│   │   └── query_generator.py           # 2단계 쿼리 생성 로직
│   ├── session/
│   │   ├── checkpointer.py              # SqliteSaver 초기화
│   │   └── serializer.py                # 세션 파일 export/import
│   ├── .env                             # API 키 (gitignore)
│   ├── patent_sessions.db               # SqliteSaver DB (gitignore)
│   └── requirements.txt
│       # langgraph>=0.2, langchain-core, langchain-anthropic,
│       # langchain-openai, langchain-google-genai,
│       # fastapi, uvicorn[standard], httpx, python-dotenv
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── layout/
    │   │   │   ├── Header.tsx               # Phase 표시바 + 세션 메뉴
    │   │   │   └── ThreePanelLayout.tsx
    │   │   ├── panels/
    │   │   │   ├── ChatPanel.tsx            # SSE token 이벤트 수신 + 메시지 표시
    │   │   │   ├── SharedDocPanel.tsx       # TipTap + SSE node_complete 동기화
    │   │   │   └── PatentDocPanel.tsx       # 발명신고서 섹션 표시
    │   │   ├── agents/
    │   │   │   ├── AgentMessage.tsx
    │   │   │   ├── SuggestionCard.tsx       # Agent 2 제안 (type 배지 포함)
    │   │   │   ├── ObjectionCard.tsx        # Agent 3 거절이유 + 특허 링크
    │   │   │   └── SearchResultCard.tsx     # 특허 검색 결과
    │   │   ├── human/
    │   │   │   ├── ActionBar.tsx            # SSE interrupt 이벤트 시 표시 (핵심)
    │   │   │   ├── ReviewGate.tsx           # 의무 게이트 모달
    │   │   │   └── DirectiveInput.tsx       # Human 지시사항 입력
    │   │   ├── session/
    │   │   │   ├── SessionMenu.tsx          # 세션 저장/불러오기 드롭다운
    │   │   │   └── ResumePointPicker.tsx    # 체크포인트 선택 화면
    │   │   └── settings/
    │   │       └── SettingsPanel.tsx
    │   ├── stores/
    │   │   ├── uiStore.ts                   # UI 상태만 (패널 열림/닫힘 등)
    │   │   └── settingsStore.ts             # 설정값 (localStorage)
    │   └── lib/
    │       ├── apiClient.ts                 # FastAPI REST 호출
    │       ├── sseClient.ts                 # EventSource 연결 관리 + 자동 재연결
    │       └── documentExporter.ts          # DOCX/PDF 내보내기 (docx.js)
    └── package.json
```

---

## 추가 구현 요구사항

### 내보내기
- 발명신고서 DOCX 다운로드 (프론트엔드 docx.js)
- 세션 전체 JSON 내보내기 (`GET /sessions/{id}/export`)
- 검색된 선행특허 목록 CSV

### 성능
- LangGraph 노드 내 LLM 호출은 `langchain` `.astream()` 사용 → SSE `token` 이벤트로 전달
- `patent_search` 노드는 `asyncio.gather`로 병렬 실행
- SharedDoc 편집 자동 저장 debounce 500ms

### 에러 처리
- API 키 미설정 시 설정 패널로 유도 메시지
- 특허 DB 검색 실패 시 `state.search_results = []`로 진행 (그래프 중단 금지)
- LLM JSON 파싱 실패 시 최대 3회 재시도, 실패 시 원문을 대화 패널에 표시
- SSE 연결 끊김 시 EventSource 자동 재연결

---

## 구현 우선순위

Claude Code는 아래 순서로 구현할 것:

1. **백엔드 프로젝트 초기화** — FastAPI + LangGraph + uv 환경 세팅 + `.env` 구성
2. **LangGraph State 정의** — `PatentWorkflowState` (`graph/state.py`)
3. **그래프 스켈레톤** — 노드 stub + 조건부 엣지 + SqliteSaver 초기화 (`graph/builder.py`)
4. **FastAPI 기본 엔드포인트** — `/sessions` CRUD + `/stream` SSE 구조
5. **LLM 라우터** — Anthropic / OpenAI / Google 3개 provider 통합 (`agents/llm_router.py`)
6. **설정 API + 프론트엔드 설정 패널** — API 키 및 모델 선택
7. **Agent 0 + Agent 1 노드** — 실제 LLM 호출 구현
8. **Human 인터럽트 메커니즘** — `interrupt_before` + `POST /resume` 처리
9. **프론트엔드 기본 구조** — 3패널 레이아웃 + SSE 연결 (`sseClient.ts`) + ActionBar
10. **공유 문서 편집기** — TipTap + SSE `node_complete` 동기화
11. **세션 저장/불러오기** — 체크포인트 히스토리 API + ResumePointPicker UI
12. **Agent 2 노드** — 제안 루프
13. **특허 검색 모듈** — USPTO 클라이언트 우선 구현, KIPRIS/EPO adapter 자리 마련 (`patent_search/`)
14. **Agent 3 노드** — 쿼리 생성 + 검색 기반 심사
15. **의무 검토 게이트** — ReviewGate 모달 (초안 승인, 최종 승인)
16. **내보내기** — DOCX + 세션 JSON + 선행특허 CSV

---

## 주의사항

- **API 키는 `backend/.env` 파일에서 관리.** 프론트엔드로 절대 노출하지 말 것. `PUT /settings`로 입력된 키는 서버 메모리에만 보관
- **CORS**: 모든 LLM API와 특허 DB 호출은 백엔드에서 수행하므로 프론트엔드 CORS 문제 없음. FastAPI CORS 미들웨어로 프론트엔드 origin만 허용
- **SqliteSaver DB 파일** (`patent_sessions.db`)과 `.env`는 `.gitignore`에 추가
- **실행 중 상태의 유일한 원본은 SqliteSaver DB다.** 프로젝트 폴더의 JSON과 export 파일은 사용자 작업 공간/산출물이다
- **프로젝트 폴더는 File System Access API로 직접 연결한다.** 비지원 브라우저에는 제한 안내가 필요하다
- **MVP 검색 범위는 USPTO만 실제 호출한다.** KIPRIS/EPO는 후속 구현이다
- **LangGraph 버전**: `langgraph >= 0.2` 사용 (interrupt API 안정화 버전)
- **스트리밍과 interrupt**: `graph.astream()` with `stream_mode="updates"` 사용. interrupt 발생 시 스트림이 자연스럽게 종료됨을 확인하고 SSE 연결을 닫은 뒤 `interrupt` 이벤트를 별도로 전송할 것
- **Human directive 전달**: `POST /resume`의 `edited_document`와 `directive`는 LangGraph `Command(resume=...)` 패턴으로 그래프에 주입

# HISTORY.md — 발명신고 작성기 개발 기록

책 집필 및 블로그 게시글 작성을 위한 개발 과정 기록.
**최신 항목이 가장 위에 위치한다.**

---

## 2026-05-02 18:45 — LLM 스트리밍·초안 라우팅·논의 적합도·내보내기·대화 로그 비우기

**작업 내용**:
- **LLM SSE 스트리밍**: `invoke_llm_text`를 `astream` 기반으로 변경. 그래프 실행 중 `contextvars`로 `WorkflowRuntime.publish`에 연결해 `llm_stream_start` / `llm_chunk` 이벤트 송신. 액션바 `ActionBarLiveStream`에 실시간 청크 표시(`workflowStore`).
- **플로 라우팅(초안 우선)**: Agent 0 종료 시 `phase`를 `draft`로 두어, 첫 「다음 단계」가 `agent1_draft`(발명신고 구조 필드 채움)를 거친 뒤 `discussion`·Expander로 이어지도록 수정. 과거에는 `phase`가 바로 `discussion`이라 `agent1_draft`가 스킵되어 `patent_document`가 `draft`에만 몰리는 현상이 있었음.
- **초안 필드 분산**: `SYSTEM_PATENT_JSON` 초안 단계 규칙 강화, `normalize_patent_sections_after_draft_llm` 후처리, 사용자 텍스트 접미(첫 출력 `{`) 보강; `extract_*` 빈 본문 명시 오류.
- **논의 제안 적합도 0/1/2**: `merit_score`(배제·보완 유지·완전 채택)·`discussion_decisions` 저장, Agent 1/2 프롬프트 및 `SuggestionDecisionsPanel`·상세보기 표/탭·마크다운 부록 정리.
- **단계 이동(navigate) 400**: `navigation.py` 구조화 완료 판정을 `additional_kwargs.agent_id`·유의미한 `anchor_document`까지 인정해 직렬화 불일치 시 오류 완화. 프런트 API 에러 시 `detail` 본문을 알림에 포함.
- **발명신고 패널**: 요약/`draft` 표 분리·가운데 공유 문서와 **`draft` 동일 시 카드 미표시**·`?` 호버 안내 툴팁·Markdown/Word(`docx`)/**PDF 인쇄** 내보내기·`showSaveFilePicker` 사용자 취소(Abort) 무알림.
- **대화 로그 삭제**: `PATCH /sessions/{id}/state`에 `conversation_log` 허용. 채팅 패널 「지난 대화 비우기」확인 후 빈 배열 패치 및 `setCurrentSession`. (LangGraph 체크포인터 DB에는 이전 스레드 상태가 남을 수 있어, 재개 시 병합되는 경우는 후속 과제.)

**변경·참조 파일(요약)**:
`backend/agents/llm_runner.py`, `backend/runtime.py`, `backend/graph/nodes.py`, `backend/graph/patent_section_normalize.py`, `backend/graph/navigation.py`, `backend/api/models.py`, `backend/api/sessions.py`, `backend/agents/prompts/agent1.py`, `backend/agents/prompts/agent2.py`,
`frontend/src/lib/sseClient.ts`, `frontend/src/stores/workflowStore.ts`, `frontend/src/components/human/*.tsx`, `frontend/src/components/panels/ChatPanel.tsx`, `frontend/src/components/panels/PatentDocPanel.tsx`, `frontend/src/lib/patentExport.ts`, `frontend/src/lib/apiClient.ts`, `frontend/package.json`, `frontend/src/styles.css`, `CLAUDE.md`, `README.md`, `HISTORY.md`

---

## 2026-05-02 12:00 — 발명신고 패널·종료 UX·폴더 스냅샷 복구·패널 리사이즈·액션바 정리

**작업 내용**:
- **발명신고서 패널**: `PatentDocPanel`이 한글 레이블 키로 `patent_document`를 읽던 버그를 고쳐 `title`, `field`, `background`, `solution`, `claims_independent` 등 실제 필드와 매핑했다. **`Agent 1` LLM JSON 파싱 실패** 시 본문이 비어 있는 경우 **`anchor_document` + `raw_idea` 기반 초안 채우기** 폴백을 `node_agent1` 예외 처리에 추가했다.
- **워크플로 종료 후 UX**: 세션 상태가 `completed`/`error`일 때 「다음 단계」 버튼을 비활성화하고 회색 클래스(`action-bar-main--workflow-terminal`)로 표시, 문구는 「워크플로 종료됨」 등으로 분기.
- **프로젝트 폴더 복구**: 폴더 동기화 시 **`session-snapshot.json`** 에 전 세션(`thread_id`, `status`, `state`, `settings`) 저장. 「폴더 선택」 시 스냅샷 또는 예전 분할 파일(`project.json` 등) 조합 후 **`POST /sessions/restore_snapshot`** 으로 동일 `thread_id`로 서버 세션 재적재 후 다시 동기화. 백엔드는 **`merge_restore_state`** 로 누락 필드를 `initial_state` 로 보충하고 글로벌 설정과 에이전트 설정을 정렬한다.
- **레이아웃**: 채팅·공유 문서·발명신고 3패널 **드래그 스플리터**로 너비 조절, `localStorage` 저장·좁은 뷰에서 스플리터 숨김(이미 구현된 동작 반영 보고).
- **액션바**: 진행 중 **경과 시간**은 「진행 중…」 **버튼 라벨에만** 두고 중복 줄은 제거.

**변경·참조 파일**: `frontend/src/components/panels/PatentDocPanel.tsx`, `frontend/src/styles.css`, `backend/graph/nodes.py`, `frontend/src/components/human/ActionBar.tsx`, `frontend/src/lib/fileSystemAdapter.ts`, `frontend/src/lib/apiClient.ts`, `frontend/src/components/layout/Header.tsx`, `backend/api/sessions.py`, `backend/api/models.py`, `backend/api/session_store.py`, 나머지 플로/리본·`ThreePanelLayout` 관련 변경은 동일 기간 누적.

---

## 2026-05-01 17:40 — 작성 중단·플로 되돌리기·피드백루프 조기 이탈

**작업 내용**: 하단 액션바에서 자동 처리 구간 경과 시간을 표시하고, 백그라운드 플로가 길 때 `POST /sessions/{id}/cancel`로 실행을 끊을 수 있게 했다(`CancelledError` 시 체크포인트 상태로 복귀·SSE checkpoint). 사람 검토가 열린 동안 「확장 논의 생략 → 검색」「심사 대응 생략 → 종료」 버튼으로 `skip_discussion_to_search`/`skip_examination_to_finalize`를 `resume`에 실어 라운드를 다 채우지 않고 분기하게 했다(라우팅은 `edges.route_after_human_review`). 상단 리본 번호와 동일하게 `POST /sessions/{id}/navigate`(1–5 단계만, 구조화 직후는 상태 패치 불가 안내)·리본 과거 원 클릭·액션바 「이전 단계로」 모달에서 LangGraph `aupdate_state(..., as_node=human_review)`로 매크로 단계 상태를 재정렬한다(`backend/graph/navigation.py`).

**변경 파일(요약)**: `backend/runtime.py`, `backend/api/sessions.py`, `backend/api/models.py`, `backend/graph/edges.py`, `backend/graph/nodes.py`, `backend/graph/state.py`, `frontend/src/components/human/ActionBar.tsx`, `frontend/src/components/layout/WorkflowRibbon.tsx`, `frontend/src/components/layout/Header.tsx`, 프런트 API/`sessionNavigate`/스타일, `HISTORY.md`

---

## 2026-05-01 02:00 — README·CLAUDE 정합 및 집필 산출물 디렉터리 정리

**작업 내용**: README의 “구현 전” 서술을 실제 코드·검증 수준과 맞추고, `CLAUDE.md`에 문서 역할(규칙 기준 ↔ HISTORY ↔ screenshots/snippets ↔ README pointer)을 명문화했다. 스타일 스택 표기를 현재 레포 상태(글로벌 CSS, AsyncSqliteSaver)와 일치시켰다.

**정책**:
- 작업 규격의 기준은 `CLAUDE.md`
- 의미 있는 변경은 같은 파일에 정의된 형식으로 `HISTORY.md`에 기록
- 집필용 캡처·코드 조각은 `doc/screenshots/`, `doc/snippets/`에 보관하고 각 디렉터리에 안내 README 추가

**변경 파일**:
- `README.md`
- `CLAUDE.md`
- `doc/screenshots/README.md`
- `doc/snippets/README.md`
- `HISTORY.md`

---

## 2026-05-01 03:00 — `resume` 경로 검증 및 SSE `node_complete` 직렬화 수정

**작업 내용**: 첫 인터럽트 이후 `POST /sessions/{thread_id}/resume` (`action: continue`)으로 그래프를 재개했을 때 두 번째 `awaiting_human`까지 도달하는지 HTTP로 검증. 재개 직후 그래프는 정상 진행(agent2까지)했으나 SSE `publish` 단계에서 `state_patch`에 LangChain 메시지 객체가 섞여 `json.dumps`가 실패, 세션 상태가 `error`로 떨어지는 문제가 있었다.

**해결**: `WorkflowRuntime.publish`에서 페이로드 전체를 FastAPI `jsonable_encoder()`로 두 번 인코딩 가능한 형태로 만든 뒤 `json.dumps`하도록 변경.

**검증 결과**(로컬, `127.0.0.1`):
- `start` 후 `awaiting_human` (discussion, round 0)
- `resume` 후 다시 `awaiting_human` (discussion, round 1), 대화 로그에 `agent0` → `agent2` 반영 확인

**변경 파일**:
- `backend/runtime.py`
- `doc/snippets/runtime-publish-json-safe.md`
- `HISTORY.md`

---

## 2026-05-01 17:30 — taskkill 제거 (실행 차단 환경 대응)

일부 환경에서 `taskkill.exe` 자체가 “액세스가 거부되었습니다”로 막혀 fallback 단계만 오류를 냈다. 포트 점유 PID 종료와 WMI 로 `cmd` 래퍼만으로 충분하므로 **`taskkill` 호출 전부 제거**. `CommandLine` 매칭은 `*run-backend.cmd*` / `*run-frontend.cmd*` 단순 like 로 완화.

**변경 파일**: `scripts/free-dev-ports.ps1`, `HISTORY.md`

---

## 2026-05-01 17:15 — taskkill 실행 방식 수정 (Start-Process 접근 거부)

일부 PC에서 `Start-Process -FilePath taskkill.exe` 호출 시 “액세스가 거부되었습니다”가 났음. 호출 연산자 `&` 로 `System32\taskkill.exe` 를 직접 호출하도록 `free-dev-ports.ps1` 하단을 교체했다.

---

## 2026-05-01 17:00 — POST 시 API/UI 콘솔 자동 닫기

런처에서 키 입력 후 포트 종료 외에, `START "invention_writer …"` 로 띄운 **cmd 래퍼**를 명령줄 패턴 및 `taskkill` 창 제목으로 정리했다. 서버 명령은 `cmd /c` 로 바꿔 자연 종료 시 창도 사라지게 했다.

**변경 파일**:
- `scripts/free-dev-ports.ps1`
- `Start-InventionWriter.cmd`
- `Stop-InventionWriter.cmd`
- `README.md`
- `HISTORY.md`

---

## 2026-05-01 16:20 — free-dev-ports.ps1 `$pid` 자동 변수 충돌 수정

PowerShell에서는 `$PID`/`$pid` 가 **현재 셸 프로세스 ID**용 예약이라 대입 불가였고, 스크립트가 실패하면서 PRE 포트 비우기가 동작하지 않았다. 변수명을 `$owningPid` 로 바꿨다.

**변경 파일**: `scripts/free-dev-ports.ps1`, `HISTORY.md`

---

## 2026-05-01 16:00 — Start 배치 안에 PRE+POST 포트 정리 일원화

**작업 내용**: `Start-InventionWriter.cmd` 가 시작 전 포트 비우기**(PRE)** 외에, 테스트 후 사용자가 같은 창에서 키를 눌러 종료 확인하면 다시 같은 스크립트로 **(POST)** 정리까지 수행하도록 변경. 실행 흐름이 한 파일에서 끝나도록 했다.

**변경 파일**:
- `Start-InventionWriter.cmd`
- `README.md`
- `HISTORY.md`

---

## 2026-05-01 15:00 — dev 포트 점유 해제 + 종료 배치

**현상**: `Start-InventionWriter.cmd` 를 반복 실행하거나 예전 창을 닫지 않은 경우 **5173 / 8000** 이 이미 사용 중이라 Vite·Uvicorn이 바로 종료됨.

**조치**: `scripts/free-dev-ports.ps1` 로 두 포트의 **Listen** 소유 PID를 종료하고, 시작 배치에서 기동 전에 한 번 실행. 별도 **`Stop-InventionWriter.cmd`** 제공.

**변경 파일**:
- `Start-InventionWriter.cmd`
- `Stop-InventionWriter.cmd`
- `scripts/free-dev-ports.ps1`
- `README.md`
- `HISTORY.md`

---

## 2026-05-01 14:00 — 배치 렌처 괄호/인코딩 버그 수정

**현상**: `Start-InventionWriter.cmd` 안쪽 `if (...)` 블록에 **괄호가 들어간 `echo`(예: 시간 안내 문장)** 가 있어 CMD가 블록을 비정상 종료했고, UTF-8과 코드 페이지 차이로 한글 줄이 깨져 잘린 토큰(`to` 등)이 명령으로 실행되었다.

**조치**: 루트 배치 메시지는 **ASCII만** 사용. `start … cmd /k` 의 중첩 따옴표는 피하기 위해 **`scripts/run-backend.cmd`**, **`scripts/run-frontend.cmd`** 로 분리했다.

**변경 파일**:
- `Start-InventionWriter.cmd`
- `scripts/run-backend.cmd`
- `scripts/run-frontend.cmd`
- `README.md`
- `HISTORY.md`

---

## 2026-05-01 12:30 — 원클릭 로컬 실행 배치 추가

**작업 내용**: 과제 검증용으로 매번 명령을 치기 부담된다는 피드백에 맞춰, 저장소 루트 **`Start-InventionWriter.cmd`** 를 추가했다. 더블클릭 또는 바탕화면 바로가기만으로 `(1)` 백엔드 `uvicorn` 8000, `(2)` 프론트 `npm run dev` 5173, `(3)` 브라우저 열기까지 자동 처리한다. Python 의존성·`frontend/node_modules` 부재 시 1차 설치만 시도한다.

**변경 파일**:
- `Start-InventionWriter.cmd`
- `README.md`
- `HISTORY.md`

---

## 현재 상태 (2026-05-01 기준)

- 초기 구현 단계 진입
- 기준 설계 문서: `doc/prompt/patent-multiagent-claude-code-prompt.md`
- 문서 기준과 실제 저장소 구조 정합화 완료
- 구현 현황:
  - `backend/` + `frontend/` 스캐폴드 생성
  - `backend/.env`, `backend/.env.example` 체계 정리
  - FastAPI, LangGraph 상태/노드/라우터, React 3패널 UI 골격 생성
  - 세션 `start` / `resume` / `stream`와 런타임 큐 연결
  - 프런트에서 SSE 실구독, `start` 버튼, interrupt 상태 반영 연결
  - File System Access API 기반 프로젝트 폴더 선택 및 JSON 동기화 추가
  - LangGraph 1.x/AsyncSqliteSaver 호환 수정 후 `start → awaiting_human` 실제 검증 완료
  - **`resume`(continue) 이후 다음 턴 interrupt까지 백엔드 HTTP 검증 완료**(SSE 페이로드 직렬화 수정 포함)
- 아직 남은 핵심 작업:
  - 다회 `resume`(discussion 라운드·examination까지) 장시간 검증 및 프런트와의 표시 정합(E2E)
  - USPTO 실검색 구현
  - 프로젝트 폴더 복원/재연결 UX 고도화

---

## 2026-05-01 01:25 — LangGraph 1.x 호환 수정 및 실제 실행 검증

**작업 내용**: 설치된 LangGraph 1.x 기준으로 체크포인터/런타임 코드를 맞추고, 백엔드 `start` 호출이 실제로 첫 interrupt까지 도달하는지 검증.

**문제 해결 과정**:
- 초기 구현은 `langgraph.checkpoint.sqlite.SqliteSaver` 구버전 import와 생성 방식에 맞춰져 있어 서버 기동 단계에서 깨졌음
- 최신 버전에서는 `langgraph-checkpoint-sqlite` 별도 패키지와 `AsyncSqliteSaver`가 필요했고, 체크포인터 컨텍스트도 FastAPI lifespan 안에서 async로 열어야 했음
- 또한 `conversation_log`에 넣은 `agent` role이 LangChain 메시지 규약에 없어 그래프 실행이 실패했고, checkpoint 이벤트에 포함된 `Interrupt` / `AIMessage` 객체를 그대로 JSON 직렬화하려 해서 추가 오류가 발생했음

**주요 수정 사항**:
- `langgraph-checkpoint-sqlite` 패키지 설치
- `SqliteSaver` → `AsyncSqliteSaver` 전환
- 체크포인터 초기화를 FastAPI lifespan으로 이동
- `conversation_log` role을 `ai/system` 기준으로 정리
- runtime interrupt payload를 JSON-safe 구조로 직렬화
- 세션 직렬화에 `jsonable_encoder()` 적용

**검증 결과**:
- `GET /health` 정상 응답 확인
- `POST /sessions` 정상 응답 확인
- `POST /sessions/{thread_id}/start` 이후 세션 상태가 `error`가 아니라 `awaiting_human`으로 전이됨을 확인

**변경 파일**:
- `backend/main.py`
- `backend/session/checkpointer.py`
- `backend/graph/builder.py`
- `backend/graph/state.py`
- `backend/graph/nodes.py`
- `backend/runtime.py`
- `backend/api/session_store.py`
- `backend/requirements.txt`
- `HISTORY.md`

---

## 2026-05-01 01:00 — File System Access API 프로젝트 폴더 연결

**작업 내용**: 브라우저에서 프로젝트 폴더를 직접 선택하고, 세션 체크포인트를 로컬 JSON 파일로 동기화하는 흐름을 프런트엔드에 추가.

**주요 구현 사항**:
- `fileSystemAdapter.ts`를 추가해 `showDirectoryPicker()` 기반 폴더 선택과 JSON 파일 쓰기 로직을 캡슐화
- 워크플로우 스토어에 `fileSystemSupported`, `projectDirectory` 상태 추가
- Header에 `폴더 선택` 버튼과 연결 상태 표시 추가
- 폴더 선택 시 해당 폴더 이름으로 새 세션을 생성하고 `project.json` 등 기본 파일을 초기 동기화
- 체크포인트 SSE 이벤트 수신 시 `project.json`, `shared-document.json`, `patent-document.json`, `conversation-log.json`, `patent-search-cache.json`를 갱신

**중요한 코드/패턴**:

```ts
if (payload.session && projectDirectory) {
  void syncProjectWorkspace(projectDirectory.handle, payload.session);
}
```

이 패턴으로 세션의 source of truth는 여전히 백엔드 `SqliteSaver`에 두면서, 프런트는 체크포인트 단위로 프로젝트 폴더를 동기화하는 보조 저장 전략을 취했다.

**UI/UX 결정**:
- 폴더 연결 상태를 헤더에 상시 표시해 “현재 프로젝트가 로컬 작업공간에 연결되어 있는지”를 바로 확인할 수 있게 함
- 브라우저 미지원 환경은 버튼을 비활성화하고 상태 문구로 안내

**변경 파일**:
- `frontend/src/lib/fileSystemAdapter.ts`
- `frontend/src/components/layout/Header.tsx`
- `frontend/src/App.tsx`
- `frontend/src/stores/workflowStore.ts`
- `frontend/src/components/panels/SharedDocPanel.tsx`
- `frontend/src/types/index.ts`
- `HISTORY.md`

---

## 2026-05-01 00:40 — 프런트 세션 시작/SSE 인터럽트 연결

**작업 내용**: 프런트엔드에서 세션 시작 요청과 SSE 스트림을 실제로 연결하고, `interrupt` / `node_complete` / `checkpoint` 이벤트가 스토어와 액션바에 반영되도록 구성.

**주요 구현 사항**:
- `startSession()` API 추가 후 SharedDocPanel에서 아이디어 입력 → 세션 시작 버튼 연결
- `createSessionStream()`를 `checkpoint`, `interrupt`, `node_complete`, `error` 이벤트를 파싱하는 구조로 확장
- `workflowStore`에 `latestInterrupt`, `streamConnected`, `applyInterrupt`, `applyNodeComplete`, `applyCheckpoint` 추가
- `App.tsx`에서 세션 생성 후 자동으로 SSE 스트림 구독 시작
- `ActionBar`에서 현재 스트림 연결 상태와 interrupt phase/round를 표시하고, 게이트 인터럽트일 때만 `approve` / `reject` 버튼 노출

**중요한 코드/패턴**:

```ts
const source = createSessionStream(currentSession.thread_id, {
  onCheckpoint: applyCheckpoint,
  onInterrupt: applyInterrupt,
  onNodeComplete: applyNodeComplete,
  onError: () => setStreamConnected(false),
});
```

이 패턴으로 프런트는 세션별 EventSource를 열고, 각 SSE 이벤트를 스토어 갱신 함수에 직접 연결한다.

**UI/UX 결정**:
- 시작 액션은 공유 문서 패널 상단에 배치해 “아이디어 입력 → 시작” 흐름을 명확하게 함
- ActionBar에는 항상 기본 진행 버튼을 두되, `gate` 인터럽트일 때만 승인/반려를 노출해 일반 인터럽트와 의무 게이트를 구분

**변경 파일**:
- `frontend/src/App.tsx`
- `frontend/src/lib/apiClient.ts`
- `frontend/src/lib/sseClient.ts`
- `frontend/src/stores/workflowStore.ts`
- `frontend/src/components/panels/SharedDocPanel.tsx`
- `frontend/src/components/human/ActionBar.tsx`
- `frontend/src/types/index.ts`
- `HISTORY.md`

---

## 2026-05-01 00:20 — 백엔드/프론트엔드 스캐폴드 및 런타임 연결

**작업 내용**: 확정된 사양을 바탕으로 실제 코드베이스 골격을 생성하고, 백엔드 세션 API를 LangGraph 런타임/SSE 구조에 연결.

**주요 구현 사항**:
- `backend/`와 `frontend/` 디렉터리를 실제로 생성하고 루트 `.env`를 `backend/.env`로 이동
- FastAPI 앱 엔트리포인트, 세션/설정/스트림 라우터, LangGraph 상태/노드/엣지/빌더 추가
- 세션별 실행 태스크와 이벤트 큐를 관리하는 `WorkflowRuntime` 도입
- React + Vite 프런트엔드 스캐폴드, 3패널 레이아웃, ActionBar, SettingsPanel, Zustand 스토어 추가
- `backend/.env.example` 생성 후 문서 경로를 실제 구조에 맞게 수정

**중요한 코드/패턴**:

```python
class WorkflowRuntime:
    async def start_session(self, record: SessionRecord) -> None:
        await self._launch(record, record.state, is_resume=False)

    async def resume_session(self, record: SessionRecord, payload: dict[str, Any]) -> None:
        await self._launch(record, Command(resume=resume_payload), is_resume=True)
```

이 패턴으로 `start`는 초기 상태 입력으로, `resume`은 LangGraph `Command(resume=...)`로 같은 실행 엔진에 재주입되도록 통일했다.

**문제 해결 과정**:
- 초기 스캐폴드는 `start/resume/stream`가 고정 응답 수준이라 실제 워크플로우와 연결되지 않았음
- 이를 해결하기 위해 세션별 런타임 계층을 추가하고, SSE는 더미 이벤트 대신 런타임 큐를 구독하도록 변경
- `interrupt_before` 방식 대신 노드 내부 `interrupt()` 흐름에 맞추기 위해 그래프 compile 옵션도 조정

**UI/UX 결정**:
- 먼저 “보이는 구조”를 만드는 것이 중요하다고 판단해 에이전트 대화 / 공유 문서 / 발명신고서 3패널을 우선 배치
- Human 액션은 하단 고정 ActionBar에 모아 `continue`, `edit_and_continue`, `pause`, `approve`, `reject`를 한 자리에서 실험할 수 있게 함

**검증**:
- `python -m compileall backend` 통과

**변경 파일**:
- `backend/main.py`
- `backend/runtime.py`
- `backend/api/`
- `backend/graph/`
- `backend/session/`
- `backend/patent_search/`
- `frontend/package.json`
- `frontend/vite.config.ts`
- `frontend/src/`
- `README.md`
- `CLAUDE.md`
- `HISTORY.md`

---

## 2026-04-30 01:05 — 구현 전 핵심 사양 확정

**작업 내용**: 구현 착수 전에 남아 있던 정책 결정을 사용자와 함께 순차적으로 확정하고 문서에 반영.

**확정 사항**:
- 실제 환경변수는 `backend/.env`를 기준으로 사용
- LangGraph `SqliteSaver`가 실행 중 상태의 유일한 source of truth
- 저장소 구조는 처음부터 `backend/` + `frontend/` 분리
- Human interrupt는 설정형이며 기본값은 매 턴 정지
- 특허 검색 MVP는 USPTO만 실제 연동하고 KIPRIS/EPO는 후속 단계
- 프로젝트 폴더 기능은 MVP에 포함하며 브라우저 `File System Access API`를 사용
- `/resume`은 일반 인터럽트 액션과 게이트 액션을 모두 포함

**문서 반영 포인트**:
- 설계 문서에 MVP 범위와 source-of-truth 정책 명시
- `README.md`, `CLAUDE.md`에 `backend/.env`, `backend/.env.example`, 프로젝트 폴더 정책 반영
- 게이트 액션 `approve` / `reject`를 `/resume` 스키마에 반영

**변경 파일**:
- `doc/prompt/patent-multiagent-claude-code-prompt.md`
- `README.md`
- `CLAUDE.md`
- `HISTORY.md`

---

## 2026-04-30 00:20 — 저장소 문서/환경변수 규격 정합화

**작업 내용**: 새로 작성된 시스템 설계 문서를 기준으로 저장소 최상위 문서와 환경변수 예시를 일관되게 정리.

**주요 변경 사항**:
- `README.md`를 빈 상태에서 프로젝트 소개 문서로 확장
- `CLAUDE.md`의 환경변수 예시를 프론트엔드 `VITE_*` 방식에서 백엔드 전용 키 방식으로 변경
- 누락되어 있던 `.env.example` 파일 생성
- `.gitignore`에 `patent_sessions.db`와 일반적인 Python 캐시 경로 반영

**정리한 규칙**:
- API 키는 프론트엔드에 직접 주입하지 않고 백엔드 `.env`에서 관리
- 기준 키 이름은 `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `KIPRIS_API_KEY`, `EPO_CLIENT_ID`, `EPO_CLIENT_SECRET`
- 예상 프로젝트 구조는 `backend/` + `frontend/` 분리 형태를 기준으로 설명

**변경 파일**:
- `README.md`
- `CLAUDE.md`
- `HISTORY.md`
- `.gitignore`
- `.env.example`

---

## 현재 상태 (2026-04-29 기준)

- 기획 단계. 코드 구현 미시작.
- 시스템 설계 문서 완성: `doc/prompt/patent-multiagent-claude-code-prompt.md`
- 주요 설계 결정 사항:
  - 발명 하나 = 프로젝트 하나 (이름 기반 로컬 폴더로 저장)
  - 4 에이전트 순차 실행 (병렬 금지)
  - Human-in-the-loop: 매 에이전트 턴마다 개입 가능
  - 특허 검색: KIPRIS(한국) → USPTO(미국) → EPO(유럽) 우선순위
  - LLM: Anthropic / OpenAI / Google 멀티 프로바이더, 에이전트별 독립 선택

---

## 2026-04-29 14:00 — 프로젝트 관리 개념 설계

**작업 내용**: 발명신고 작성기에 "프로젝트" 개념 도입. 초기 프롬프트 문서를 업데이트.

**결정 사항**:
- 실제 발명신고 작성 세션의 단위 = **프로젝트** (발명 1건 = 프로젝트 1개)
- 새 프로젝트 생성 시: 이름 입력 UI → 해당 이름의 로컬 폴더 자동 생성 → 세션 시작
- 모든 중간/최종 결과물은 프로젝트 이름의 폴더에 저장
- 프로젝트 불러오기: OS 네이티브 **폴더 열기 다이얼로그**로 로컬 디스크 탐색

**저장 구조 설계**:

```text
<프로젝트명>/
├── project.json
├── shared-document.json
├── patent-document.json
├── conversation-log.json
├── patent-search-cache.json
├── snapshots/
├── exports/
└── human-edits.json
```

**기술 선택**: 브라우저 환경에서는 File System Access API(`window.showDirectoryPicker()`) 사용. Electron 전환 시 Node.js `fs` 모듈로 대체 가능한 구조를 목표로 `fileSystemAdapter.ts` 계층을 둔다.

**변경 파일**: `doc/prompt/patent-multiagent-claude-code-prompt.md`

---

## 2026-04-29 13:00 — 초기 프로젝트 문서 작성

**작업 내용**: 멀티 에이전트 특허 발명신고서 자동화 시스템 전체 설계를 문서화.

**핵심 설계 요약**:

1. **에이전트 순차 실행**: 병렬 대신 순차 실행을 기본 원칙으로 채택
2. **논쟁 기반 생성**: Agent 1과 Agent 2의 반복 피드백으로 청구항을 개선
3. **공격적 심사자**: Agent 3이 실제 검색 결과를 기반으로 거절 논리를 제시
4. **2단계 특허 검색**: 개념 분해 기반 쿼리 생성 후 검색 결과로 쿼리 정제
5. **Human-in-the-loop**: 모든 에이전트 턴 사이에서 검토와 편집 가능

**생성 파일**: `doc/prompt/patent-multiagent-claude-code-prompt.md`

---

## 2026-04-29 12:00 — 프로젝트 초기화

**작업 내용**: GitHub 저장소 생성 및 초기 커밋.

- 저장소: `invention_writer`
- 초기 커밋: `ac239b1 Initial commit`
- 당시에는 `README.md`만 존재

**개발 배경**: 완성 직무발명 신고서 프로세스를 AI로 자동화하려는 요구가 있었고, 단순 문서 템플릿이 아니라 에이전트 간 논쟁을 통해 더 강한 청구항을 도출하는 시스템을 목표로 설정.

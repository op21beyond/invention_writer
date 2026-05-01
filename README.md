# invention_writer

직무발명신고서 초안을 자동 생성하는 멀티 에이전트 기반 특허 작성 시스템 프로젝트입니다.

## 개요

발명 아이디어를 입력하면 4개의 AI 에이전트가 순차적으로 협업하며 문서를 발전시킵니다.

- `Agent 0 (Structurer)`: 아이디어를 Anchor Document로 구조화
- `Agent 1 (Developer)`: 청구항과 발명신고서 초안 작성
- `Agent 2 (Expander)`: 확장 아이디어와 보완 제안 생성
- `Agent 3 (Examiner)`: 특허 검색 결과를 바탕으로 심사 의견 제시
- `Human`: 각 턴 사이에서 검토, 편집, 승인

이 프로젝트의 핵심은 자율 에이전트 군집이 아니라, LangGraph 기반의 순차 워크플로우와 Human-in-the-loop 제어입니다.

## 현재 상태

**엔드투엔드 워크플로가 코드로 동작합니다.** 멀티 에이전트 루프, Human-in-the-loop, SSE 업데이트, 세션 REST API, 프로젝트 폴더 연동까지 연결되어 있습니다.

백엔드 기준 예시 검증 포인트(로컬):

- LangGraph **1.x**, `langgraph-checkpoint-sqlite` **AsyncSqliteSaver**, FastAPI lifespan
- `GET /health`, `POST /sessions`, `POST /sessions/{thread_id}/start`, `POST /sessions/{thread_id}/resume`
- 선택적: `POST /sessions/{thread_id}/cancel`, `POST /sessions/{thread_id}/navigate`, **`POST /sessions/restore_snapshot`** (폴더 스냅샷 재개)
- `PATCH /sessions/{thread_id}/state`: `patent_document`, `conversation_log`(빈 배열 등)·기타 상태 필드 일부 수정

SSE(`GET /sessions/{thread_id}/stream`): `checkpoint`, `interrupt`, `node_complete` 외 **`llm_stream_start`**, **`llm_chunk`**(LLM 토큰 청크) 이벤트.

프런트엔드(요약):

- 3패널(대화 · 공유 문서 · 발명신고서) **가로 스플리터**로 크기 조절, 넓이는 로컬에 저장
- 액션바: 다음 단계, **실행 중지**, 확장 논의/심사 **조기 분기**, **이전 단계**·리본에서 매크로 단계 이동, 종료 후 주 버튼 비활성(회색), 진행 중 **LLM 스트림** 한 줄 표시
- 에이전트 대화 패널: **「지난 대화 비우기」**로 서버 세션 `conversation_log` 삭제(`PATCH`)
- 논의(Developer 검토 시) 확장 제안 **적합도 0·1·2**·거절/보완 사유 입력
- 발명신고 패널: 필드별 표시(`abstract`/`draft` 분리)·공유 문서와 내용 동일하면 `draft` 카드 숨김·`docx` 패키지로 **Markdown/Word 저장**(파일 저장 대화상자), PDF는 브라우저 인쇄
- **폴더 선택** 시 `session-snapshot.json`(있으면) 또는 기존 분할 JSON으로 **마지막 세션 복구** 후 서버와 동기화

세부 기능·변경 순서는 [HISTORY.md](HISTORY.md)를 참고하세요.

문서 역할:

- 작업 규칙·기록 규격: [CLAUDE.md](CLAUDE.md)
- 개발 타임라인·문제 해결 기록: [HISTORY.md](HISTORY.md)
- 집필·블로그용 보조 산출물: [doc/screenshots/](doc/screenshots/README.md), [doc/snippets/](doc/snippets/README.md)
- 시스템 설계: [doc/prompt/patent-multiagent-claude-code-prompt.md](doc/prompt/patent-multiagent-claude-code-prompt.md)

## 아키텍처

- 백엔드: Python, FastAPI, LangGraph, SQLite 체크포인터(`AsyncSqliteSaver`)
- 프론트엔드: React, TypeScript, Vite, Zustand, TipTap, 글로벌 CSS(`frontend/src/styles.css`)
- 외부 연동(계획/부분): Anthropic, OpenAI, Google, USPTO(특허 검색 MVP)

MVP 기준:

- 실행 중 상태의 원본은 LangGraph SQLite 체크포인터 DB(브라우저와 별개)
- 검색은 백엔드 설정(KIPRIS/USPTO 등)에 따라 시도 가능; 키·쿼터 이슈는 로그 확인
- 프로젝트 폴더는 브라우저 **File System Access API**로 선택하며, 동기화 시 **`session-snapshot.json`**·`conversation-log.json` 등에 스냅샷 저장

저장소 구조는 `backend/`와 `frontend/` 분리 형태입니다.

## 로컬 실행 (더블클릭)

1. 프로젝트 폴더에서 **`Start-InventionWriter.cmd`** 를 더블클릭합니다. (실제 실행은 각각 **`scripts/run-backend.cmd`**, **`scripts/run-frontend.cmd`** 가 담당합니다.)
2. 첫 실행에서는 Python 패키지·`frontend/node_modules` 가 없으면 순서대로 설치를 시도합니다.
3. **API**·**프론트**는 제목에 `invention_writer` 가 붙은 CMD 창 두 개에서 뜹니다. 테스트를 **다 쓴 뒤**에는 **런처 창**(서버 시작 직후 영문으로 `Press any key...` 가 보이던, 제목 없는 CMD 창)으로 돌아가 **아무 키나 눌러** 종료를 확인하면 **POST** 단계에서 **`free-dev-ports.ps1`** 이 다시 돌며 **8000·5173** 을 점유하던 프로세스(백엔드·Vite)를 끝냅니다.
4. **브라우저 탭만 닫는 것은 여기서 말하는 “종료”가 아닙니다.** 탭을 닫아도 로컬 서버(Vite·API)는 계속 실행됩니다. 서버까지 끄려면 3번(런처 창에서 키 입력) 또는 **`Stop-InventionWriter.cmd`** 를 사용합니다.
5. 키로 POST를 거치면 **API/UI용 CMD 창도 같이 종료되도록**(포트 점유 해제 뒤 `run-backend`/`run-frontend` 래퍼·창 제목 기준 종료) 맞춰 두었습니다. Windows Terminal 탭처럼 **우리 런처가 연 창이 아닌 경우**에는 제외됩니다.

시작만 끌 때는 **`Stop-InventionWriter.cmd`** 로 포트 정리만 할 수도 있습니다.

브라우저가 **Edge** 로 열리는 이유는, `URL` 단독 실행 방식일 때 Windows **HTTP 기본 앱**(설정의 기본 브라우저) 을 쓰기 때문입니다. **`Start-InventionWriter.cmd`** 는 **Chrome 표준 설치 경로**가 있으면 그쪽으로 우선 실행하고, 없으면 기본 브라우저로 엽니다.

수동 실행: 프로젝트 루트에서 `python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`, `frontend` 에서 `npm run dev`.

`.cmd` 를 열었는데 PowerShell 이 스크립트를 그대로 읽으며 오류가 난다면, Windows에서 **파일 형식 연결이 깨졌을 수 있습니다.** 탐색기에서 해당 파일 우클릭 → **연결 프로그램** → **항상 명령 프롬프트(cmd)** 또는 **항상 선택한 앱을 사용하지 않도록** 초기화를 시도합니다.

## 환경 변수

API 키는 `backend/.env`에서 관리하며 프론트엔드 번들에 직접 넣지 않습니다.

예시 키 이름은 [backend/.env.example](backend/.env.example)를 보고, 실제 경로는 `backend/.env`를 사용합니다.

```env
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
KIPRIS_API_KEY=
EPO_CLIENT_ID=
EPO_CLIENT_SECRET=
```

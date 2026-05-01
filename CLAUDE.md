# CLAUDE.md — 발명신고 작성기 프로젝트 작업 지침

이 파일은 이 저장소에서 **작업 규격의 기준**이다. 사람·에이전트 모두 기능 구현만큼 문서 규격을 함께 지키는 것을 전제로 한다.

### 문서 간 역할

| 문서·경로 | 역할 |
|-----------|------|
| **본 파일 (`CLAUDE.md`)** | 환경·보안·구조 규칙, `HISTORY.md`·스크린샷·스니펫 **기록 정책의 정의** |
| **`HISTORY.md`** | 위 정책에 따라 시간순(최신 상단)으로 **주요 작업·결정·디버깅**을 적는 개발 로그 |
| **`doc/screenshots/`** | 책·블로그 집필용 **UI 결과물**(캡처). 파일명 규격은 아래 HISTORY 절 참고 |
| **`doc/snippets/`** | 집필용 **재사용 코드 조각**(파일 단위 보관 가능) |
| **`README.md`** | 저장소 입장 소개·현재 구현 상태 요약(pointer 역할) |
| **`doc/prompt/…`** | 제품 설계·시스템 프롬프트 원문 |

에이전트는 작업을 마칠 때 **본 파일의 HISTORY·스크린샷·스니펫 규칙**을 확인하고, 의미 있는 변경이면 `HISTORY.md`를 갱신한다. UI 변경이나 검증 결과를 글로 남길 때는 `doc/screenshots/`·`doc/snippets/` 활용을 우선 검토한다.

---

## 프로젝트 개요

멀티 에이전트 기반 **직무발명신고서 자동 생성 웹 애플리케이션**.
발명자가 아이디어를 입력하면 4개의 AI 에이전트(Structurer, Developer, Expander, Examiner)가
순차적으로 협업·논쟁·검증을 반복하며 발명신고서 초안을 생성한다.

상세 기획 및 시스템 설계: [doc/prompt/patent-multiagent-claude-code-prompt.md](doc/prompt/patent-multiagent-claude-code-prompt.md)

---

## 기술 스택

- **Backend**: Python 3.11+, FastAPI, LangGraph, SQLite 체크포인터(`AsyncSqliteSaver`, 패키지 `langgraph-checkpoint-sqlite`)
- **Frontend**: React + TypeScript + Vite
- **Styling**: 글로벌 CSS (`frontend/src/styles.css`). Tailwind는 미도입(필요 시 후속 도입 가능)
- **State**: Zustand (UI·워크플로 클라이언트 상태)
- **Editor**: TipTap
- **패키지 매니저**: 프런트는 npm(`package-lock.json` 기준); 백엔드는 pip + `requirements.txt`(uv/poetry도 가능)

---

## 환경 변수 관리 규칙

### `backend/.env` 파일 사용 (필수)

모든 API 키와 민감한 환경 변수는 반드시 `backend/.env` 파일에 저장한다.

`backend/.env` 파일 구조:

```env
# LLM API Keys
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...

# Patent DB API Keys
KIPRIS_API_KEY=...
EPO_CLIENT_ID=...
EPO_CLIENT_SECRET=...
```

API 키는 백엔드에서만 사용하며, 프론트엔드 번들에 직접 주입하지 않는다.
설정 패널을 통해 입력된 키도 서버 메모리 또는 백엔드 설정 레이어에서만 다룬다.

### 절대 금지 사항

- API 키를 소스 코드에 하드코딩하는 것은 절대 금지
- `.env` 파일을 git에 커밋하는 것은 절대 금지
- API 키를 `VITE_` 접두사로 프론트엔드에 노출하는 구성 금지
- `.gitignore`에 반드시 `.env`와 `patent_sessions.db` 포함 확인

### `backend/.env.example` 관리

`backend/.env.example` 파일을 항상 최신 상태로 유지한다. 실제 런타임 경로는 `backend/.env`를 기준으로 본다.

```env
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=
KIPRIS_API_KEY=
EPO_CLIENT_ID=
EPO_CLIENT_SECRET=
```

새 환경 변수를 추가할 때마다 `.env.example`도 함께 업데이트한다.

---

## 프로젝트(발명) 관리 개념

실제 발명신고서 작성 시 **발명 하나 = 프로젝트 하나**.

- **새 프로젝트**: UI에서 이름 입력 → 해당 이름의 로컬 폴더 생성 → 세션 시작
- **결과물 저장**: 모든 중간/최종 산출물은 프로젝트 이름의 폴더에 저장
- **프로젝트 불러오기**: 브라우저 `File System Access API` 기반 폴더 선택기로 로컬 폴더 연결
- **실행 중 원본 상태**(서버 프로세스): LangGraph SQLite 체크포인터 DB
- **프로젝트 폴더 역할**: export, 스냅샷, 메타데이터 보관. 동기화 시 **`session-snapshot.json`** 에 전 세션(`thread_id`, `state`, `settings` 등)을 기록하고, 같은 폴더를 다시 고르면 **`restore_snapshot`** 로 메모리 세션을 맞춤(체크포인트와 불일치 시 후속 과제 참고 가능)

프로젝트 설명 문서 규격:

- **상위 요약**: `README.md` — 저장소 들어오는 사람·집필용 포인터(구현 상태는 과장 없이 업데이트)
- **에이전트·사람 규격**: 본 파일 + `doc/prompt/…`
- **구현 타임라인·디버깅**: `HISTORY.md` 역순(최신 상단·타임스탬프)
- 기능/API가 바뀌면 같은 PR·작업 블록에서 위 세 종류 문서 중 해당하는 것을 함께 갱신하는 것을 권장한다.

---

## HISTORY.md 관리 규칙

작업 과정을 **책 집필 및 블로그 게시글 작성**을 목적으로 기록한다.

### 기록 원칙

- `HISTORY.md`는 가장 위에 최신 항목이 오도록 역순으로 작성한다
- 모든 항목에 **타임스탬프** (`YYYY-MM-DD HH:MM`)를 포함한다
- 의미 있는 작업 단위마다 기록을 추가한다

### 기록해야 할 내용

1. **주요 설계 결정** — 왜 그 방향을 선택했는지, 어떤 대안이 있었는지
2. **중요한 코드 스니펫** — 핵심 로직, 패턴, 트릭
3. **문제 해결 과정** — 발생한 문제, 시도한 해결책, 최종 해결 방법
4. **UI/UX 결정** — 화면 구성, 사용자 흐름 변경 이유
5. **외부 API 연동 경험** — 삽질 포인트, 주의사항

### 화면 캡처 저장

UI 변화가 있는 작업 후에는 스크린샷을 저장한다.

- 저장 위치: `doc/screenshots/YYYY-MM-DD-설명.png`
- HISTORY.md에서 상대 경로로 참조: `![설명](doc/screenshots/YYYY-MM-DD-설명.png)`
- 캡처 대상: 새 화면, 주요 UI 변경, 에러 상황, 완성된 기능 데모

### 코드 스니펫 저장

재사용 가치가 높거나 설명할 가치가 있는 코드는 별도 파일로도 저장한다.

- 저장 위치: `doc/snippets/설명.ts` 또는 해당 확장자
- HISTORY.md에서 인라인 코드 블록 또는 파일 링크로 참조

---

## 커밋 규칙

- 커밋 메시지는 한국어로 작성 가능
- 형식: `타입: 간결한 설명`
  - 타입: `feat`, `fix`, `refactor`, `docs`, `chore`
- 중요한 작업 후에는 `HISTORY.md`도 함께 업데이트하고 커밋

---

## 디렉터리 구조 (예정)

```text
invention_writer/
├── CLAUDE.md               # 이 파일 — Claude 작업 지침
├── HISTORY.md              # 작업 기록
├── README.md               # 프로젝트 소개
├── .gitignore
├── doc/
│   ├── prompt/             # 시스템 설계 문서
│   ├── screenshots/        # UI 스크린샷
│   └── snippets/           # 주요 코드 스니펫
├── backend/                # FastAPI + LangGraph 백엔드
│   ├── .env                # 런타임 환경 변수 (git 제외)
│   └── .env.example        # 환경 변수 예시 (git 포함)
└── frontend/               # React + Vite 프론트엔드
```

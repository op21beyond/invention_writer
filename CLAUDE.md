# CLAUDE.md — 발명신고 작성기 프로젝트 작업 지침

이 파일은 Claude Code가 이 프로젝트에서 작업할 때 항상 참조하는 지침서다.

---

## 프로젝트 개요

멀티 에이전트 기반 **직무발명신고서 자동 생성 웹 애플리케이션**.
발명자가 아이디어를 입력하면 4개의 AI 에이전트(Structurer, Developer, Expander, Examiner)가
순차적으로 협업·논쟁·검증을 반복하며 발명신고서 초안을 생성한다.

상세 기획 및 시스템 설계: [doc/prompt/patent-multiagent-claude-code-prompt.md](doc/prompt/patent-multiagent-claude-code-prompt.md)

---

## 기술 스택

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Editor**: TipTap 또는 CodeMirror 6
- **패키지 매니저**: pnpm

---

## 환경 변수 관리 규칙

### dotenv + .env 파일 사용 (필수)

모든 API 키와 민감한 환경 변수는 반드시 `.env` 파일에 저장한다.

```bash
# 패키지 설치
pnpm add dotenv
```

`.env` 파일 구조 (루트에 위치):

```env
# LLM API Keys
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_OPENAI_API_KEY=sk-...
VITE_GOOGLE_AI_API_KEY=AIza...

# Patent DB API Keys
VITE_KIPRIS_API_KEY=...
VITE_EPO_OPS_CLIENT_ID=...
VITE_EPO_OPS_CLIENT_SECRET=...
```

Vite 환경에서는 `VITE_` 접두사가 붙은 변수만 클라이언트에 노출된다.
코드에서 접근: `import.meta.env.VITE_ANTHROPIC_API_KEY`

### 절대 금지 사항

- API 키를 소스 코드에 하드코딩하는 것은 절대 금지
- `.env` 파일을 git에 커밋하는 것은 절대 금지
- `.gitignore`에 반드시 `.env` 포함 확인

### .env.example 관리

`.env.example` 파일을 항상 최신 상태로 유지한다 (실제 값 없이 키 이름만):

```env
VITE_ANTHROPIC_API_KEY=
VITE_OPENAI_API_KEY=
VITE_GOOGLE_AI_API_KEY=
VITE_KIPRIS_API_KEY=
VITE_EPO_OPS_CLIENT_ID=
VITE_EPO_OPS_CLIENT_SECRET=
```

새 환경 변수를 추가할 때마다 `.env.example`도 함께 업데이트한다.

---

## 프로젝트(발명) 관리 개념

실제 발명신고서 작성 시 **발명 하나 = 프로젝트 하나**.

- **새 프로젝트**: UI에서 이름 입력 → 해당 이름의 로컬 폴더 생성 → 세션 시작
- **결과물 저장**: 모든 중간/최종 산출물은 프로젝트 이름의 폴더에 저장
- **프로젝트 불러오기**: OS 네이티브 폴더 열기 UI로 로컬 디스크 탐색 후 열기

---

## HISTORY.md 관리 규칙

작업 과정을 **책 집필 및 블로그 게시글 작성**을 목적으로 기록한다.

### 기록 원칙

- `HISTORY.md`는 가장 위에 최신 항목이 오도록 역순으로 작성한다
- 모든 항목에 **타임스탬프** (YYYY-MM-DD HH:MM 형식) 포함
- 의미 있는 작업 단위마다 기록 추가 (커밋 단위가 아닌 작업 의미 단위)

### 기록해야 할 내용

1. **주요 설계 결정** — 왜 그 방향을 선택했는지, 어떤 대안이 있었는지
2. **중요한 코드 스니펫** — 핵심 로직, 패턴, 트릭 (마크다운 코드 블록으로)
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

- 저장 위치: `doc/snippets/설명.ts` (또는 해당 확장자)
- HISTORY.md에서 인라인 코드 블록 또는 파일 링크로 참조

---

## 커밋 규칙

- 커밋 메시지는 한국어로 작성 가능
- 형식: `타입: 간결한 설명`
  - 타입: `feat`, `fix`, `refactor`, `docs`, `chore`
- 중요한 작업 후에는 HISTORY.md도 함께 업데이트하고 커밋

---

## 디렉터리 구조 (예정)

```
invention_writer/
├── CLAUDE.md               # 이 파일 — Claude 작업 지침
├── HISTORY.md              # 작업 기록 (책/블로그 자료)
├── README.md               # 프로젝트 소개
├── .env                    # 환경 변수 (git 제외)
├── .env.example            # 환경 변수 예시 (git 포함)
├── .gitignore
├── doc/
│   ├── prompt/             # 시스템 설계 문서
│   ├── screenshots/        # UI 스크린샷
│   └── snippets/           # 주요 코드 스니펫
└── src/                    # 앱 소스 코드 (Vite + React)
```

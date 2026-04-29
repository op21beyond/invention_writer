# 멀티 에이전트 특허 발명신고서 자동화 시스템 — Claude Code 작업 지시서

---

## 프로젝트 개요

개발자가 발명 아이디어를 입력하면 여러 AI 에이전트가 역할을 나눠 협업·충돌·검증을 반복하면서 **직무발명신고서 초안**을 자동 생성하는 웹 애플리케이션을 만든다.

단순 문서 생성이 아니라 **논쟁 기반 특허 생성 시스템**이 핵심 콘셉트다. 사람(발명자)은 각 단계에서 에이전트 간 소통 문서를 읽고, 편집하고, 방향을 조정할 수 있다.

### 발명 = 프로젝트 개념

실제 발명신고 작성 세션의 단위를 **프로젝트**라 부른다. 하나의 발명이 곧 하나의 프로젝트다.

- **새 프로젝트 생성**: UI에서 프로젝트 이름을 입력하면 해당 이름의 로컬 폴더가 생성되고, 그 발명에 대한 신규 작성 세션이 시작된다.
- **모든 결과물 저장**: 에이전트가 생성하는 중간 산출물(공유 문서 스냅샷, 대화 로그, 특허 검색 결과)과 최종 발명신고서가 모두 그 **프로젝트 이름의 폴더**에 저장된다.
- **프로젝트 불러오기**: 로컬 디스크의 폴더를 탐색해서 열 수 있는 **폴더 열기 UI**를 통해 기존 프로젝트를 불러올 수 있다.

---

## 기술 스택

- **Frontend**: React + TypeScript + Vite
- **Styling**: Tailwind CSS
- **State**: Zustand
- **Editor**: CodeMirror 6 또는 TipTap (인라인 편집용)
- **API 호출**: 각 에이전트별 선택된 LLM API (Anthropic / OpenAI / Google Gemini)
- **특허 DB**: KIPRIS Plus API (한국), USPTO PatentsView API (미국), EPO OPS (선택)
- **패키지 매니저**: pnpm

---

## 아키텍처 원칙

### 에이전트 구성 (4개)

#### Agent 0 — 기술 구조 분석기 (Structurer)
- **역할**: 발명자의 자유 형식 아이디어를 구조화
- **입력**: 발명자의 자연어 아이디어
- **출력**: 구성요소 / 데이터 흐름 / 시스템 경계 / 핵심 기술 분해
- **중요**: 이 출력이 이후 모든 에이전트의 기준 문서(Anchor Document)가 됨

#### Agent 1 — 개발자·특허 전략가 (Developer)
- **역할**: 청구항 중심 설계자 + 오리지널 범위 수호자
- **핵심 원칙**: 청구항 먼저, 명세서는 청구항을 설명하는 문서
- **수행 내용**:
  - 독립청구항(Independent Claim) 먼저 확정
  - 종속청구항 설계
  - 발명의 보호 범위 정의
  - 필수 구성요소 vs 선택 구성요소 구분
  - Agent 2 제안의 수용/거부 결정 (게이트키퍼 역할 강화)
  - Agent 3(심사관) 거절이유에 대한 반박 논리 작성
- **출력**: 청구항 목록 + 전체 발명신고서 문서 (지속 업데이트)

#### Agent 2 — 동료·확장가 (Expander)
- **역할**: 발명의 가능성 극대화 (단, Agent 1 승인 필수)
- **수행 내용**:
  - 변형 실시예 다양화
  - 우회 설계(design-around) 방지 아이디어
  - 응용 분야 확장 제안
  - 아이디어 출처(provenance) 명시: 어느 제안이 오리지널인지 확장인지 태깅
- **제약**: 오리지널 아이디어의 본질을 벗어나는 제안은 Agent 1이 명시적으로 거부
- **출력**: 구조화된 제안 목록 (카테고리 + 근거 + 오리지널/확장 구분)

#### Agent 3 — 심사관 (Examiner)
- **역할**: 적대적 심사관. "착한 리뷰어"가 아니라 공격적 거절 전문가
- **수행 내용**:
  - **2단계 특허 검색 수행** (아래 검색 전략 참조)
  - 신규성 거절 (특허법 제29조 1항)
  - 진보성 거절 (특허법 제29조 2항): "통상의 기술자가 쉽게 발명할 수 있다"
  - 선행기술 결합 가능성 제시: "선행기술 A + B를 결합하면 본 발명과 동일"
  - 청구항 기재불비 지적
  - 실제 검색된 선행특허 인용 (가상 인용 금지)
- **중요**: 최소 3건의 실제 검색 결과를 인용해야 심사 의견 완성

---

## 특허 DB 검색 전략 (Agent 3 핵심)

### 2단계 쿼리 생성 프로세스

Agent 3는 심사 전 반드시 다음 순서로 검색을 수행해야 한다.

**1단계 — 개념 분해 및 쿼리 변환**

발명 내용을 받으면:
1. 핵심 기술 구성요소 3~4개 추출
2. 각 구성요소를 특허 명세서 스타일 용어로 변환
   - 기능 동사를 명사화: "분류한다" → "classification method"
   - 한국어 → 영어 기술 용어 병행 생성
3. 구성요소별 동의어/유사어 그룹 생성 (OR 묶음)
4. 구성요소 간 AND 조합으로 쿼리 3~5개 생성
5. 예상 IPC/CPC 코드 2~3개 추론

예시:
```
발명: "사용자 행동 패턴을 AI로 분석해 모바일 UI를 자동 재배치"

구성요소 분해:
- [A] 사용자 행동 분석: "user behavior analysis" OR "usage pattern recognition" OR "interaction history"
- [B] UI 자동 재배치: "adaptive layout" OR "dynamic interface reconfiguration" OR "personalized UI arrangement"
- [C] 머신러닝 적용: "machine learning" OR "neural network" OR "deep learning"

쿼리 조합:
- Q1: [A] AND [B] (핵심 조합)
- Q2: [A] AND [C] AND "mobile interface"
- Q3: "adaptive user interface" AND "behavior prediction"

IPC 코드: G06F 3/0481, G06N 20/00, H04W 88/02
```

**2단계 — 결과 기반 쿼리 정제**

1차 검색 결과(제목 + 초록 50건)를 분석해:
- 해당 기술 도메인에서 실제 사용되는 특허 용어 추출
- 추출한 용어로 2차 정밀 검색 쿼리 재생성
- 이 과정을 UI에서 사용자가 볼 수 있도록 표시

### 검색 API 우선순위

```
1순위: KIPRIS Plus API — 한국 특허 (발명자가 한국 회사 소속이므로 최우선)
   Endpoint: https://plus.kipris.or.kr/openapi/rest/
   인증: API Key (환경변수 KIPRIS_API_KEY)

2순위: USPTO PatentsView API — 미국 특허 (완전 무료, 인증 불필요)
   Endpoint: https://api.patentsview.org/patents/query

3순위: EPO OPS — 유럽/PCT 특허 (OAuth, 선택적 사용)
   Endpoint: https://ops.epo.org/3.2/rest-services/

검색 결과 형식:
- 특허번호, 제목, 출원일, 청구항 요약, 출원인
- 각 결과에 "유사도 분석" 코멘트 자동 생성
```

---

## 에이전트 순차 실행 원칙 (핵심 아키텍처)

### 문서 최신성 보장 규칙

에이전트는 절대 병렬로 실행하지 않는다. **반드시 순차 실행**이며, 다음 원칙을 엄수한다.

```
원칙 1: 단일 진행 포인터
  - 시스템은 언제나 "현재 실행 중인 에이전트가 하나"인 상태를 유지
  - 한 에이전트가 응답을 완료하고 SharedDocument를 업데이트하기 전까지
    다음 에이전트 호출은 절대 시작되지 않음

원칙 2: 항상 최신 SharedDocument 전달
  - 모든 에이전트 호출의 컨텍스트에는 반드시 그 시점의 최신 SharedDocument 전체가 포함됨
  - Human이 SharedDocument를 편집한 경우, 편집된 버전이 다음 에이전트에게 전달됨
  - "내가 마지막으로 본 문서"가 아닌 "지금 이 순간의 문서"를 기준으로 동작

원칙 3: 응답 완료 후 즉시 문서 갱신
  - 에이전트 응답 스트리밍이 완료되는 순간 SharedDocument 업데이트 실행
  - 업데이트 완료 후 UI에 "검토 대기" 상태 표시
  - Human 개입 여부와 무관하게 문서 갱신은 즉시 발생
```

### 상태 머신 구조

워크플로우 전체를 명확한 상태(State)로 모델링한다. `workflowStore`는 다음 상태 중 하나를 항상 유지한다.

```typescript
type WorkflowState =
  | { status: 'idle' }
  | { status: 'agent_running'; agentId: AgentId; phase: Phase; round: number }
  | { status: 'awaiting_human'; trigger: 'post_agent' | 'gate'; agentId: AgentId; phase: Phase; round: number }
  | { status: 'human_editing'; previousState: WorkflowState }
  | { status: 'paused' }   // Human이 "일시정지" 선택
  | { status: 'completed' }

// 상태 전이:
// idle → agent_running (시작)
// agent_running → awaiting_human (에이전트 응답 완료)
// awaiting_human → agent_running (Human이 "계속 진행" 선택)
// awaiting_human → human_editing (Human이 "편집" 선택)
// human_editing → awaiting_human (편집 완료)
// awaiting_human → paused (Human이 "일시정지")
// paused → agent_running (Human이 "재개")
```

---

## 워크플로우 (Phase 구조)

```
Phase 0: 아이디어 입력 (Human)
   ↓ [시작 버튼]
   ↓
Phase 1: 구조화 (Agent 0 실행)
   ↓ → SharedDocument 갱신
   ↓ → [Human 검토 인터럽트] ── 편집 후 수동 진행 OR 자동 계속
   ↓
Phase 2-A: Agent 1 초안 작성
   ↓ → SharedDocument 갱신 (청구항 + 발명신고서 초안)
   ↓ → [Human 검토 인터럽트]
   ↓
Phase 2-B: Agent 2 제안 (라운드 1~N)
   ↓ → SharedDocument 갱신 (제안 목록)
   ↓ → [Human 검토 인터럽트]
   ↓
Phase 2-C: Agent 1 응답 (수용/거부 + 문서 업데이트)
   ↓ → SharedDocument 갱신
   ↓ → [Human 검토 인터럽트]
   ↓ → (2-B로 반복 OR 최대 라운드 도달 시 다음)
   ↓
   ↓ [Human 검토 게이트 — 초안 승인 필수]
   ↓
Phase 3: Agent 3 검색 쿼리 생성
   ↓ → SharedDocument 갱신 (쿼리 목록)
   ↓ → [Human 검토 인터럽트 — 쿼리 수정 가능]
   ↓
Phase 3-A: 특허 DB 검색 실행
   ↓ → SharedDocument 갱신 (검색 결과)
   ↓ → [Human 검토 인터럽트 — 결과 확인 가능]
   ↓
Phase 3-B: Agent 3 심사 의견 작성
   ↓ → SharedDocument 갱신 (거절이유)
   ↓ → [Human 검토 인터럽트]
   ↓
Phase 3-C: Agent 1 반박 및 청구항 수정
   ↓ → SharedDocument 갱신
   ↓ → [Human 검토 인터럽트]
   ↓ → (3-B로 반복 OR 심사관 승인 OR 최대 라운드)
   ↓
   ↓ [Human 최종 승인 게이트]
   ↓
Phase 4: 최종 발명신고서 생성 + 저장 + 다운로드
```

---

## 핵심 UI 요구사항

### 3패널 레이아웃

```
┌─────────────────────────────────────────────────────────────┐
│  상단: 진행 단계 표시바 + 현재 에이전트 상태 + 설정 버튼        │
├──────────────┬──────────────────────┬───────────────────────┤
│              │                      │                       │
│  에이전트     │   공유 작업 문서      │   발명신고서           │
│  대화 패널   │   (편집 가능)         │   (실시간 업데이트)    │
│              │                      │                       │
│  - 각 에이전트│  - 에이전트들이 공유  │  - 섹션별 표시         │
│    발언 스트림│    하는 컨텍스트 문서  │  - 변경된 부분 하이라이트│
│  - Human 개입│  - Human이 직접 편집  │  - 버전 히스토리       │
│    입력창    │    가능               │  - 다운로드 버튼       │
│              │  - 편집하면 에이전트에 │                       │
│              │    즉시 반영됨        │                       │
└──────────────┴──────────────────────┴───────────────────────┘
│  하단: Human 액션 버튼 (승인 / 수정 요청 / 단계 되돌리기)        │
└─────────────────────────────────────────────────────────────┘
```

### 에이전트 대화 패널 세부 요구사항

- 각 에이전트는 고유 색상과 아이콘으로 구분
  - Agent 0 (Structurer): 보라색
  - Agent 1 (Developer): 파랑
  - Agent 2 (Expander): 초록
  - Agent 3 (Examiner): 주황/빨강
  - Human: 금색
- 각 발언에 타임스탬프, 라운드 번호 표시
- Agent 2의 제안 목록은 카드 형태로 표시, Agent 1의 수용/거부 태그 시각화
- Agent 3의 거절이유는 인용 특허와 함께 구조화 표시
- **스트리밍 응답 지원** (타이핑 효과로 실시간 표시)

### 공유 작업 문서 패널 (핵심)

에이전트들이 공유하는 "살아있는 문서"로, 모든 에이전트가 이 문서를 읽고 쓴다.

- **인라인 에디터**: TipTap 또는 CodeMirror 기반
- **편집 모드**: Human이 언제든 직접 편집 가능
- **편집 추적**: 에이전트가 수정한 부분은 색상 하이라이트, Human이 수정한 부분은 다른 색상
- **버전 히스토리**: 각 라운드별 스냅샷 보관, 이전 버전으로 롤백 가능
- **편집 → 에이전트 반영**: Human이 편집 후 "에이전트에게 전달" 버튼 클릭 시 다음 에이전트 호출에 수정된 내용 반영

공유 문서 구조:
```json
{
  "anchorDocument": {
    "components": [],
    "dataFlow": "",
    "systemBoundary": "",
    "keyTechnologies": []
  },
  "claims": {
    "independent": [],
    "dependent": []
  },
  "searchQueries": {
    "generated": [],
    "results": []
  },
  "agentNotes": {
    "agent1": "",
    "agent2": "",
    "agent3": ""
  },
  "humanDirectives": ""
}
```

### 발명신고서 패널

실시간으로 업데이트되는 최종 문서. 아래 섹션을 포함:

1. 발명 명칭
2. 기술 분야
3. 배경 기술 (종래 기술 및 문제점)
4. 해결하려는 과제
5. 과제 해결 수단 (발명의 구성)
6. 발명의 효과
7. 도면의 간단한 설명
8. 발명을 실시하기 위한 구체적인 내용
9. 실시예
10. 청구항 (독립항 + 종속항)
11. 선행기술과의 비교표 (검색 결과 기반)
12. 요약서

각 섹션 옆에 "이 섹션 재생성" 버튼 제공.

---

## 설정 패널 (Settings)

우측 상단 설정 아이콘 클릭 시 사이드패널 열림.

### 에이전트별 모델 선택

각 에이전트(0, 1, 2, 3)에 대해 독립적으로 설정:

```
모델 옵션:
- Claude: claude-opus-4-5 / claude-sonnet-4-5 / claude-haiku-4-5
- OpenAI: gpt-4o / gpt-4o-mini / o1-mini
- Google: gemini-2.0-flash / gemini-1.5-pro

API 키 입력:
- Anthropic API Key
- OpenAI API Key  
- Google AI API Key
- KIPRIS API Key
- EPA OPS Client ID / Secret (선택)

모두 localStorage에 저장 (세션 유지)
```

### 워크플로우 파라미터

```
Agent 1 ↔ Agent 2 최대 피드백 라운드: 1~5 (기본 3)
Agent 1 ↔ Agent 3 최대 심사 라운드: 1~5 (기본 3)
특허 검색 결과 최대 건수: 10~50 (기본 20)
검색 DB 선택: KIPRIS ☑ / USPTO ☑ / EPO ☐ (체크박스)
스트리밍 응답 사용: ON/OFF
자동 진행 vs 매 라운드 Human 확인: 토글
```

---

## 에이전트 시스템 프롬프트 설계

### Agent 0 — Structurer

```
역할: 발명자의 자유 형식 아이디어를 특허 작성 가능한 구조로 분해한다.

출력 JSON 형식:
{
  "summary": "발명의 핵심 한 문장 요약",
  "problemSolved": "해결하는 핵심 문제",
  "components": [
    {"name": "구성요소명", "description": "설명", "essential": true/false}
  ],
  "dataFlow": "데이터/정보 흐름 설명",
  "systemBoundary": "발명의 범위 (무엇이 포함되고 무엇이 제외되는가)",
  "keyTechnologies": ["기술1", "기술2"],
  "ipcCandidates": ["G06F 3/00", "G06N 20/00"],
  "originalityAssessment": "오리지널리티 초기 평가"
}

주의: 이 문서는 이후 모든 에이전트의 기준(Anchor)이 된다.
발명자의 의도를 확장하거나 변형하지 말고 정확하게 구조화만 할 것.
```

### Agent 1 — Developer

```
역할: 특허 전략가. 청구항 중심으로 발명신고서를 설계한다.
핵심 원칙: 청구항이 먼저고 명세서는 청구항을 뒷받침하는 문서다.

오리지널 범위 수호 원칙:
- Anchor Document를 항상 참조하여 제안이 범위를 벗어나는지 판단
- Agent 2의 제안을 수용할 때는 반드시 "왜 이 제안이 오리지널 범위 내에 있는가"를 명시
- 거부할 때는 "왜 이 제안이 범위를 벗어나는가"를 명시

심사관 대응 원칙:
- 거절이유를 단순 반박하지 말고 청구항을 실제로 수정하여 구별점 명확화
- 선행기술과 차별화되는 기술적 특징을 청구항 언어로 명시

출력 JSON 형식:
{
  "message": "에이전트 메시지",
  "claimsUpdate": {
    "independent": ["청구항 1 (독립항) 전문"],
    "dependent": ["청구항 2 (청구항 1에 종속)", "청구항 3 ..."]
  },
  "acceptedSuggestions": [{"id": "s1", "reason": "수용 이유"}],
  "rejectedSuggestions": [{"id": "s2", "reason": "거부 이유 (범위 이탈 등)"}],
  "documentUpdate": { /* 전체 발명신고서 JSON */ },
  "status": "working" | "ready"
}
```

### Agent 2 — Expander

```
역할: 발명의 가능성을 최대화하는 동료. Agent 1의 승인 없이 범위를 확장하지 않는다.

제안 분류 원칙:
- "ORIGINAL": 발명자의 오리지널 아이디어 내에서의 구체화
- "EXTENDED": 오리지널을 기반으로 한 확장 (Agent 1 판단 필요)
- "NEW": 새로운 방향 (Agent 1이 거부할 가능성 높음, 명시적 표시)

출력 JSON 형식:
{
  "message": "동료 피드백 메시지",
  "suggestions": [
    {
      "id": "s1",
      "type": "ORIGINAL" | "EXTENDED" | "NEW",
      "category": "청구항확장" | "실시예추가" | "응용분야" | "우회방지" | "효과강화",
      "content": "제안 내용",
      "rationale": "제안 근거",
      "provenanceNote": "오리지널 아이디어의 어느 부분에서 파생되었는가"
    }
  ],
  "status": "suggesting" | "satisfied"
}
```

### Agent 3 — Examiner

```
역할: 공격적 심사관. 친절한 리뷰가 아니라 실제 특허청 심사관처럼 거절한다.

심사 프로세스 (반드시 이 순서 준수):
1. 발명신고서의 독립청구항을 기준으로 핵심 기술 구성요소 파악
2. 2단계 쿼리 생성 (아래 형식 준수)
3. KIPRIS 및 USPTO API 검색 실행
4. 검색 결과 분석: 각 선행기술과 청구항 구성요소 1:1 매핑
5. 신규성·진보성 거절이유 작성 (실제 검색된 특허 인용)

쿼리 생성 형식:
{
  "phase1Queries": [
    {
      "query": "실제 검색 쿼리 문자열",
      "targetComponent": "이 쿼리가 검색하는 구성요소",
      "database": "KIPRIS" | "USPTO"
    }
  ],
  "ipcCodes": ["코드1", "코드2"],
  "phase2Queries": [] // 1차 결과 분석 후 채움
}

거절이유 작성 원칙:
- 반드시 실제 검색 결과에서 인용 (가상 특허 금지)
- 진보성 거절 시: "선행기술 A(특허번호)와 선행기술 B(특허번호)를 결합하면 통상의 기술자가 쉽게 도달 가능"
- 신규성 거절 시: "선행기술 C(특허번호)에 본 발명의 청구항 1의 모든 구성요소가 개시되어 있음"

출력 JSON 형식:
{
  "message": "공식 심사 의견",
  "searchProcess": {
    "phase1Queries": [...],
    "phase1ResultCount": 0,
    "phase2Queries": [...],
    "selectedPriorArt": [
      {
        "patentNumber": "KR10-2023-XXXXXXX",
        "title": "제목",
        "filingDate": "출원일",
        "relevance": "관련성 설명"
      }
    ]
  },
  "objections": [
    {
      "type": "신규성" | "진보성" | "기재불비" | "명확성",
      "targetClaim": "청구항 1",
      "reason": "거절 이유 상세",
      "citedPatents": ["특허번호1", "특허번호2"],
      "combinationLogic": "결합 논리 (진보성 거절 시)"
    }
  ],
  "requirements": ["보완 요구사항 1", "보완 요구사항 2"],
  "status": "rejected" | "approved"
}
```

---

## Human 개입 메커니즘

### 매 에이전트 응답 후 인터럽트 UI

에이전트가 응답을 완료하고 SharedDocument가 갱신될 때마다 하단에 **Human 액션 바**가 나타난다. 이것이 핵심이다 — 3개 게이트가 아니라 **매 에이전트 턴마다** Human에게 제어권이 돌아온다.

```
┌──────────────────────────────────────────────────────────────────┐
│  🤖 Agent 1이 응답을 완료했습니다.  SharedDocument가 업데이트되었습니다. │
│  Phase 2-A  Round 1/3                                           │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [ ✏️ 문서 편집 후 다음 진행 ]  [ ▶ 그냥 다음 단계 ]  [ ⏸ 일시정지 ] │
│                                                                  │
│  자동 진행 모드:  ○ OFF  ●ON  (ON이면 이 바가 3초 후 자동 닫힘)      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

**[ ✏️ 문서 편집 후 다음 진행 ]** 클릭 시:
- SharedDocPanel이 편집 모드로 전환
- Human이 공유 문서를 자유롭게 수정
- 추가 지시사항 입력창 표시 (다음 에이전트에게 전달할 텍스트)
- "편집 완료 → 다음 에이전트 호출" 버튼으로 진행
- 편집된 내용이 다음 에이전트의 컨텍스트에 반영됨

**[ ▶ 그냥 다음 단계 ]** 클릭 시:
- 즉시 다음 에이전트 호출
- 공유 문서는 현재 상태 그대로 전달

**[ ⏸ 일시정지 ]** 클릭 시:
- 워크플로우 `paused` 상태로 전환
- 현재 세션 자동 저장
- 나중에 돌아와서 재개 가능

**자동 진행 모드 ON** 시:
- 인터럽트 바가 3초 카운트다운 후 자동으로 "다음 단계" 실행
- 카운트다운 중 클릭하면 수동 모드로 전환
- 게이트(초안 승인, 최종 승인)에서는 자동 진행 무시 — 반드시 Human 확인 필요

### 2가지 진행 모드

**수동 모드 (Manual)**
- 매 에이전트 응답 후 Human이 직접 버튼을 눌러야 진행
- 내용을 꼼꼼히 검토하면서 방향을 조정하고 싶을 때 사용
- 기본값

**자동 진행 모드 (Auto-run)**
- 에이전트 응답 완료 후 N초 대기 후 자동으로 다음 단계 진행
- 대기 시간 설정 가능 (1~10초)
- Human은 언제든지 개입 가능 (카운트다운 중 클릭)
- 의무 게이트(초안 승인, 최종 승인)에서는 항상 중단

### 단계 되돌리기 (Rollback)

상단 진행 표시바의 각 Phase를 클릭하면 해당 시점의 스냅샷으로 롤백 가능.

- 롤백 시 그 이후 에이전트 대화와 문서 변경은 히스토리에 보존 (삭제 아님)
- "현재 브랜치"와 "롤백 브랜치"를 구분하여 표시
- 롤백 확인 다이얼로그에서 "이 지점부터 다시 시작"만 선택 가능

---

## API 통합 모듈

### LLM 라우터 모듈 (`src/lib/llmRouter.ts`)

```typescript
interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'google';
  model: string;
  apiKey: string;
}

interface AgentConfig {
  agent0: LLMConfig;
  agent1: LLMConfig;
  agent2: LLMConfig;
  agent3: LLMConfig;
}

// 각 에이전트별 독립적인 LLM 호출
// 스트리밍 응답 지원
// JSON 파싱 실패 시 재시도 로직 (최대 3회)
// 에러 핸들링: rate limit, network error, invalid JSON
```

### 특허 검색 모듈 (`src/lib/patentSearch.ts`)

```typescript
interface PatentSearchResult {
  patentNumber: string;
  title: string;
  abstract: string;
  claims: string[];
  filingDate: string;
  assignee: string;
  inventors: string[];
  database: 'KIPRIS' | 'USPTO' | 'EPO';
  url: string;
}

// KIPRIS API 래퍼
// USPTO PatentsView API 래퍼  
// EPO OPS API 래퍼 (선택)
// 결과 통합 및 중복 제거
// 유사도 점수 계산 (단순 키워드 오버랩 기반)
```

---

## 파일 구조

```
src/
├── components/
│   ├── layout/
│   │   ├── Header.tsx               # 진행 단계 표시바 + 세션 드롭다운
│   │   └── ThreePanelLayout.tsx     # 3패널 레이아웃
│   ├── panels/
│   │   ├── ChatPanel.tsx            # 에이전트 대화
│   │   ├── SharedDocPanel.tsx       # 공유 작업 문서 (편집 가능)
│   │   └── PatentDocPanel.tsx       # 발명신고서 (읽기 + 다운로드)
│   ├── agents/
│   │   ├── AgentMessage.tsx         # 에이전트 발언 카드
│   │   ├── SuggestionCard.tsx       # Agent 2 제안 카드
│   │   ├── ObjectionCard.tsx        # Agent 3 거절이유 카드
│   │   └── SearchResultCard.tsx     # 특허 검색 결과 카드
│   ├── human/
│   │   ├── ActionBar.tsx            # 매 에이전트 턴 후 Human 액션 바 (핵심)
│   │   ├── ReviewGate.tsx           # 의무 검토 게이트 (초안 승인, 최종 승인)
│   │   ├── DirectiveInput.tsx       # Human 지시 입력
│   │   └── RollbackConfirm.tsx      # 단계 되돌리기 확인 다이얼로그
│   ├── project/
│   │   ├── HomeScreen.tsx           # 앱 시작 화면 — 새 프로젝트 / 불러오기 / 최근 목록
│   │   ├── NewProjectDialog.tsx     # 새 프로젝트 생성 다이얼로그 (이름 입력 + 저장 위치 선택)
│   │   ├── ProjectManager.tsx       # 헤더 프로젝트 드롭다운 (저장/열기/초기화)
│   │   └── ResumePointPicker.tsx    # 프로젝트 불러오기 후 재개 지점 선택 화면
│   └── settings/
│       └── SettingsPanel.tsx        # 모델/API 키/파라미터 설정
├── stores/
│   ├── workflowStore.ts             # 상태 머신 (WorkflowState) + 순차 실행 제어
│   ├── documentStore.ts             # SharedDocument + 버전 히스토리
│   ├── conversationStore.ts         # 에이전트 대화 로그
│   ├── projectStore.ts              # 프로젝트 저장/불러오기/자동저장 (폴더 기반)
│   └── settingsStore.ts             # 설정값 (localStorage 동기화)
├── lib/
│   ├── llmRouter.ts                 # LLM API 라우터 (3개 provider)
│   ├── patentSearch.ts              # 특허 DB 검색 모듈
│   ├── queryGenerator.ts            # 2단계 쿼리 생성 로직
│   ├── projectSerializer.ts         # 프로젝트 직렬화/역직렬화 (폴더 ↔ 메모리)
│   ├── fileSystemAdapter.ts        # File System Access API / Electron fs 추상화
│   └── documentExporter.ts         # DOCX/PDF 내보내기
└── prompts/
    ├── agent0.ts                    # Structurer 시스템 프롬프트
    ├── agent1.ts                    # Developer 시스템 프롬프트
    ├── agent2.ts                    # Expander 시스템 프롬프트
    └── agent3.ts                    # Examiner 시스템 프롬프트
```

---

## 프로젝트 저장 / 불러오기 / 재개 기능

### 프로젝트 폴더 구조

각 프로젝트는 **프로젝트 이름의 로컬 폴더** 아래에 모든 파일을 저장한다.

```
<프로젝트명>/
├── project.json               # 프로젝트 메타 + 현재 워크플로우 상태 (최신본)
├── shared-document.json       # 공유 작업 문서 현재 최신본
├── patent-document.json       # 발명신고서 현재 최신본
├── conversation-log.json      # 에이전트 전체 대화 로그
├── patent-search-cache.json   # 특허 검색 결과 캐시
├── snapshots/                 # 라운드별 자동 스냅샷
│   ├── phase1-agent0.json
│   ├── phase2-round1-agent1.json
│   └── ...
├── exports/                   # 사용자가 내보낸 파일
│   ├── patent-draft.docx
│   ├── conversation-log.json
│   └── prior-art.csv
└── human-edits.json           # Human 편집 이력
```

> **Frontend 구현 참고**: 브라우저에서 로컬 폴더에 파일을 읽고 쓰려면 **File System Access API** (`window.showDirectoryPicker()`)를 사용한다. 새 프로젝트 생성 시 디렉터리 피커로 저장 위치를 선택하고, 불러오기 시에도 동일한 API로 폴더를 선택한다. Electron 기반 데스크탑 앱으로 전환할 경우 Node.js `fs` 모듈을 사용한다.

### 프로젝트 세션 파일 스펙 (`project.json`)

워크플로우 전체 상태를 직렬화한다. 에이전트 대화·문서·검색 결과 등 대용량 데이터는 별도 파일에 분리 저장하고 이 파일에서는 경로만 참조한다.

```typescript
interface PatentProject {
  // 메타데이터
  meta: {
    projectId: string;           // UUID
    projectName: string;         // 프로젝트(발명) 이름 — 폴더명과 동일
    createdAt: string;           // ISO 8601
    lastSavedAt: string;
    schemaVersion: string;       // "1.0" — 향후 마이그레이션 대비
  };

  // 설정 스냅샷 (저장 시점의 모델/파라미터 — API 키는 제외)
  settings: Omit<Settings, 'apiKeys'>;

  // 현재 워크플로우 상태
  workflow: {
    currentPhase: Phase;
    currentRound: number;
    status: WorkflowState['status'];
    completedPhases: Phase[];
  };

  // 대용량 데이터는 프로젝트 폴더 내 별도 파일 참조
  files: {
    sharedDocument: 'shared-document.json';
    patentDocument: 'patent-document.json';
    conversationLog: 'conversation-log.json';
    patentSearchCache: 'patent-search-cache.json';
    humanEdits: 'human-edits.json';
    snapshots: 'snapshots/';
  };
}

// conversation-log.json 내 각 항목
interface ConversationEntry {
  id: string;
  agentId: AgentId | 'human' | 'system';
  phase: Phase;
  round: number;
  timestamp: string;
  content: string;             // 원문 텍스트
  parsedData?: object;         // 파싱된 JSON (있을 경우)
  metadata?: object;           // 수용/거부 목록, 특허 인용 등
}

// snapshots/ 내 각 스냅샷 파일
interface DocumentSnapshot {
  snapshotId: string;
  phase: Phase;
  round: number;
  agentId: AgentId | 'human';
  timestamp: string;
  document: SharedDocument;
  changeDescription: string;
}

// human-edits.json 내 각 항목
interface HumanEdit {
  timestamp: string;
  phase: Phase;
  beforeContent: string;
  afterContent: string;
  directive: string;           // Human이 입력한 지시사항
}
```

### 자동 저장

- 에이전트 응답 완료 후 SharedDocument 갱신 시마다 자동 저장
- 저장 위치: 프로젝트 폴더 내 해당 파일 (`shared-document.json`, `conversation-log.json` 등)
- 동시에 `project.json`의 `lastSavedAt` 갱신
- `localStorage`에는 최근 열었던 프로젝트 폴더 경로 목록만 보관 (키: `recent_projects`)

### UI — 프로젝트 관리 화면

#### 홈 화면 / 프로젝트 선택 화면

앱 최초 실행 또는 프로젝트 전환 시 표시되는 시작 화면:

```
┌──────────────────────────────────────────────────────────┐
│                  발명신고 작성기                           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│   [ + 새 프로젝트 (발명) 시작 ]                           │
│                                                          │
│   [ 📂 프로젝트 폴더 열기 ]                               │
│                                                          │
│   최근 프로젝트 ────────────────────────────────────      │
│     📁 AI 기반 UI 재배치 시스템   2025-05-03 14:32        │
│     📁 스마트 캐싱 발명           2025-04-28 09:11        │
│     📁 멀티센서 융합 알고리즘     2025-04-20 17:45        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

#### 새 프로젝트 생성 UI

"새 프로젝트 시작" 클릭 시 표시되는 다이얼로그:

```
┌─────────────────────────────────────────────────┐
│  새 발명 프로젝트 만들기                           │
├─────────────────────────────────────────────────┤
│                                                 │
│  프로젝트 이름 (발명 제목)                        │
│  ┌───────────────────────────────────────────┐  │
│  │ AI 기반 UI 자동 재배치 시스템               │  │
│  └───────────────────────────────────────────┘  │
│                                                 │
│  저장 위치                                       │
│  ┌──────────────────────────────┐ [ 변경... ]   │
│  │ C:\Patents\AI-UI-Rearrange  │               │
│  └──────────────────────────────┘               │
│  (폴더가 없으면 자동 생성됩니다)                  │
│                                                 │
│  [ 취소 ]           [ 프로젝트 생성 및 시작 ▶ ]  │
└─────────────────────────────────────────────────┘
```

- "저장 위치 변경" 클릭 시 OS 네이티브 폴더 선택 다이얼로그 표시 (`showDirectoryPicker()` 또는 Electron `dialog.showOpenDialog`)
- 확인 후 지정 위치에 `<프로젝트명>/` 폴더 생성 → 세션 시작

#### 프로젝트 불러오기 UI

"프로젝트 폴더 열기" 클릭 시 OS 네이티브 **폴더 열기 다이얼로그**가 열린다.

- 로컬 디스크 탐색 후 프로젝트 폴더(예: `AI-UI-Rearrange/`)를 선택
- 선택된 폴더 내 `project.json` 존재 여부 확인 → 유효한 프로젝트면 불러오기 진행
- 유효하지 않은 폴더 선택 시 안내 메시지 표시

```
┌─────────────────────────────────────────────────────────────────┐
│  폴더가 유효한 발명 프로젝트가 아닙니다.                           │
│  project.json 파일이 없습니다. 올바른 프로젝트 폴더를 선택하세요.  │
└─────────────────────────────────────────────────────────────────┘
```

#### 헤더 — 프로젝트 드롭다운

작업 중 헤더 좌측에 현재 프로젝트명이 표시되며, 클릭 시 드롭다운:

```
┌─────────────────────────────────────┐
│  📁 AI 기반 UI 재배치 시스템  ▼      │
├─────────────────────────────────────┤
│  💾 지금 저장                        │
│  📂 다른 프로젝트 열기               │
│  + 새 프로젝트 만들기                │
│  🗑 현재 프로젝트 초기화              │
└─────────────────────────────────────┘
```

### 프로젝트 불러오기 후 재개 UI

프로젝트 폴더를 불러오면 **재개 지점 선택 화면**이 표시된다.

```
┌────────────────────────────────────────────────────────────────┐
│  📋 프로젝트 불러오기: "AI 기반 UI 재배치 시스템"                 │
│  마지막 저장: 2025-05-03 14:32                                  │
├────────────────────────────────────────────────────────────────┤
│  재개할 지점을 선택하세요:                                        │
│                                                                │
│  ○ Phase 1  Agent 0 완료 — Anchor Document 생성됨              │
│  ○ Phase 2  Round 2/3 — Agent 1 응답 완료, Agent 2 대기 중     │
│  ● Phase 2  Round 3/3 — Agent 2 응답 완료 ← 마지막 저장 지점   │
│  ○ Phase 3  검색 쿼리 생성됨                                    │
│                                                                │
│  선택한 지점의 SharedDocument, 대화 로그, 발명신고서가 복원됩니다.   │
│  그 이후 단계의 내용은 히스토리에 보존되나 현재 진행에서 제외됩니다.   │
│                                                                │
│  [ 취소 ]                        [ 이 지점부터 재개 ▶ ]         │
└────────────────────────────────────────────────────────────────┘
```

재개 시:
1. 선택한 지점의 스냅샷(`snapshots/`)에서 SharedDocument 복원
2. 대화 로그 해당 지점까지만 표시 (이후 로그는 "이전 실행" 섹션으로 접기)
3. 설정값 복원 (API 키는 현재 localStorage 값 우선)
4. `awaiting_human` 상태로 진입 — Human이 수동으로 다음 단계 시작

---

## 추가 구현 요구사항

### 버전 관리
- 각 라운드 종료 시 자동 스냅샷 저장
- UI에서 버전 타임라인 표시
- 특정 버전으로 롤백 기능

### 내보내기
- 발명신고서 DOCX 다운로드
- 에이전트 대화 로그 JSON 내보내기
- 검색된 선행특허 목록 CSV 내보내기

### 성능
- 에이전트 응답은 반드시 스트리밍으로 처리 (SSE 또는 fetch stream)
- 특허 DB 검색은 병렬 실행 (Promise.all)
- 공유 문서 편집 중 자동 저장 (debounce 500ms)

### 에러 처리
- API 키 미설정 시 안내 메시지
- 특허 DB 검색 실패 시 "검색 결과 없음"으로 진행 (시스템 중단 금지)
- LLM JSON 파싱 실패 시 재시도 후 원문 표시

---

## 구현 우선순위

Claude Code는 아래 순서로 구현할 것:

1. **프로젝트 초기화** — Vite + React + TypeScript + Tailwind + Zustand 세팅
2. **설정 패널** — API 키 입력, 모델 선택, 파라미터 설정
3. **상태 머신 (workflowStore)** — WorkflowState 전이 로직 + 순차 실행 보장
4. **3패널 레이아웃** — 기본 UI 구조
5. **LLM 라우터 모듈** — 3개 LLM provider 통합 + 스트리밍
6. **Agent 0 + 1** — 구조화 + 청구항 작성
7. **Human 액션 바 (ActionBar.tsx)** — 매 에이전트 턴 후 표시되는 핵심 컴포넌트
8. **공유 문서 편집기** — Human 편집 + 버전 히스토리
9. **프로젝트 관리 (projectStore + HomeScreen + NewProjectDialog + ProjectManager)** — 새 프로젝트 생성(이름 입력 + 폴더 선택), 폴더 열기 UI, 자동저장, 최근 프로젝트 목록
10. **재개 지점 선택 (ResumePointPicker)** — 프로젝트 불러오기 후 Phase 선택
11. **Agent 2** — 제안 루프
12. **특허 검색 모듈** — KIPRIS + USPTO + Vite 프록시
13. **Agent 3** — 검색 기반 심사
14. **의무 검토 게이트 (ReviewGate)** — 초안 승인, 최종 승인
15. **내보내기** — DOCX + 대화 로그 JSON + 특허 CSV

---

## 주의사항

- 브라우저에서 직접 LLM API를 호출하므로 CORS 이슈 발생 가능. Anthropic은 `anthropic-dangerous-direct-browser-access: true` 헤더 필요. OpenAI와 Gemini는 브라우저 직접 호출 지원 확인 후 필요 시 Vite 프록시 설정
- KIPRIS API는 CORS 제한이 있을 수 있으므로 Vite dev proxy 또는 간단한 Express 미들웨어 서버 고려
- API 키는 절대 코드에 하드코딩하지 말 것 — 모두 런타임 설정 패널에서 입력

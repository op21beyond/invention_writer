/**
 * Mirrors backend `route_after_human_review` so UI can explain the next automation step.
 */

export type NextWorkflowNode =
  | "agent1_draft"
  | "agent2"
  | "agent1_respond"
  | "agent3_query"
  | "agent3_examiner"
  | "agent1_rebut"
  | "finalize";

export function computeNextAfterHumanReview(state: Record<string, unknown>): NextWorkflowNode {
  const phase = String(state.phase ?? "");
  const discussionRound = Number(state.discussion_round ?? 0);
  const maxDr = Number(state.max_discussion_rounds ?? 3);
  const agent1Status = String(state.agent1_status ?? "");
  const examinerStatus = String(state.examiner_status ?? "");
  const examinationRound = Number(state.examination_round ?? 0);
  const maxEx = Number(state.max_examination_rounds ?? 3);

  if (phase === "discussion") {
    const turn = String(state.discussion_turn ?? "expander");
    if (turn === "developer") {
      return "agent1_respond";
    }
    if (discussionRound >= maxDr || agent1Status === "ready") {
      return "agent3_query";
    }
    return "agent2";
  }
  if (phase === "examination") {
    if (examinerStatus === "approved" || examinationRound >= maxEx) {
      return "finalize";
    }
    const examNext = String(state.after_human_examination ?? "examiner");
    if (examNext === "rebut") {
      return "agent1_rebut";
    }
    return "agent3_examiner";
  }
  if (phase === "draft") {
    return "agent1_draft";
  }
  return "finalize";
}

export type StepGuidance = {
  headline: string;
  detail: string;
  suggestionToFill: string;
};

/** Copy shown when 사용자 입력이 선택 사항임을 분명히 */
const OPTIONAL_DIRECTIVE_TAIL =
  "(없으면 「다음 단계」만 눌러 진행하면 됩니다. 특별히 신경 쓰이는 부분만 적어 주세요.)";

export function getStepGuidanceForNextNode(next: NextWorkflowNode): StepGuidance {
  const map: Record<NextWorkflowNode, StepGuidance> = {
    agent1_draft: {
      headline: "다음 단계: 발명신고 초안 작성 (Developer, Agent 1)",
      detail:
        "지금까지 정리된 아이디어를 바탕으로 청구항·설명 초안 형태를 채워 넣습니다. 문서 초안 패널을 함께 보시며, 초안 형태나 강조할 기술을 구체적으로 지시하고 싶을 때만 적어 주세요.",
      suggestionToFill: `특허 초안에서 기술 핵심을 ○○에 두고 청구항은 독립항 2개부터 잡아 주세요.\n${OPTIONAL_DIRECTIVE_TAIL}`,
    },
    agent2: {
      headline: "다음 단계: 보완·확장 제안 (Expander, Agent 2)",
      detail:
        "현재 초안 주변에서 빠져 있을 만한 근거나 변형안을 예시처럼 제안합니다. 꼭 반영했으면 하는 용어나, 피하고 싶은 과장 표현 등이 있다면 적어 주세요.",
      suggestionToFill: `○○ 기능의 구체적인 수치 예시와, 회피 설계까지 고려해 다양한 치환안을 넣어 주세요.\n${OPTIONAL_DIRECTIVE_TAIL}`,
    },
    agent1_respond: {
      headline: "다음 단계: 초안 다듬기 / 제안 반영 (Developer, Agent 1)",
      detail:
        "직전 라운드의 확장 제안을 반영하고 문장·청구를 다시 정돈합니다. 바로 위 「확장 제안 검토」에서 제안별 채택·거절과 거절 사유를 남기면, 다음 확장 라운드에 전달되어 같은 안이 반복 제안되지 않도록 합니다. 반드시 포함하거나 수정해 달라는 문장은 메모에 짧게 정리해 주세요.",
      suggestionToFill:
        `Agent 2가 제안한 ○○를 청구항 1항에 녹여 주세요. 과제 해결 단락은 한 문단 더 구체적으로 써 주세요.\n${OPTIONAL_DIRECTIVE_TAIL}`,
    },
    agent3_query: {
      headline: "다음 단계: 특허 검색 준비·검색 실행 (Examiner 검색 단계)",
      detail:
        "검색에 쓸 키워드·분류 초안을 정리한 뒤, 같은 흐름 안에서 특허 DB 검색까지 실행합니다. 검색 관점에서 꼭 넣거나 빼줬으면 하는 키워드가 있으면 적어 주세요.",
      suggestionToFill: `IPC ○○·용어 「××」는 반드시 검색 문자열에 포함해 주세요. 유사 기능만 있는 종래기술 위주로 찾아 주세요.\n${OPTIONAL_DIRECTIVE_TAIL}`,
    },
    agent3_examiner: {
      headline: "다음 단계: 심사관 관점 검토 의견 (Examiner, Agent 3)",
      detail:
        "수집된 검색 결과를 바탕으로 거절·보정 관점 의견을 스켈레톤 형태로 남깁니다. 무엇을 두고 대응해야 할지 짚어 주거나, 과장 검토를 회피하는 톤을 원하면 적어 주세요.",
      suggestionToFill:
        `검색 결과 US××××와의 차별점 위주로 거절 논리 초안을 써 주세요. 새성·진보성 근거는 ○○ 쪽을 강하게 짚어 주세요.\n${OPTIONAL_DIRECTIVE_TAIL}`,
    },
    agent1_rebut: {
      headline: "다음 단계: 심사 의견에 대한 초안 수정·반박 보강 (Developer, Agent 1)",
      detail:
        "검색·심사 의견를 반영해 청구항·설명을 다시 다듭니다. 수정 우선순위나 회피할 표현만 짧게 남겨 주세요.",
      suggestionToFill:
        `의견서의 새성 거절 이유를 반박하도록 청구항 전제부를 수정해 주세요. 선행 ○○과의 차이점을 명시적으로 적어 주세요.\n${OPTIONAL_DIRECTIVE_TAIL}`,
    },
    finalize: {
      headline: "다음 단계: 워크플로 종료 처리",
      detail:
        "이번 세션 결과를 종료 상태로 고정합니다. 마지막으로 남길 코멘트가 있으면 적고, 게이트(승인/반려)가 뜬 경우 해당 버튼을 사용해 주세요.",
      suggestionToFill: `종료까지 확인했습니다. 제출 분량 기준 문장만 검토했으면 종료 처리해 주세요.\n${OPTIONAL_DIRECTIVE_TAIL}`,
    },
  };
  return map[next];
}

export function getDirectiveContext(sessionStatus: string | undefined, state: Record<string, unknown>): StepGuidance {
  if (!sessionStatus || sessionStatus !== "awaiting_human") {
    return {
      headline: "사람 검토 차례가 오면 표시되는 안내입니다",
      detail:
        "지금은 백그라운드 플로를 외우실 필요 없습니다. 에이전트가 멈춰 「다음 단계」를 요청할 때, 아래에 나오는 「다음 단계」설명과 예시 문장을 참고해 선택적으로 입력하면 됩니다.",
      suggestionToFill: "",
    };
  }
  const nextNode = computeNextAfterHumanReview(state);
  return getStepGuidanceForNextNode(nextNode);
}

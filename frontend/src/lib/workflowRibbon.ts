import type { SessionRecord } from "../types";

import type { AgentVisualKey } from "./conversationAgents";
import { extractAgentFromConversationEntry } from "./conversationAgents";

/** 왼쪽 → 오른쪽 흐름 (사용자가 보는 진행 순서). */
export const WORKFLOW_STEP_LABELS: readonly string[] = [
  "구조화",
  "사람 검토",
  "논의·초안",
  "특허 검색",
  "심사·대응",
  "종료",
];

export function hasStructurerCheckpoint(session: SessionRecord | null): boolean {
  return conversationHasAgent(session?.state?.conversation_log, "agent0");
}

/** 리본 번호와 POST /navigate 허용 범위(1..5) 기준으로, 현재 활성 인덱스보다 왼쪽(이미 지난) 단계만. */
export function canNavigateRibbonStep(targetIndex: number, activeIndex: number): boolean {
  return targetIndex >= 1 && targetIndex <= 5 && targetIndex < activeIndex;
}

function conversationHasAgent(log: unknown, visualKey: AgentVisualKey): boolean {
  if (!Array.isArray(log)) {
    return false;
  }
  for (const raw of log) {
    const { visualKey: key } = extractAgentFromConversationEntry(raw as Record<string, unknown>);
    if (key === visualKey) {
      return true;
    }
  }
  return false;
}

/** 0 .. WORKFLOW_STEP_LABELS.length -1 */
export function getActiveWorkflowStepIndex(session: SessionRecord | null): number {
  const last = WORKFLOW_STEP_LABELS.length - 1;
  if (!session) {
    return 0;
  }

  const st = session.state ?? {};
  const phase = String(st.phase ?? "");
  const status = String(session.status ?? "");
  const humanApproved = Boolean(st.human_approved);
  const log = st.conversation_log;

  if (status === "completed" || humanApproved) {
    return last;
  }

  const hasStructurer = conversationHasAgent(log, "agent0");
  const hasSearchTouch = conversationHasAgent(log, "agent3") || conversationHasAgent(log, "search");
  const discussionDone =
    typeof st.discussion_round === "number" &&
    typeof st.max_discussion_rounds === "number" &&
    (st.discussion_round as number) >= (st.max_discussion_rounds as number);

  /** 구조화(Agent 0) 전·중 */
  if (!hasStructurer) {
    return status === "running" ? 0 : 0;
  }

  /** 논의 루프: 첫 사람 멈춤(구조화 직후)만 「사람 검토」, 이후 반복 멈춤은 모두 「논의·초안」(같은 칸으로 보이던 문제 완화) */
  if (phase === "discussion" && !discussionDone) {
    const round = typeof st.discussion_round === "number" ? st.discussion_round : 0;
    if (status === "awaiting_human") {
      return round === 0 ? 1 : 2;
    }
    return 2;
  }

  /** 검색·질의 단계 진입 직후 ~ 검색 직전 */
  if (phase === "examination") {
    const results = Array.isArray(st.search_results) ? st.search_results : [];
    const hasResults = results.length > 0;
    /** 검색 결과가 채워지기 전까지는 "특허 검색" 구간으로 본다. */
    if (!hasResults) {
      return 3;
    }
    /** 결과가 있는 뒤 심사·반박 라운드 */
    if (!humanApproved && status !== "completed") {
      return 4;
    }
    return last;
  }

  /** 초안 라우트 단독 등 예외적으로 draft 가 남은 경우 — 논의와 유사 처리 */
  if (phase === "draft") {
    return status === "awaiting_human" ? 1 : 2;
  }

  /** 기본 폴백 */
  return 2;
}

export function workflowStatusNote(session: SessionRecord | null): string | null {
  if (!session) {
    return "세션이 준비되면 순서대로 활성 단계가 굵게 표시됩니다.";
  }
  const phase = String(session.state?.phase ?? "");
  const st = session.status ?? "";
  if (st === "awaiting_human" && phase === "discussion") {
    return "에이전트가 멈춘 구간입니다. 필요하면 입력란에 메모 후 「다음 단계」를 눌러 진행합니다.";
  }
  if (st === "running") {
    return "백엔드가 자동 처리 중입니다. 잠시만 기다리면 새 메시지가 대화 패널에 쌓입니다.";
  }
  if (st === "error") {
    return "세션에 오류가 있습니다. 로그 또는 서버 콘솔을 확인해 주세요.";
  }
  return null;
}

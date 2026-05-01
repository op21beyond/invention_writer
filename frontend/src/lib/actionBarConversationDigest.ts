import type { AgentVisualKey } from "./conversationAgents";
import { extractAgentFromConversationEntry, stringifyMessageBody } from "./conversationAgents";

const SHORT_TAG: Partial<Record<AgentVisualKey, string>> = {
  agent0: "구조화",
  agent1: "초안",
  agent2: "확장",
  agent3: "심사",
  search: "검색",
  system: "시스템",
  human: "사람",
  unknown: "기타",
};

export type ActionBarFeedRow = {
  /** `conversation_log` 배열 인덱스(안정적인 키용). */
  logIndex: number;
  /** 한 줄 표시문. */
  line: string;
};

/** 최근 메시지를 위에서 아래로 쌓을 때 사용(맨 아래가 가장 최신). */
export function listActionBarFeedRows(conversationLog: unknown, maxRows = 5): ActionBarFeedRow[] {
  if (!Array.isArray(conversationLog) || conversationLog.length === 0) {
    return [];
  }

  const log = conversationLog;
  const start = Math.max(0, log.length - maxRows);
  const rows: ActionBarFeedRow[] = [];

  for (let i = start; i < log.length; i++) {
    const raw = log[i];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const entry = raw as Record<string, unknown>;
    const { visualKey } = extractAgentFromConversationEntry(entry);
    const tag = SHORT_TAG[visualKey] ?? visualKey;
    const body = stringifyMessageBody(entry).replace(/\s+/g, " ").trim();
    const clip = body.length > 200 ? `${body.slice(0, 197)}…` : body;
    rows.push({ logIndex: i, line: `「${tag}」 ${clip}` });
  }

  return rows;
}

/** 액션바 중앙에 한 줄·짧은 블록으로 보여 줄 최근 메시지 요약(본문 일부). */
export function formatActionBarConversationDigest(conversationLog: unknown): string {
  if (!Array.isArray(conversationLog) || conversationLog.length === 0) {
    return "아직 대화 로그가 없습니다. 「다음 단계」로 시작하면 여기에 최근 에이전트 메시지가 이어집니다.";
  }

  const tail = conversationLog.slice(-5);
  const parts: string[] = [];

  for (const raw of tail) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      continue;
    }
    const entry = raw as Record<string, unknown>;
    const { visualKey } = extractAgentFromConversationEntry(entry);
    const tag = SHORT_TAG[visualKey] ?? visualKey;
    const body = stringifyMessageBody(entry).replace(/\s+/g, " ").trim();
    const clip = body.length > 200 ? `${body.slice(0, 197)}…` : body;
    parts.push(`「${tag}」 ${clip}`);
  }

  if (parts.length === 0) {
    return "대화 항목을 읽을 수 없습니다.";
  }

  return parts.join("  ·  ");
}

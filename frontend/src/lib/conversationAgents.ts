/** Normalize entries from SSE / SQLite JSON (`additional_kwargs.agent_id` vs flat `agent_id`). */

export type AgentVisualKey =
  | "agent0"
  | "agent1"
  | "agent2"
  | "agent3"
  | "search"
  | "system"
  | "human"
  | "unknown";

const LABELS: Record<AgentVisualKey, string> = {
  agent0: "Agent 0 · 구조화 (Structurer)",
  agent1: "Agent 1 · 초안 작성 (Developer)",
  agent2: "Agent 2 · 확장 (Expander)",
  agent3: "Agent 3 · 심사·검색 (Examiner)",
  search: "검색 · 특허",
  system: "시스템",
  human: "사람 · Human",
  unknown: "에이전트 (역할 불명)",
};

export function labelForAgentKey(key: AgentVisualKey): string {
  return LABELS[key];
}

export function coerceAgentVisualKey(agentIdRaw: string, roleHint?: string): AgentVisualKey {
  const lower = agentIdRaw.toLowerCase();

  if (roleHint === "human") {
    return "human";
  }
  if (lower === "agent0" || lower.startsWith("structurer")) {
    return "agent0";
  }
  if (lower === "agent1" || lower === "developer") {
    return "agent1";
  }
  if (lower === "agent2" || lower === "expander") {
    return "agent2";
  }
  if (lower === "agent3" || lower === "examiner") {
    return "agent3";
  }
  if (lower === "search" || lower.includes("uspto")) {
    return "search";
  }
  if (lower === "system" || agentIdRaw === "") {
    if (roleHint === "system") {
      return "system";
    }
    return lower === "" ? "unknown" : "system";
  }

  return "unknown";
}

export function extractAgentFromConversationEntry(entry: Record<string, unknown>): {
  rawId: string;
  visualKey: AgentVisualKey;
} {
  const add =
    typeof entry.additional_kwargs === "object" && entry.additional_kwargs !== null
      ? (entry.additional_kwargs as Record<string, unknown>)
      : undefined;

  const fromNested =
    typeof add?.agent_id === "string"
      ? add.agent_id
      : typeof entry.agent_id === "string"
        ? entry.agent_id
        : "";

  const roleHint = typeof entry.role === "string" ? entry.role : undefined;
  const typeHint = typeof entry.type === "string" ? entry.type : undefined;

  let rawId = fromNested.trim();
  if (!rawId && roleHint === "human") {
    rawId = "human";
  }

  let visualKey: AgentVisualKey;
  if (!rawId) {
    visualKey =
      roleHint === "system" || typeHint === "system"
        ? "system"
        : typeHint === "human"
          ? "human"
          : typeHint === "ai"
            ? "unknown"
            : "unknown";
  } else {
    visualKey = coerceAgentVisualKey(rawId, roleHint);
  }

  return {
    rawId: rawId || (visualKey === "unknown" ? "—" : String(visualKey)),
    visualKey,
  };
}

export function stringifyMessageBody(entry: Record<string, unknown>): string {
  const c = entry.content;
  if (typeof c === "string") {
    return c;
  }
  if (Array.isArray(c)) {
    return c
      .map((chunk) =>
        typeof chunk === "object" &&
        chunk !== null &&
        "text" in chunk &&
        typeof (chunk as { text?: string }).text === "string"
          ? (chunk as { text: string }).text
          : "",
      )
      .join("");
  }
  return "";
}

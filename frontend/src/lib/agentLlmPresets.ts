export type LlmProviderId = "anthropic" | "openai" | "google";

export const PROVIDER_LABELS: Record<LlmProviderId, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google (Gemini)",
};

/** provider → 권장 모델 (첫 옵션이 기본에 가깝게) */
export const MODEL_PRESETS: Record<LlmProviderId, string[]> = {
  anthropic: [
    "claude-sonnet-4-5",
    "claude-3-5-sonnet-20241022",
    "claude-3-opus-20240229",
    "claude-3-5-haiku-20241022",
  ],
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1-mini"],
  google: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
};

export const AGENT_LABELS: Record<string, string> = {
  agent0: "Agent 0 · 구조화 (Structurer)",
  agent1: "Agent 1 · 발명신고 초안 (Developer)",
  agent2: "Agent 2 · 확장 (Expander)",
  agent3: "Agent 3 · 검색·심사 (Examiner)",
};

export const DEFAULT_AGENT_CONFIGS: Record<string, { provider: LlmProviderId; model: string }> = {
  agent0: { provider: "anthropic", model: "claude-sonnet-4-5" },
  agent1: { provider: "anthropic", model: "claude-sonnet-4-5" },
  agent2: { provider: "anthropic", model: "claude-sonnet-4-5" },
  agent3: { provider: "anthropic", model: "claude-sonnet-4-5" },
};

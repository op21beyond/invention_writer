export type ResumeAction = "continue" | "approve" | "reject";

export type DiscussionDecisionStatus = "accepted" | "rejected" | "skipped";

/** merit_score: 2 완전 적합, 1 유지·보완, 0 배제 (구 API는 status만 올 수 있음) */
export interface DiscussionDecisionPayload {
  suggestion_id: string;
  merit_score?: 0 | 1 | 2;
  status?: DiscussionDecisionStatus;
  reason: string;
}

export interface InterruptEventPayload {
  type: "review" | "gate";
  phase: string;
  round: number;
  payload?: unknown;
}

export interface NodeCompleteEventPayload {
  node: string;
  state_patch: Record<string, unknown>;
}

export interface LlmStreamStartPayload {
  agent_id: string;
}

export interface LlmChunkPayload {
  agent_id: string;
  chunk: string;
  accumulated_len?: number;
}

export interface CheckpointEventPayload {
  checkpoint_id: string;
  phase: string;
  status?: string;
  session?: SessionRecord;
}

/** POST /sessions/{id}/resume 응답 (전체 세션이 아닌 축약 본문) */
export interface ResumeAck {
  thread_id: string;
  action: ResumeAction;
  status: string;
  state?: Record<string, unknown>;
}

export interface SessionRecord {
  thread_id: string;
  project_name: string;
  project_dir: string;
  created_at: string;
  updated_at: string;
  status: string;
  state: Record<string, unknown>;
  settings: SettingsPayload;
}

export interface SettingsPayload {
  auto_run: boolean;
  auto_run_delay_seconds: number;
  agent_configs: Record<string, { provider: string; model: string }>;
}

export interface ProjectDirectorySelection {
  name: string;
  handle: FileSystemDirectoryHandle;
}

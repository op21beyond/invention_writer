import type {
  DiscussionDecisionPayload,
  ResumeAck,
  ResumeAction,
  SessionRecord,
  SettingsPayload,
} from "../types";

import { API_BASE } from "./apiBase";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function createSession(payload: {
  projectName: string;
  projectDir: string;
}): Promise<SessionRecord> {
  return request<SessionRecord>("/sessions", {
    method: "POST",
    body: JSON.stringify({
      project_name: payload.projectName,
      project_dir: payload.projectDir,
    }),
  });
}

/** 프로젝트 폴더에 저장된 스냅샷으로 세션 메모리·상태 복구(동일 thread_id 유지). */
export async function restoreSessionFromWorkspaceSnapshot(snapshot: SessionRecord): Promise<SessionRecord> {
  return request<SessionRecord>("/sessions/restore_snapshot", {
    method: "POST",
    body: JSON.stringify({
      thread_id: snapshot.thread_id,
      project_name: snapshot.project_name,
      project_dir: snapshot.project_dir,
      created_at: snapshot.created_at,
      updated_at: snapshot.updated_at,
      status: snapshot.status,
      state: snapshot.state,
      settings: snapshot.settings,
    }),
  });
}

export async function fetchSettings(): Promise<SettingsPayload> {
  return request<SettingsPayload>("/settings");
}

export async function startSession(threadId: string, rawIdea: string): Promise<SessionRecord> {
  return request<SessionRecord>(`/sessions/${threadId}/start`, {
    method: "POST",
    body: JSON.stringify({
      raw_idea: rawIdea,
    }),
  });
}

export async function updateSettings(payload: SettingsPayload): Promise<SettingsPayload> {
  return request<SettingsPayload>("/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export type SessionStatePatchBody = Partial<{
  anchor_document: Record<string, unknown>;
  patent_document: Record<string, unknown>;
  expander_suggestions: unknown[];
  search_queries: unknown[];
  search_results: unknown[];
  examiner_objections: unknown[];
  examiner_status: string;
}>;

export async function patchSessionState(threadId: string, body: SessionStatePatchBody): Promise<SessionRecord> {
  return request<SessionRecord>(`/sessions/${threadId}/state`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function resumeSession(
  threadId: string,
  payload: {
    action: ResumeAction;
    directive?: string;
    editedDocument?: Record<string, unknown>;
    discussionDecisions?: DiscussionDecisionPayload[];
    skipDiscussionToSearch?: boolean;
    skipExaminationToFinalize?: boolean;
  },
) {
  const body: Record<string, unknown> = {
    action: payload.action,
    directive: payload.directive ?? "",
    edited_document: payload.editedDocument ?? null,
    skip_discussion_to_search: Boolean(payload.skipDiscussionToSearch),
    skip_examination_to_finalize: Boolean(payload.skipExaminationToFinalize),
  };
  if (payload.discussionDecisions !== undefined) {
    body.discussion_decisions = payload.discussionDecisions;
  }
  return request<ResumeAck>(`/sessions/${threadId}/resume`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function cancelSession(threadId: string): Promise<{
  thread_id: string;
  cancelled: boolean;
  status: string;
}> {
  return request(`/sessions/${threadId}/cancel`, {
    method: "POST",
  });
}

export async function fetchSession(threadId: string): Promise<SessionRecord> {
  return request<SessionRecord>(`/sessions/${threadId}`);
}

export async function navigateSession(threadId: string, targetStepIndex: number): Promise<SessionRecord> {
  return request<SessionRecord>(`/sessions/${threadId}/navigate`, {
    method: "POST",
    body: JSON.stringify({ target_step_index: targetStepIndex }),
  });
}

import { create } from "zustand";

import { suggestionLocalId, type DiscussionDecisionCell } from "../lib/discussionDecisions";
import { mergeConversationLogsPreserveMessageDetail } from "../lib/conversationLogMerge";
import type {
  CheckpointEventPayload,
  InterruptEventPayload,
  LlmChunkPayload,
  LlmStreamStartPayload,
  NodeCompleteEventPayload,
  ProjectDirectorySelection,
  SessionRecord,
} from "../types";

interface WorkflowStore {
  currentSession: SessionRecord | null;
  sharedDocumentDraft: string;
  directive: string;
  discussionDecisionById: Record<string, DiscussionDecisionCell>;
  latestInterrupt: InterruptEventPayload | null;
  streamConnected: boolean;
  fileSystemSupported: boolean;
  projectDirectory: ProjectDirectorySelection | null;
  setCurrentSession: (session: SessionRecord) => void;
  setSharedDocumentDraft: (value: string) => void;
  setDirective: (value: string) => void;
  initDiscussionDecisionsForSuggestions: (suggestions: Array<Record<string, unknown>>) => void;
  setDiscussionDecisionCell: (id: string, patch: Partial<DiscussionDecisionCell>) => void;
  setStreamConnected: (value: boolean) => void;
  setFileSystemSupported: (value: boolean) => void;
  setProjectDirectory: (value: ProjectDirectorySelection | null) => void;
  applyInterrupt: (payload: InterruptEventPayload) => void;
  applyNodeComplete: (payload: NodeCompleteEventPayload) => void;
  applyCheckpoint: (payload: CheckpointEventPayload) => void;
  llmStreamAgent: string | null;
  llmStreamText: string;
  applyLlmStreamStart: (payload: LlmStreamStartPayload) => void;
  applyLlmChunk: (payload: LlmChunkPayload) => void;
  clearLlmStream: () => void;
}

export const useWorkflowStore = create<WorkflowStore>((set) => ({
  currentSession: null,
  sharedDocumentDraft: "",
  directive: "",
  discussionDecisionById: {},
  latestInterrupt: null,
  streamConnected: false,
  fileSystemSupported: false,
  projectDirectory: null,
  llmStreamAgent: null,
  llmStreamText: "",
  clearLlmStream: () => set({ llmStreamAgent: null, llmStreamText: "" }),
  setCurrentSession: (session) =>
    set((state) => {
      const prevLog = state.currentSession?.state?.conversation_log as unknown[] | undefined;
      const newLog = session.state?.conversation_log as unknown[] | undefined;
      const mergedLog =
        newLog !== undefined
          ? mergeConversationLogsPreserveMessageDetail(prevLog, newLog)
          : undefined;
      const sessionOut =
        mergedLog !== undefined
          ? { ...session, state: { ...session.state, conversation_log: mergedLog } }
          : session;
      const st = sessionOut.state as Record<string, unknown>;
      return {
        currentSession: sessionOut,
        sharedDocumentDraft: typeof st.raw_idea === "string" ? (st.raw_idea as string) : "",
        llmStreamAgent: null,
        llmStreamText: "",
      };
    }),
  setSharedDocumentDraft: (sharedDocumentDraft) => set({ sharedDocumentDraft }),
  setDirective: (directive) => set({ directive }),
  initDiscussionDecisionsForSuggestions: (suggestions) =>
    set((state) => {
      const next: Record<string, DiscussionDecisionCell> = { ...state.discussionDecisionById };
      const keep = new Set<string>();
      suggestions.forEach((s, i) => {
        const sid = suggestionLocalId(s, i);
        keep.add(sid);
        if (!next[sid]) {
          next[sid] = { status: "skipped", reason: "" };
        }
      });
      for (const k of Object.keys(next)) {
        if (!keep.has(k)) {
          delete next[k];
        }
      }
      return { discussionDecisionById: next };
    }),
  setDiscussionDecisionCell: (id, patch) =>
    set((state) => {
      const prev = state.discussionDecisionById[id] ?? { status: "skipped", reason: "" };
      return {
        discussionDecisionById: {
          ...state.discussionDecisionById,
          [id]: { ...prev, ...patch },
        },
      };
    }),
  setStreamConnected: (streamConnected) => set({ streamConnected }),
  setFileSystemSupported: (fileSystemSupported) => set({ fileSystemSupported }),
  setProjectDirectory: (projectDirectory) => set({ projectDirectory }),
  applyInterrupt: (latestInterrupt) =>
    set((state) => ({
      latestInterrupt,
      llmStreamAgent: null,
      llmStreamText: "",
      currentSession: state.currentSession
        ? { ...state.currentSession, status: "awaiting_human" }
        : state.currentSession,
    })),
  applyNodeComplete: (payload) =>
    set((state) => {
      if (!state.currentSession) {
        return state;
      }
      const rawNext = { ...state.currentSession.state, ...payload.state_patch };
      const prevLog = state.currentSession.state.conversation_log as unknown[] | undefined;
      const nextLog = rawNext.conversation_log as unknown[] | undefined;
      const mergedLog =
        nextLog !== undefined
          ? mergeConversationLogsPreserveMessageDetail(prevLog, nextLog)
          : undefined;
      const nextState = {
        ...rawNext,
        ...(mergedLog !== undefined ? { conversation_log: mergedLog } : {}),
      };
      const ns = nextState as Record<string, unknown>;
      const nextDraft =
        typeof ns.raw_idea === "string" ? (ns.raw_idea as string) : state.sharedDocumentDraft;
      return {
        currentSession: {
          ...state.currentSession,
          state: nextState,
          status: "running",
        },
        sharedDocumentDraft: nextDraft,
        llmStreamAgent: null,
        llmStreamText: "",
        latestInterrupt:
          payload.node === "human_review" ? state.latestInterrupt : null,
      };
    }),
  applyCheckpoint: (payload) =>
    set((state) => {
      if (payload.session) {
        const prevLog = state.currentSession?.state?.conversation_log as unknown[] | undefined;
        const newLog = payload.session.state?.conversation_log as unknown[] | undefined;
        const mergedLog = mergeConversationLogsPreserveMessageDetail(prevLog, newLog);
        return {
          currentSession: {
            ...payload.session,
            state: {
              ...payload.session.state,
              conversation_log: mergedLog,
            },
          },
          latestInterrupt:
            payload.session.status === "completed" ? null : state.latestInterrupt,
          llmStreamAgent: null,
          llmStreamText: "",
        };
      }
      if (!state.currentSession) {
        return { ...state, llmStreamAgent: null, llmStreamText: "" };
      }
      return {
        currentSession: {
          ...state.currentSession,
          status: payload.status ?? state.currentSession.status,
        },
        llmStreamAgent: null,
        llmStreamText: "",
      };
    }),
  applyLlmStreamStart: (payload) =>
    set({
      llmStreamAgent: payload.agent_id,
      llmStreamText: "",
    }),
  applyLlmChunk: (payload) =>
    set((state) => {
      const prevAgent = state.llmStreamAgent;
      const prevText = state.llmStreamText;
      if (prevAgent == null) {
        return { llmStreamAgent: payload.agent_id, llmStreamText: payload.chunk };
      }
      if (prevAgent !== payload.agent_id) {
        return { llmStreamAgent: payload.agent_id, llmStreamText: payload.chunk };
      }
      return { llmStreamAgent: prevAgent, llmStreamText: prevText + payload.chunk };
    }),
}));

import type {
  CheckpointEventPayload,
  InterruptEventPayload,
  LlmChunkPayload,
  LlmStreamStartPayload,
  NodeCompleteEventPayload,
} from "../types";

import { API_BASE } from "./apiBase";

interface StreamHandlers {
  onInterrupt: (payload: InterruptEventPayload) => void;
  onNodeComplete: (payload: NodeCompleteEventPayload) => void;
  onCheckpoint: (payload: CheckpointEventPayload) => void;
  onLlmStreamStart?: (payload: LlmStreamStartPayload) => void;
  onLlmChunk?: (payload: LlmChunkPayload) => void;
  onError?: (message: string) => void;
}

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

export function createSessionStream(threadId: string, handlers: StreamHandlers) {
  const source = new EventSource(`${API_BASE}/sessions/${threadId}/stream`);

  source.addEventListener("checkpoint", (event) => {
    handlers.onCheckpoint(parseJson<CheckpointEventPayload>((event as MessageEvent).data));
  });

  source.addEventListener("interrupt", (event) => {
    handlers.onInterrupt(parseJson<InterruptEventPayload>((event as MessageEvent).data));
  });

  source.addEventListener("node_complete", (event) => {
    handlers.onNodeComplete(parseJson<NodeCompleteEventPayload>((event as MessageEvent).data));
  });

  source.addEventListener("llm_stream_start", (event) => {
    handlers.onLlmStreamStart?.(parseJson<LlmStreamStartPayload>((event as MessageEvent).data));
  });

  source.addEventListener("llm_chunk", (event) => {
    handlers.onLlmChunk?.(parseJson<LlmChunkPayload>((event as MessageEvent).data));
  });

  source.addEventListener("error", (event) => {
    handlers.onError?.((event as MessageEvent).data);
  });

  return source;
}

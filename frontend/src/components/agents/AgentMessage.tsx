import type { AgentVisualKey } from "../../lib/conversationAgents";
import { labelForAgentKey } from "../../lib/conversationAgents";
import { MessageDetailExtras } from "./MessageDetailExtras";

interface AgentMessageProps {
  visualKey: AgentVisualKey;
  content: string;
  /** backend id e.g. agent0 (optional small print) */
  rawId?: string;
  messageDetail?: Record<string, unknown> | null;
  threadId?: string;
}

export function AgentMessage({ visualKey, content, rawId, messageDetail, threadId }: AgentMessageProps) {
  const roleLabel = labelForAgentKey(visualKey);
  const modifier = `message-card--${visualKey}`;
  const hideTechnical =
    !rawId ||
    rawId === "—" ||
    /^(agent[0-3]|search|system|human)$/i.test(String(rawId).trim());

  return (
    <article className={`message-card ${modifier}`}>
      <div className="message-meta">
        <span className="message-agent-badge">{roleLabel}</span>
        {!hideTechnical ? <span className="message-agent-id">{rawId}</span> : null}
      </div>
      <p className="message-body">{content}</p>
      {messageDetail && Object.keys(messageDetail).length > 0 ? (
        <div className="message-detail-row">
          <MessageDetailExtras detail={messageDetail} threadId={threadId} />
        </div>
      ) : null}
    </article>
  );
}

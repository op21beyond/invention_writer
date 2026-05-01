import { extractMessageDetail } from "../../lib/conversationLogMerge";
import { extractAgentFromConversationEntry, stringifyMessageBody } from "../../lib/conversationAgents";
import { useWorkflowStore } from "../../stores/workflowStore";
import { AgentMessage } from "../agents/AgentMessage";

export function ChatPanel() {
  const { currentSession } = useWorkflowStore();
  const log = Array.isArray(currentSession?.state?.conversation_log)
    ? (currentSession?.state?.conversation_log as Array<Record<string, unknown>>)
    : [];
  /** 백엔드 순서(오래된→최신)를 뒤집어 최신이 위로 오게 함 */
  const logNewestFirst = [...log].reverse();

  return (
    <section className="panel panel-chat">
      <h2>에이전트 대화</h2>
      <p className="panel-hint">말풍선 색은 에이전트 역할을 구분합니다. 최신 메시지가 위에 표시됩니다.</p>
      <div className="message-list message-list--scroll">
        {log.length === 0 ? (
          <AgentMessage content="아직 대화가 없습니다. 공유 문서에서 「구조화 시작」을 누르면 첫 메시지가 나타납니다." visualKey="system" />
        ) : null}
        {logNewestFirst.map((message, revIdx) => {
          const originalIndex = log.length - 1 - revIdx;
          const { rawId, visualKey } = extractAgentFromConversationEntry(message);
          const body = stringifyMessageBody(message);
          const messageDetail = extractMessageDetail(message as Record<string, unknown>);
          return (
            <AgentMessage
              key={`msg-${originalIndex}-${rawId}`}
              content={body}
              messageDetail={messageDetail}
              rawId={rawId}
              threadId={currentSession?.thread_id}
              visualKey={visualKey}
            />
          );
        })}
      </div>
    </section>
  );
}

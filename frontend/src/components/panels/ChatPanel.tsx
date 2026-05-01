import { useState } from "react";

import { extractMessageDetail } from "../../lib/conversationLogMerge";
import { patchSessionState } from "../../lib/apiClient";
import { extractAgentFromConversationEntry, stringifyMessageBody } from "../../lib/conversationAgents";
import { useWorkflowStore } from "../../stores/workflowStore";
import { AgentMessage } from "../agents/AgentMessage";

export function ChatPanel() {
  const { currentSession, setCurrentSession } = useWorkflowStore();
  const [clearBusy, setClearBusy] = useState(false);

  const log = Array.isArray(currentSession?.state?.conversation_log)
    ? (currentSession?.state?.conversation_log as Array<Record<string, unknown>>)
    : [];

  /** 백엔드 순서(오래된→최신)를 뒤집어 최신이 위로 오게 함 */
  const logNewestFirst = [...log].reverse();

  const handleClearPastConversation = () => {
    const threadId = currentSession?.thread_id;
    if (!threadId || log.length === 0 || clearBusy) {
      return;
    }
    if (
      !window.confirm(
        "에이전트 대화 기록(conversation_log)을 서버 세션에서도 모두 삭제합니다. 되돌릴 수 없습니다. 진행할까요?",
      )
    ) {
      return;
    }
    setClearBusy(true);
    void patchSessionState(threadId, { conversation_log: [] })
      .then((session) => {
        setCurrentSession(session);
      })
      .catch((e: unknown) => {
        window.alert(e instanceof Error ? e.message : "대화 로그 삭제에 실패했습니다.");
      })
      .finally(() => setClearBusy(false));
  };

  return (
    <section className="panel panel-chat">
      <div className="chat-panel-heading-row">
        <h2 className="chat-panel-title">에이전트 대화</h2>
        <div className="chat-history-controls" role="group" aria-label="대화 로그">
          <button
            aria-busy={clearBusy}
            className="chat-history-clear-btn"
            disabled={clearBusy || log.length === 0}
            title="현재까지의 대화를 화면·서버 모두에서 삭제합니다."
            type="button"
            onClick={handleClearPastConversation}
          >
            {clearBusy ? "삭제 중…" : "지난 대화 비우기"}
          </button>
        </div>
      </div>
      <p className="panel-hint">
        말풍선 색은 에이전트 역할을 구분합니다. 최신 메시지가 위에 표시됩니다. 「지난 대화 비우기」는 진행 로그만
        지우며, 발명 초안(patent)·Anchor 등 다른 세션 상태는 그대로 둡니다.
      </p>
      <div className="message-list message-list--scroll">
        {log.length === 0 ? (
          <AgentMessage content="아직 대화가 없습니다. 공유 문서에서 「다음 단계」로 시작하면 첫 메시지가 나타납니다." visualKey="system" />
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

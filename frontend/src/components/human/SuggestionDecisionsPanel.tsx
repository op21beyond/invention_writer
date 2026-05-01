import { useEffect, useMemo } from "react";

import { suggestionLocalId, type DiscussionDecisionStatus } from "../../lib/discussionDecisions";
import { useWorkflowStore } from "../../stores/workflowStore";

function isExpanderReviewContext(status: string | undefined, state: Record<string, unknown>): boolean {
  return status === "awaiting_human" && state.phase === "discussion" && state.discussion_turn === "developer";
}

export function SuggestionDecisionsPanel() {
  const currentSession = useWorkflowStore((s) => s.currentSession);
  const discussionDecisionById = useWorkflowStore((s) => s.discussionDecisionById);
  const initDiscussionDecisionsForSuggestions = useWorkflowStore((s) => s.initDiscussionDecisionsForSuggestions);
  const setDiscussionDecisionCell = useWorkflowStore((s) => s.setDiscussionDecisionCell);

  const suggestions = useMemo(() => {
    const raw = currentSession?.state?.expander_suggestions;
    return Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  }, [currentSession?.state?.expander_suggestions]);

  const fingerprint = suggestions.map((s, i) => suggestionLocalId(s, i)).join("|");

  const state = useMemo(() => (currentSession?.state ?? {}) as Record<string, unknown>, [currentSession?.state]);

  const show = useMemo(
    () => isExpanderReviewContext(currentSession?.status, state),
    [currentSession?.status, state],
  );

  useEffect(() => {
    if (!show || suggestions.length === 0) {
      return;
    }
    initDiscussionDecisionsForSuggestions(suggestions);
    /* When fingerprint changes (new 제안 목록 id 집합), 제안별 초안 상태를 맞춤 */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- suggestions는 fingerprint로 동기화됨
  }, [show, fingerprint, initDiscussionDecisionsForSuggestions]);

  if (!show || suggestions.length === 0) {
    return null;
  }

  return (
    <div className="directive-box suggestion-decisions-panel" role="group" aria-label="확장 제안 채택·거절">
      <h3 className="directive-box-title">확장 제안 검토</h3>
      <p className="suggestion-decisions-intro">
        다음 확장 라운드에 반영되도록 각 제안의 채택·거절을 표시합니다. 거절 시 이유를 적으면 비슷한 안이 반복되지 않도록 모델이 참고합니다.
      </p>
      <div className="suggestion-decisions-list">
        {suggestions.map((s, idx) => {
          const sid = suggestionLocalId(s, idx);
          const cell = discussionDecisionById[sid] ?? { status: "skipped" as DiscussionDecisionStatus, reason: "" };
          const typeLabel = typeof s.type === "string" ? s.type : "";
          const contentPreview = String(s.content ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 260);
          return (
            <div className="suggestion-decisions-row" key={sid}>
              <div className="suggestion-decisions-row-head">
                <span className="suggestion-decisions-id">{sid}</span>
                {typeLabel ? <span className="suggestion-decisions-type">{typeLabel}</span> : null}
              </div>
              <p className="suggestion-decisions-content">{contentPreview || "(내용 없음)"}</p>
              <div className="suggestion-decisions-controls">
                <label className="suggestion-decisions-label">
                  <span className="visually-hidden">판정</span>
                  <select
                    className="suggestion-decisions-select"
                    value={cell.status}
                    onChange={(e) =>
                      setDiscussionDecisionCell(sid, {
                        status: e.target.value as DiscussionDecisionStatus,
                      })
                    }
                  >
                    <option value="skipped">판정 안 함</option>
                    <option value="accepted">채택</option>
                    <option value="rejected">거절</option>
                  </select>
                </label>
              </div>
              {cell.status === "rejected" ? (
                <label className="suggestion-decisions-reason-label">
                  거절 사유 (선택, 다음 확장 제안에 전달)
                  <textarea
                    className="suggestion-decisions-reason"
                    value={cell.reason}
                    onChange={(e) => setDiscussionDecisionCell(sid, { reason: e.target.value })}
                    placeholder="예: 청구 범위를 과도하게 넓힌다 / 선행과 구별이 약하다 / 구현 관점에서 비현실적이다"
                    rows={2}
                  />
                </label>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

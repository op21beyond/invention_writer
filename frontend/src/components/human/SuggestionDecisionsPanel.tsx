import { useEffect, useMemo } from "react";

import { suggestionLocalId, type MeritScore } from "../../lib/discussionDecisions";
import { useWorkflowStore } from "../../stores/workflowStore";

function isExpanderReviewContext(status: string | undefined, state: Record<string, unknown>): boolean {
  return status === "awaiting_human" && state.phase === "discussion" && state.discussion_turn === "developer";
}

const MERIT_OPTIONS: { value: MeritScore; label: string; hint: string }[] = [
  {
    value: 2,
    label: "2 · 완전 적합",
    hint: "명세·청구에 적극 반영. Expander에 채택으로 전달.",
  },
  {
    value: 1,
    label: "1 · 유지·보완",
    hint: "살리되 약점·리스크가 있음. 사유에 부족한 점을 적으면 다음 라운드가 보완합니다.",
  },
  {
    value: 0,
    label: "0 · 배제",
    hint: "명세에 넣지 않음. 거절 사유를 구체적으로 적어 주세요.",
  },
];

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
    <div className="directive-box suggestion-decisions-panel" role="group" aria-label="확장 제안 적합도 판정">
      <h3 className="directive-box-title">확장 제안 검토 (적합도 0·1·2)</h3>
      <p className="suggestion-decisions-intro">
        각 제안에 <strong>2(완전 적합)</strong>, <strong>1(유지·다툴 여지·보완 필요)</strong>,{" "}
        <strong>0(배제)</strong> 중 하나를 선택합니다. <strong>0이 아닌 제안(1·2)은 모두 초안에 반영</strong>되며, 2는
        Expander에게 채택으로, 1은 사유에 적은 보완점을 반영합니다. 0만 명세에서 제외합니다.
      </p>
      <div className="suggestion-decisions-list">
        {suggestions.map((s, idx) => {
          const sid = suggestionLocalId(s, idx);
          const cell = discussionDecisionById[sid] ?? { merit_score: 1 as MeritScore, reason: "" };
          const typeLabel = typeof s.type === "string" ? s.type : "";
          const contentPreview = String(s.content ?? "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 260);
          const needReason = cell.merit_score === 0 || cell.merit_score === 1;
          return (
            <div className="suggestion-decisions-row" key={sid}>
              <div className="suggestion-decisions-row-head">
                <span className="suggestion-decisions-id">{sid}</span>
                {typeLabel ? <span className="suggestion-decisions-type">{typeLabel}</span> : null}
              </div>
              <p className="suggestion-decisions-content">{contentPreview || "(내용 없음)"}</p>
              <div className="suggestion-decisions-controls">
                <label className="suggestion-decisions-label">
                  <span className="visually-hidden">적합도</span>
                  <select
                    className="suggestion-decisions-select"
                    value={cell.merit_score}
                    onChange={(e) =>
                      setDiscussionDecisionCell(sid, {
                        merit_score: Number(e.target.value) as MeritScore,
                      })
                    }
                  >
                    {MERIT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value} title={o.hint}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {needReason ? (
                <label className="suggestion-decisions-reason-label">
                  {cell.merit_score === 0 ? (
                    <>거절 사유 (필수 권장 — 다음 확장·명세 배제 근거)</>
                  ) : (
                    <>보완·리스크 메모 (권장 — 1단계: 어떤 점이 부족한지 Expander가 고칩니다)</>
                  )}
                  <textarea
                    className="suggestion-decisions-reason"
                    value={cell.reason}
                    onChange={(e) => setDiscussionDecisionCell(sid, { reason: e.target.value })}
                    placeholder={
                      cell.merit_score === 0
                        ? "예: 청구와 불일치 / 선행과 구별 약함 / 구현 비현실적"
                        : "예: 청구 연결이 약함 — 실시예에 구체 수치 필요"
                    }
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

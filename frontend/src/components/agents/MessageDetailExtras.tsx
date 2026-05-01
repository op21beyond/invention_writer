import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { detailRecordToMarkdown, editTextToMarkdownPreview } from "../../lib/detailMarkdownPreview";
import {
  findDiscussionFeedbackEntry,
  formatDiscussionRosterMarkdown,
  meritLabelKr,
  patentAfterFromFeedbackEntry,
  rosterDiscussionRows,
} from "../../lib/discussionFeedbackUi";
import { patchSessionState } from "../../lib/apiClient";
import { useWorkflowStore } from "../../stores/workflowStore";
import { DetailModal } from "../ui/DetailModal";
import { MarkdownPreview } from "../ui/MarkdownPreview";

function stringifyValue(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

const EDITABLE = new Set([
  "expander",
  "developer_patent",
  "anchor",
  "search_queries",
  "search_results",
  "examiner_objections",
]);

type BodyViewMode = "source" | "markdown";

function DetailBodyViewTabs({
  mode,
  onChange,
}: {
  mode: BodyViewMode;
  onChange: (mode: BodyViewMode) => void;
}) {
  return (
    <div className="detail-body-view-tabs" role="tablist" aria-label="본문 표시 방식">
      <button
        type="button"
        role="tab"
        aria-selected={mode === "source"}
        className={`detail-body-view-tab ${mode === "source" ? "detail-body-view-tab--active" : ""}`}
        onClick={() => onChange("source")}
      >
        소스
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "markdown"}
        className={`detail-body-view-tab ${mode === "markdown" ? "detail-body-view-tab--active" : ""}`}
        onClick={() => onChange("markdown")}
      >
        Markdown 미리보기
      </button>
    </div>
  );
}

type MessageDetailExtrasProps = {
  detail: Record<string, unknown>;
  threadId?: string;
};

export function MessageDetailExtras({ detail, threadId }: MessageDetailExtrasProps) {
  const kind = typeof detail.kind === "string" ? detail.kind : "";
  const { currentSession, setCurrentSession } = useWorkflowStore();
  const [open, setOpen] = useState(false);
  const [discussPanel, setDiscussPanel] = useState<"overview" | "rejected" | "accepted">("overview");
  const [bodyView, setBodyView] = useState<BodyViewMode>("source");
  const [editText, setEditText] = useState("");
  const [examinerStatus, setExaminerStatus] = useState("approved");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const sessionState = currentSession?.state as Record<string, unknown> | undefined;

  const discussionRoundCompleted =
    typeof detail.discussion_round_completed === "number" ? detail.discussion_round_completed : null;

  const discussionEntry = useMemo(
    () => findDiscussionFeedbackEntry(sessionState?.discussion_feedback_history, discussionRoundCompleted),
    [discussionRoundCompleted, sessionState?.discussion_feedback_history],
  );

  const discussionRoster = useMemo(
    () => (discussionEntry ? rosterDiscussionRows(discussionEntry) : []),
    [discussionEntry],
  );

  const useDiscussionTriple =
    kind === "developer_patent" &&
    String(detail.phase ?? "") === "discussion" &&
    discussionRoundCompleted !== null &&
    discussionEntry !== null;

  const rejectedDiscussionRows = useDiscussionTriple ? discussionRoster.filter((r) => r.merit_score === 0) : [];
  const acceptedDiscussionRows = useDiscussionTriple
    ? discussionRoster.filter((r) => r.merit_score === 1 || r.merit_score === 2)
    : [];

  const discussionPatentSnapshot = useMemo(() => {
    const fromDetail =
      detail.patent_document && typeof detail.patent_document === "object" && !Array.isArray(detail.patent_document)
        ? (detail.patent_document as Record<string, unknown>)
        : null;
    if (!discussionEntry) {
      return fromDetail;
    }
    return patentAfterFromFeedbackEntry(discussionEntry) ?? fromDetail;
  }, [detail.patent_document, discussionEntry]);

  const discussionPatentMarkdown = useMemo(() => {
    if (!discussionPatentSnapshot) {
      return "";
    }
    return editTextToMarkdownPreview(stringifyValue(discussionPatentSnapshot), "developer_patent");
  }, [discussionPatentSnapshot]);

  const developerPatentEditMarkdown = useMemo(() => {
    const base = editTextToMarkdownPreview(editText, kind);
    if (!useDiscussionTriple || discussionRoster.length === 0) {
      return base;
    }
    return `${base}\n\n---\n\n${formatDiscussionRosterMarkdown(discussionRoster)}`;
  }, [editText, kind, useDiscussionTriple, discussionRoster]);

  const meta = useMemo(() => {
    if (kind === "expander") {
      return { title: "Expander 확장 제안", hint: "배열 JSON입니다. 저장하면 세션의 expander_suggestions 가 갱신됩니다." };
    }
    if (kind === "developer_patent") {
      return {
        title: `Developer 초안 (${String(detail.phase ?? "")})`,
        hint: "객체 JSON입니다. 저장하면 세션의 patent_document 가 갱신됩니다.",
      };
    }
    if (kind === "anchor") {
      return { title: "구조화(Anchor)", hint: "객체 JSON입니다. 저장하면 세션의 anchor_document 가 갱신됩니다." };
    }
    if (kind === "search_queries") {
      return {
        title: "특허 검색 쿼리",
        hint: "배열 JSON입니다. 저장하면 세션의 search_queries 가 갱신됩니다.",
      };
    }
    if (kind === "search_results") {
      return {
        title: "특허 검색 결과",
        hint: "배열 JSON입니다. 저장하면 세션의 search_results 가 갱신됩니다.",
      };
    }
    if (kind === "examiner_objections") {
      return {
        title: "심사 의견",
        hint: "아래는 이의(배열) JSON입니다. 상태는 드롭다운으로 고릅니다. 저장 시 examiner_objections · examiner_status 가 갱신됩니다.",
      };
    }
    return { title: "에이전트 부가 정보", hint: "" };
  }, [kind, detail.phase]);

  const refreshEditor = useCallback(() => {
    const st = sessionState;
    if (kind === "examiner_objections") {
      const obj = st?.examiner_objections ?? detail.objections;
      setEditText(stringifyValue(obj));
      setExaminerStatus(String(st?.examiner_status ?? detail.examiner_status ?? "approved"));
      return;
    }
    let value: unknown = detail;
    if (kind === "expander") {
      value = st?.expander_suggestions ?? detail.suggestions ?? [];
    } else if (kind === "developer_patent") {
      const rnd =
        typeof detail.discussion_round_completed === "number" ? detail.discussion_round_completed : null;
      if (rnd !== null && st) {
        const ent = findDiscussionFeedbackEntry(st.discussion_feedback_history, rnd);
        const afterDoc = ent ? patentAfterFromFeedbackEntry(ent) : undefined;
        value = afterDoc ?? detail.patent_document ?? st?.patent_document;
      } else {
        value = st?.patent_document ?? detail.patent_document;
      }
    } else if (kind === "anchor") {
      value = st?.anchor_document ?? detail.anchor_document;
    } else if (kind === "search_queries") {
      value = st?.search_queries ?? detail.queries ?? [];
    } else if (kind === "search_results") {
      value = st?.search_results ?? detail.results ?? [];
    }
    setEditText(stringifyValue(value));
  }, [kind, detail, sessionState]);

  useEffect(() => {
    if (open) {
      setSaveError(null);
      setBodyView("source");
      refreshEditor();
    }
  }, [open, refreshEditor]);

  const handleSave = async () => {
    if (!threadId) {
      setSaveError("세션을 찾을 수 없습니다.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      if (kind === "examiner_objections") {
        const parsed = JSON.parse(editText) as unknown;
        if (!Array.isArray(parsed)) {
          throw new Error("이의 목록은 JSON 배열이어야 합니다.");
        }
        const session = await patchSessionState(threadId, {
          examiner_objections: parsed,
          examiner_status: examinerStatus,
        });
        setCurrentSession(session);
        setOpen(false);
        return;
      }
      const parsed = JSON.parse(editText) as unknown;
      if (kind === "expander") {
        if (!Array.isArray(parsed)) {
          throw new Error("확장 제안은 JSON 배열이어야 합니다.");
        }
        const session = await patchSessionState(threadId, { expander_suggestions: parsed });
        setCurrentSession(session);
      } else if (kind === "developer_patent") {
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("초안은 JSON 객체여야 합니다.");
        }
        const session = await patchSessionState(threadId, {
          patent_document: parsed as Record<string, unknown>,
        });
        setCurrentSession(session);
      } else if (kind === "anchor") {
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
          throw new Error("Anchor는 JSON 객체여야 합니다.");
        }
        const session = await patchSessionState(threadId, {
          anchor_document: parsed as Record<string, unknown>,
        });
        setCurrentSession(session);
      } else if (kind === "search_queries") {
        if (!Array.isArray(parsed)) {
          throw new Error("검색 쿼리는 JSON 배열이어야 합니다.");
        }
        const session = await patchSessionState(threadId, { search_queries: parsed });
        setCurrentSession(session);
      } else if (kind === "search_results") {
        if (!Array.isArray(parsed)) {
          throw new Error("검색 결과는 JSON 배열이어야 합니다.");
        }
        const session = await patchSessionState(threadId, { search_results: parsed });
        setCurrentSession(session);
      }
      setOpen(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const patentEditableFields =
    EDITABLE.has(kind) && kind === "developer_patent" ? (
      <>
        {meta.hint ? <p className="detail-edit-hint">{meta.hint}</p> : null}
        <h4 className="discussion-round-section-title">갱신된 발명신고서 (편집·저장)</h4>
        <DetailBodyViewTabs mode={bodyView} onChange={setBodyView} />
        {bodyView === "source" ? (
          <textarea
            className="detail-edit-textarea detail-edit-textarea--body"
            onChange={(e) => setEditText(e.target.value)}
            spellCheck={false}
            value={editText}
          />
        ) : (
          <MarkdownPreview
            className="detail-edit-textarea--body"
            markdown={developerPatentEditMarkdown}
          />
        )}
      </>
    ) : null;

  const hideOuterBodyTabsForDiscussionDev = kind === "developer_patent" && Boolean(useDiscussionTriple);

  let body: ReactNode;
  if (EDITABLE.has(kind)) {
    body = (
      <>
        {!hideOuterBodyTabsForDiscussionDev && meta.hint ? <p className="detail-edit-hint">{meta.hint}</p> : null}
        {!hideOuterBodyTabsForDiscussionDev ? (
          <DetailBodyViewTabs mode={bodyView} onChange={setBodyView} />
        ) : null}
        {hideOuterBodyTabsForDiscussionDev ? (
          patentEditableFields
        ) : bodyView === "source" ? (
          kind === "examiner_objections" ? (
            <>
              <label className="detail-edit-label" htmlFor="detail-examiner-json">
                examiner_objections (JSON 배열)
              </label>
              <textarea
                className="detail-edit-textarea detail-edit-textarea--body"
                id="detail-examiner-json"
                onChange={(e) => setEditText(e.target.value)}
                spellCheck={false}
                value={editText}
              />
              <div className="detail-examiner-status-row">
                <label className="detail-edit-label" htmlFor="detail-examiner-status">
                  examiner_status
                </label>
                <select
                  className="detail-examiner-select"
                  id="detail-examiner-status"
                  onChange={(e) => setExaminerStatus(e.target.value)}
                  value={examinerStatus}
                >
                  <option value="approved">approved</option>
                  <option value="rejected">rejected</option>
                </select>
              </div>
            </>
          ) : (
            <textarea
              className="detail-edit-textarea detail-edit-textarea--body"
              onChange={(e) => setEditText(e.target.value)}
              spellCheck={false}
              value={editText}
            />
          )
        ) : (
          <MarkdownPreview
            className="detail-edit-textarea--body"
            markdown={editTextToMarkdownPreview(editText, kind)}
          />
        )}
        {kind === "examiner_objections" && bodyView === "markdown" ? (
          <div className="detail-examiner-status-row detail-examiner-status-row--after-preview">
            <label className="detail-edit-label" htmlFor="detail-examiner-status-preview">
              examiner_status (저장 값)
            </label>
            <select
              className="detail-examiner-select"
              id="detail-examiner-status-preview"
              onChange={(e) => setExaminerStatus(e.target.value)}
              value={examinerStatus}
            >
              <option value="approved">approved</option>
              <option value="rejected">rejected</option>
            </select>
          </div>
        ) : null}
      </>
    );
  } else {
    body = (
      <>
        <DetailBodyViewTabs mode={bodyView} onChange={setBodyView} />
        {bodyView === "source" ? (
          <pre className="detail-json-block detail-json-block--body">{stringifyValue(detail)}</pre>
        ) : (
          <MarkdownPreview
            className="detail-json-block--body"
            markdown={detailRecordToMarkdown(detail, kind)}
          />
        )}
      </>
    );
  }

  const footer =
    EDITABLE.has(kind) && threadId ? (
      <div className="detail-modal-footer-inner">
        {saveError ? <p className="detail-save-error">{saveError}</p> : null}
        <button
          className="btn btn-primary"
          disabled={saving || !threadId}
          type="button"
          onClick={() => void handleSave()}
        >
          {saving ? "저장 중…" : "상태에 저장"}
        </button>
      </div>
    ) : EDITABLE.has(kind) && !threadId ? (
      <p className="detail-save-error">세션이 없어 저장할 수 없습니다.</p>
    ) : null;

  const modalFooter =
    useDiscussionTriple && discussPanel !== "overview" ? null : footer;

  const openDiscussPanel = useCallback((panel: typeof discussPanel) => {
    setDiscussPanel(panel);
    setOpen(true);
  }, []);

  const directiveText = discussionEntry?.human_directive;
  const directiveStr = typeof directiveText === "string" ? directiveText.trim() : "";

  const patentReadonlyPreview =
    discussionPatentMarkdown.trim() !== "" ? (
      <section className="discussion-round-section">
        <h4 className="discussion-round-section-title">갱신된 발명신고서</h4>
        <MarkdownPreview className="discussion-patent-md" markdown={discussionPatentMarkdown} />
      </section>
    ) : null;

  const modalBody: ReactNode = useDiscussionTriple ? (
    <>
      <div className="discussion-detail-tabstrip" role="tablist" aria-label="논의 라운드 보기">
        <button
          type="button"
          role="tab"
          aria-selected={discussPanel === "overview"}
          className={`discussion-detail-tab ${discussPanel === "overview" ? "discussion-detail-tab--active" : ""}`}
          onClick={() => setDiscussPanel("overview")}
        >
          상세보기
        </button>
        {rejectedDiscussionRows.length > 0 ? (
          <button
            type="button"
            role="tab"
            aria-selected={discussPanel === "rejected"}
            className={`discussion-detail-tab ${discussPanel === "rejected" ? "discussion-detail-tab--active" : ""}`}
            onClick={() => setDiscussPanel("rejected")}
          >
            거절보고
          </button>
        ) : null}
        {acceptedDiscussionRows.length > 0 ? (
          <button
            type="button"
            role="tab"
            aria-selected={discussPanel === "accepted"}
            className={`discussion-detail-tab ${discussPanel === "accepted" ? "discussion-detail-tab--active" : ""}`}
            onClick={() => setDiscussPanel("accepted")}
          >
            유지·채택
          </button>
        ) : null}
      </div>

      {discussPanel === "overview" ? (
        <div className="discussion-panel discussion-panel--overview">
          <section className="discussion-round-section">
            <h4 className="discussion-round-section-title">라운드 · 사람 지시</h4>
            <p className="discussion-round-meta">
              논의 라운드 {discussionRoundCompleted} · 확장안 반영 후 Developer 초안 (JSON 편집은 하단에서 가능)
            </p>
            {directiveStr ? (
              <blockquote className="discussion-directive">{directiveStr}</blockquote>
            ) : (
              <p className="discussion-muted">별도 전역 메모 없음.</p>
            )}
          </section>

          <section className="discussion-round-section">
            <h4 className="discussion-round-section-title">제안별 판정 (Expander 스냅샷 대비)</h4>
            {discussionRoster.length > 0 ? (
              <div className="discussion-decision-table-wrap">
                <table className="discussion-decision-table">
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>유형</th>
                      <th>적합도</th>
                      <th>사유·보완 메모</th>
                      <th>요지</th>
                    </tr>
                  </thead>
                  <tbody>
                    {discussionRoster.map((row) => {
                      const label =
                        row.merit_score === 2
                          ? "2 · 완전 적합"
                          : row.merit_score === 1
                            ? "1 · 유지·보완"
                            : "0 · 배제";
                      const reasonCell =
                        row.merit_score === 0 || row.merit_score === 1
                          ? row.reason.trim() || "—"
                          : "—";
                      return (
                        <tr key={row.suggestion_id}>
                          <td>
                            <code className="discussion-code">{row.suggestion_id}</code>
                          </td>
                          <td>{row.suggestionType || "—"}</td>
                          <td>{label}</td>
                          <td className="discussion-td-reason">{reasonCell}</td>
                          <td className="discussion-td-content">
                            {row.content.length > 500 ? `${row.content.slice(0, 500)}…` : row.content || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="discussion-muted">연결된 제안 스냅샷이 없습니다.</p>
            )}
          </section>

          {patentEditableFields}
        </div>
      ) : null}

      {discussPanel === "rejected" && rejectedDiscussionRows.length > 0 ? (
        <div className="discussion-panel discussion-panel--rejected">
          <ul className="discussion-report-list">
            {rejectedDiscussionRows.map((row) => (
              <li key={row.suggestion_id} className="discussion-report-card discussion-report-card--rejected">
                <div className="discussion-report-head">
                  <code className="discussion-code">{row.suggestion_id}</code>
                  {row.suggestionType ? (
                    <span className="discussion-report-type">{row.suggestionType}</span>
                  ) : null}
                </div>
                <p className="discussion-report-content">{row.content || "—"}</p>
                {row.reason.trim() ? (
                  <p className="discussion-report-reason">
                    <strong>거절 사유</strong> {row.reason}
                  </p>
                ) : (
                  <p className="discussion-muted">거절 사유가 비어 있습니다.</p>
                )}
              </li>
            ))}
          </ul>
          {patentReadonlyPreview}
        </div>
      ) : null}

      {discussPanel === "accepted" && acceptedDiscussionRows.length > 0 ? (
        <div className="discussion-panel discussion-panel--accepted">
          <ul className="discussion-report-list">
            {acceptedDiscussionRows.map((row) => (
              <li key={row.suggestion_id} className="discussion-report-card discussion-report-card--accepted">
                <div className="discussion-report-head">
                  <code className="discussion-code">{row.suggestion_id}</code>
                  <span className="discussion-report-merit">{meritLabelKr(row.merit_score)}</span>
                  {row.suggestionType ? (
                    <span className="discussion-report-type">{row.suggestionType}</span>
                  ) : null}
                </div>
                <p className="discussion-report-content">{row.content || "—"}</p>
                {row.merit_score === 1 ? (
                  row.reason.trim() ? (
                    <p className="discussion-report-reason">
                      <strong>보완·리스크 메모</strong> {row.reason}
                    </p>
                  ) : (
                    <p className="discussion-muted">보완 메모가 비어 있습니다.</p>
                  )
                ) : null}
              </li>
            ))}
          </ul>
          {patentReadonlyPreview}
        </div>
      ) : null}
    </>
  ) : (
    body
  );

  return (
    <>
      {useDiscussionTriple ? (
        <div className="message-detail-trigger-row">
          <button
            className="message-detail-trigger"
            type="button"
            onClick={() => openDiscussPanel("overview")}
          >
            상세보기
          </button>
          {rejectedDiscussionRows.length > 0 ? (
            <button
              className="message-detail-trigger message-detail-trigger--secondary"
              type="button"
              onClick={() => openDiscussPanel("rejected")}
            >
              거절보고
            </button>
          ) : null}
          {acceptedDiscussionRows.length > 0 ? (
            <button
              className="message-detail-trigger message-detail-trigger--secondary"
              type="button"
              onClick={() => openDiscussPanel("accepted")}
            >
              유지·채택
            </button>
          ) : null}
        </div>
      ) : (
        <button className="message-detail-trigger" type="button" onClick={() => setOpen(true)}>
          상세보기
        </button>
      )}
      <DetailModal footer={modalFooter} open={open} title={meta.title} onClose={() => setOpen(false)}>
        {modalBody}
      </DetailModal>
    </>
  );
}

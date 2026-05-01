import { useCallback, useState } from "react";

import { useWorkflowStore } from "../../stores/workflowStore";
import { DirectiveInput } from "../human/DirectiveInput";
import { SuggestionDecisionsPanel } from "../human/SuggestionDecisionsPanel";
import { MarkdownPreview } from "../ui/MarkdownPreview";
import { MarkdownImportPanel } from "./MarkdownImportPanel";

type DocViewMode = "source" | "markdown";

export function SharedDocPanel() {
  const { fileSystemSupported, sharedDocumentDraft, setSharedDocumentDraft } = useWorkflowStore();

  /** 기본 접힘 — 펼칠 때만 제목·textarea 사이에 불러오기 영역 표시 */
  const [mdImportExpanded, setMdImportExpanded] = useState(false);
  const [docView, setDocView] = useState<DocViewMode>("source");

  const handleMarkdownLoaded = useCallback(
    (text: string) => {
      setSharedDocumentDraft(text);
      setMdImportExpanded(false);
    },
    [setSharedDocumentDraft],
  );

  return (
    <section className="panel panel-shared-doc">
      <div className="shared-doc-heading">
        <h2 className="shared-doc-title">공유 작업 문서</h2>
        <div className="shared-doc-heading-actions">
          <button
            aria-expanded={mdImportExpanded}
            className="shared-md-toolbar-toggle"
            type="button"
            onClick={() => setMdImportExpanded((v) => !v)}
          >
            <span>Markdown 불러오기</span>
            <span aria-hidden className="shared-md-toolbar-toggle-chevron">
              {mdImportExpanded ? "▼" : "▶"}
            </span>
          </button>
        </div>
      </div>

      {!fileSystemSupported ? (
        <p className="shared-doc-fs-hint">이 브라우저는 프로젝트 폴더 직접 연결을 지원하지 않습니다.</p>
      ) : null}

      <MarkdownImportPanel embeddedToggle={false} expanded={mdImportExpanded} onLoaded={handleMarkdownLoaded} />

      <div className="shared-doc-editor-block">
        <div className="detail-body-view-tabs shared-doc-body-view-tabs" role="tablist" aria-label="문서 표시 방식">
          <button
            type="button"
            role="tab"
            aria-selected={docView === "source"}
            className={`detail-body-view-tab ${docView === "source" ? "detail-body-view-tab--active" : ""}`}
            onClick={() => setDocView("source")}
          >
            원문 편집
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={docView === "markdown"}
            className={`detail-body-view-tab ${docView === "markdown" ? "detail-body-view-tab--active" : ""}`}
            onClick={() => setDocView("markdown")}
          >
            Markdown 미리보기
          </button>
        </div>
        {docView === "source" ? (
          <textarea
            className="shared-doc-editor"
            value={sharedDocumentDraft}
            onChange={(e) => setSharedDocumentDraft(e.target.value)}
            placeholder="발명 아이디어 또는 초안을 입력하거나, 위 「Markdown 불러오기」를 펼쳐 파일을 넣은 뒤 화면 하단 「다음 단계」로 구조화를 시작하세요."
          />
        ) : (
          <div className="shared-doc-markdown-shell">
            <MarkdownPreview
              className="shared-doc-markdown-preview"
              markdown={
                sharedDocumentDraft.trim()
                  ? sharedDocumentDraft
                  : "_아직 내용이 없습니다. 「원문 편집」에서 입력하거나 Markdown을 불러오세요._"
              }
            />
          </div>
        )}
      </div>

      <DirectiveInput />
      <SuggestionDecisionsPanel />
    </section>
  );
}

import { useId, useMemo, useState } from "react";

import { savePatentExport, type PatentExportFormat } from "../../lib/patentExport";
import { useWorkflowStore } from "../../stores/workflowStore";

function str(v: unknown): string {
  if (v === null || v === undefined) {
    return "";
  }
  return String(v).trim();
}

function formatClaims(doc: Record<string, unknown>): string {
  const ind = Array.isArray(doc.claims_independent) ? doc.claims_independent : [];
  const dep = Array.isArray(doc.claims_dependent) ? doc.claims_dependent : [];
  if (ind.length === 0 && dep.length === 0) {
    return "";
  }

  const parts: string[] = [];
  if (ind.length) {
    parts.push(
      "**[독립항]**",
      ...(ind as unknown[]).map((c, i) => `${i + 1}. ${String(c)}`),
    );
  }
  if (dep.length) {
    parts.push(
      "**[종속항]**",
      ...(dep as unknown[]).map((c, i) => `${i + 1}. ${String(c)}`),
    );
  }
  return parts.join("\n\n");
}

const SHARED_DRAFT_SECTION_LABEL = "공유 작업 문서 (draft)";

const SECTIONS: Array<{ label: string; getHtml: (d: Record<string, unknown>) => string }> = [
  {
    label: "발명 명칭",
    getHtml: (d) => str(d.title),
  },
  {
    label: "기술 분야",
    getHtml: (d) => str(d.field),
  },
  {
    label: "배경 기술",
    getHtml: (d) => str(d.background),
  },
  {
    label: "해결 과제",
    getHtml: (d) => str(d.problem),
  },
  {
    label: "과제 해결 수단",
    getHtml: (d) => str(d.solution),
  },
  {
    label: "발명 효과",
    getHtml: (d) => str(d.effects),
  },
  {
    label: "도면 설명",
    getHtml: (d) => str(d.drawings),
  },
  {
    label: "실시를 위한 구체적 내용",
    getHtml: (d) => str(d.embodiments),
  },
  {
    label: "청구항",
    getHtml: (d) => formatClaims(d),
  },
  {
    label: "선행기술 비교표",
    getHtml: (d) => str(d.prior_art_comparison),
  },
  {
    label: "요약서",
    getHtml: (d) => str(d.abstract),
  },
  {
    label: SHARED_DRAFT_SECTION_LABEL,
    getHtml: (d) => str(d.draft),
  },
];

/** 가운데 패널(공유 작업 문서)과 동일 텍스트면 발명신고서 카드에서 draft 란을 숨긴다. */
function textEquivalentForUi(a: string, b: string): boolean {
  const n = (t: string) => t.replace(/\r\n/g, "\n").trim();
  return n(a) === n(b);
}

export function PatentDocPanel() {
  const { currentSession, sharedDocumentDraft } = useWorkflowStore();
  const patentHelpTooltipId = useId();
  const [exportFormat, setExportFormat] = useState<PatentExportFormat>("markdown");
  const [exportBusy, setExportBusy] = useState(false);
  const patentRaw = currentSession?.state?.patent_document;
  const patentDocument =
    patentRaw !== null &&
    patentRaw !== undefined &&
    typeof patentRaw === "object" &&
    !Array.isArray(patentRaw)
      ? (patentRaw as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const rows = useMemo(() => {
    const hideDuplicateDraft = textEquivalentForUi(str(patentDocument.draft), sharedDocumentDraft);
    return SECTIONS.filter((sec) => {
      if (sec.label === SHARED_DRAFT_SECTION_LABEL && hideDuplicateDraft) {
        return false;
      }
      return true;
    }).map(({ label, getHtml }) => ({
      label,
      text: getHtml(patentDocument),
    }));
  }, [patentDocument, patentRaw, sharedDocumentDraft]);

  const hasPatentPayload = useMemo(() => {
    if (!patentRaw || typeof patentRaw !== "object" || Array.isArray(patentRaw)) {
      return false;
    }
    return rows.some((r) => (r.text || "").trim().length > 0);
  }, [patentRaw, rows]);

  const handleExport = () => {
    if (!hasPatentPayload) {
      window.alert("저장할 발명신고서 내용이 없습니다.");
      return;
    }
    setExportBusy(true);
    const base = (currentSession?.project_name || "patent-draft").trim() || "patent-draft";
    void savePatentExport(patentDocument, exportFormat, base)
      .catch((e) => window.alert(e instanceof Error ? e.message : "내보내기에 실패했습니다."))
      .finally(() => setExportBusy(false));
  };

  return (
    <section className="panel">
      <div className="panel-heading-row">
        <div className="panel-title-with-help">
          <h2>발명신고서</h2>
          <span className="patent-help-wrap">
            <button
              type="button"
              className="patent-help-icon"
              aria-label="발명신고서 패널 안내"
              aria-describedby={patentHelpTooltipId}
            >
              ?
            </button>
            <div
              className="patent-help-popup"
              id={patentHelpTooltipId}
              role="tooltip"
            >
              아래 필드는 서버 상태의 영문 필드 명(
              <code className="inline-code-snippet">patent_document</code>)과 매핑됩니다. 채팅의 Agent&nbsp;1 상세
              보기(JSON)와 동일한 초안입니다. Markdown·Word는 저장 위치를 고르고, PDF는 인쇄 대화상자에서
              &quot;PDF로 저장&quot;을 선택하세요.
            </div>
          </span>
        </div>
        <div className="patent-export-bar" role="group" aria-label="발명신고서 파일 내보내기">
          <label className="patent-export-label">
            형식
            <select
              className="patent-export-select"
              value={exportFormat}
              onChange={(e) => setExportFormat(e.target.value as PatentExportFormat)}
              disabled={exportBusy}
            >
              <option value="markdown">Markdown (.md)</option>
              <option value="docx">Word (.docx)</option>
              <option value="pdf">PDF (인쇄)</option>
            </select>
          </label>
          <button
            type="button"
            className="btn btn-primary patent-export-btn"
            disabled={exportBusy}
            onClick={handleExport}
            title="저장 위치는 브라우저 파일 대화상자에서 선택합니다. PDF는 인쇄 창에서 PDF로 저장하세요."
          >
            {exportBusy ? "처리 중…" : "다른 이름으로 저장…"}
          </button>
        </div>
      </div>
      <div className="section-list">
        {rows.map(({ label, text }) => (
          <article className="section-card section-card--patent-field" key={label}>
            <div className="section-meta">
              <strong>{label}</strong>
            </div>
            <pre className="section-card-pre">{text || "아직 생성되지 않았습니다."}</pre>
          </article>
        ))}
      </div>
    </section>
  );
}

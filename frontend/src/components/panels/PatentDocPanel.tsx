import { useMemo } from "react";

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
    getHtml: (d) => {
      const summary = str(d.abstract);
      const draft = str(d.draft);
      if (summary && draft) {
        return `${summary}\n\n---\n\n**공유/working draft**\n\n${draft}`;
      }
      return summary || draft;
    },
  },
];

export function PatentDocPanel() {
  const { currentSession } = useWorkflowStore();
  const patentRaw = currentSession?.state?.patent_document;
  const patentDocument =
    patentRaw !== null &&
    patentRaw !== undefined &&
    typeof patentRaw === "object" &&
    !Array.isArray(patentRaw)
      ? (patentRaw as Record<string, unknown>)
      : ({} as Record<string, unknown>);

  const rows = useMemo(
    () =>
      SECTIONS.map(({ label, getHtml }) => ({
        label,
        text: getHtml(patentDocument),
      })),
    [patentDocument, patentRaw],
  );

  return (
    <section className="panel">
      <h2>발명신고서</h2>
      <p className="panel-patent-hint">
        아래 필드는 서버 상태의 영문 필드 명(<code className="inline-code-snippet">patent_document</code>)과
        매핑됩니다. 채팅의 Agent&nbsp;1 상세 보기(JSON)와 동일한 초안입니다.
      </p>
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

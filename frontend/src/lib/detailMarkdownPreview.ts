/** 상세 모달 본문을 Markdown 미리보기용 문자열로 변환 */

function str(v: unknown): string {
  if (v == null) {
    return "";
  }
  return String(v).trim();
}

function block(title: string, body: string): string {
  const t = body.trim();
  if (!t) {
    return "";
  }
  return `## ${title}\n\n${t}\n\n`;
}

export function jsonValueToMarkdown(data: unknown, kind: string): string {
  if (data == null) {
    return "_내용 없음_";
  }

  if (kind === "expander" && Array.isArray(data)) {
    if (data.length === 0) {
      return "_확장 제안 항목이 없습니다._";
    }
    return data
      .map((item, i) => {
        if (!item || typeof item !== "object") {
          return `- 항목 ${i + 1}: \`${String(item)}\``;
        }
        const o = item as Record<string, unknown>;
        const id = str(o.id) || `항목 ${i + 1}`;
        const typ = str(o.type);
        const content = str(o.content);
        return `### ${id}${typ ? ` _(${typ})_` : ""}\n\n${content || "_내용 없음_"}\n`;
      })
      .join("\n");
  }

  if (kind === "search_queries" && Array.isArray(data)) {
    if (data.length === 0) {
      return "_검색 쿼리 없음_";
    }
    return data
      .map((row, i) => {
        if (!row || typeof row !== "object") {
          return `${i + 1}. \`${String(row)}\``;
        }
        const o = row as Record<string, unknown>;
        return `${i + 1}. **${str(o.database)}** · \`${str(o.query)}\` · _${str(o.target_component)}_`;
      })
      .join("\n");
  }

  if (kind === "search_results" && Array.isArray(data)) {
    if (data.length === 0) {
      return "_검색 결과 없음_";
    }
    return data
      .map((row, i) => {
        if (!row || typeof row !== "object") {
          return `- ${String(row)}`;
        }
        const o = row as Record<string, unknown>;
        const title = str(o.title) || str(o.patent_number);
        const num = str(o.patent_number);
        const app = str(o.application_number);
        const lines = [`### ${i + 1}. ${title || "문헌"}`];
        if (num) {
          lines.push(`- **번호:** ${num}`);
        }
        if (app) {
          lines.push(`- **출원:** ${app}`);
        }
        if (o.applicant_name) {
          lines.push(`- **출원인:** ${str(o.applicant_name)}`);
        }
        if (o.ipc_number) {
          lines.push(`- **IPC:** ${str(o.ipc_number)}`);
        }
        return lines.join("\n");
      })
      .join("\n\n");
  }

  if (kind === "examiner_objections" && Array.isArray(data)) {
    if (data.length === 0) {
      return "_이의 없음_";
    }
    return data
      .map((row, i) => {
        if (!row || typeof row !== "object") {
          return `- ${String(row)}`;
        }
        const o = row as Record<string, unknown>;
        return [
          `### 이의 ${i + 1}: ${str(o.type) || "유형 미상"}`,
          str(o.reason) || "_사유 없음_",
          o.cited_patents && Array.isArray(o.cited_patents)
            ? `**인용:** ${(o.cited_patents as unknown[]).map(String).join(", ")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n\n");
      })
      .join("\n\n");
  }

  if (typeof data === "object" && !Array.isArray(data) && data !== null) {
    const o = data as Record<string, unknown>;

    if (kind === "anchor") {
      let md = "";
      md += block("요약", str(o.summary));
      md += block("해결 과제", str(o.problem_solved));
      md += block("데이터 흐름", str(o.data_flow));
      md += block("시스템 경계", str(o.system_boundary));
      if (Array.isArray(o.key_technologies) && o.key_technologies.length) {
        md += "## 핵심 기술\n\n";
        md += (o.key_technologies as unknown[]).map((t) => `- ${String(t)}`).join("\n");
        md += "\n\n";
      }
      if (Array.isArray(o.ipc_candidates) && o.ipc_candidates.length) {
        md += "## IPC 후보\n\n";
        md += (o.ipc_candidates as unknown[]).map((t) => `- \`${String(t)}\``).join("\n");
        md += "\n\n";
      }
      if (Array.isArray(o.components) && o.components.length) {
        md += "## 구성요소\n\n";
        for (const c of o.components) {
          if (!c || typeof c !== "object") {
            continue;
          }
          const co = c as Record<string, unknown>;
          const ess = co.essential ? "(핵심)" : "";
          md += `### ${str(co.name)} ${ess}\n\n${str(co.description)}\n\n`;
        }
      }
      return md.trim() || "_표시할 필드가 없습니다._";
    }

    if (kind === "developer_patent") {
      let md = "";
      md += block("발명의 명칭", str(o.title));
      md += block("기술분야", str(o.field));
      md += block("배경기술", str(o.background));
      md += block("과제", str(o.problem));
      md += block("해결 수단", str(o.solution));
      md += block("효과", str(o.effects));
      md += block("도면의 간단한 설명", str(o.drawings));
      md += block("발명을 실시하기 위한 구체적 내용", str(o.embodiments));
      md += block("선행기술 대비", str(o.prior_art_comparison));
      md += block("요약", str(o.abstract));
      md += block("확장 제안 검토 요약 (discussion)", str(o.expander_decisions_summary));
      if (str(o.draft)) {
        md += "## 공유 작업 문서 (draft)\n\n";
        md += String(o.draft).trim();
        md += "\n\n";
      }
      if (Array.isArray(o.claims_independent) && o.claims_independent.length) {
        md += "## 독립항\n\n";
        md += (o.claims_independent as unknown[])
          .map((c, i) => `${i + 1}. ${String(c)}`)
          .join("\n\n");
        md += "\n\n";
      }
      if (Array.isArray(o.claims_dependent) && o.claims_dependent.length) {
        md += "## 종속항\n\n";
        md += (o.claims_dependent as unknown[])
          .map((c, i) => `${i + 1}. ${String(c)}`)
          .join("\n\n");
        md += "\n\n";
      }
      return md.trim() || "_표시할 필드가 없습니다._";
    }

    return "```json\n" + JSON.stringify(data, null, 2) + "\n```";
  }

  return "```\n" + String(data) + "\n```";
}

/** 발명신고서 JSON → 내보내기·미리보기용 마크다운 */
export function patentDocumentToMarkdown(doc: Record<string, unknown>): string {
  return jsonValueToMarkdown(doc, "developer_patent");
}

export function editTextToMarkdownPreview(editText: string, kind: string): string {
  const t = editText.trim();
  if (!t) {
    return "_비어 있습니다._";
  }
  try {
    const parsed = JSON.parse(editText) as unknown;
    return jsonValueToMarkdown(parsed, kind);
  } catch {
    return (
      "_JSON으로 파싱할 수 없어 원문을 코드 블록으로 표시합니다._\n\n```\n" +
      editText +
      "\n```"
    );
  }
}

export function detailRecordToMarkdown(detail: Record<string, unknown>, kind: string): string {
  const k = kind || (typeof detail.kind === "string" ? detail.kind : "");
  const pick = (): unknown => {
    switch (k) {
      case "expander":
        return detail.suggestions;
      case "developer_patent":
        return detail.patent_document;
      case "anchor":
        return detail.anchor_document;
      case "search_queries":
        return detail.queries;
      case "search_results":
        return detail.results;
      case "examiner_objections":
        return detail.objections;
      default:
        return detail;
    }
  };
  return jsonValueToMarkdown(pick(), k);
}

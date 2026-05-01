import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

import { patentDocumentToMarkdown } from "./detailMarkdownPreview";

export type PatentExportFormat = "markdown" | "docx" | "pdf";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 마크다운 본문을 단락 단위로 Word에 넣기 (## 제목 = Heading2) */
function markdownExportToDocxParagraphs(md: string): Paragraph[] {
  const blocks = md.split(/\n\n+/);
  const out: Paragraph[] = [];
  for (const raw of blocks) {
    const b = raw.trim();
    if (!b) {
      continue;
    }
    if (b.startsWith("## ")) {
      const rest = b.slice(3);
      const nl = rest.indexOf("\n");
      if (nl === -1) {
        out.push(new Paragraph({ text: rest.trim(), heading: HeadingLevel.HEADING_2 }));
      } else {
        out.push(new Paragraph({ text: rest.slice(0, nl).trim(), heading: HeadingLevel.HEADING_2 }));
        const body = rest.slice(nl + 1).trim();
        if (body) {
          out.push(new Paragraph({ children: [new TextRun(body)] }));
        }
      }
    } else {
      out.push(new Paragraph({ children: [new TextRun(b.replace(/\n{3,}/g, "\n\n"))] }));
    }
  }
  return out;
}

export async function patentDocumentToDocxBlob(doc: Record<string, unknown>): Promise<Blob> {
  const md = patentDocumentToMarkdown(doc);
  const children = [
    new Paragraph({ text: "발명신고서 초안", heading: HeadingLevel.TITLE }),
    ...markdownExportToDocxParagraphs(md),
  ];
  const file = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });
  return Packer.toBlob(file);
}

function openPrintWindow(html: string): void {
  const w = window.open("", "_blank");
  if (!w) {
    window.alert("팝업이 차단되어 인쇄 창을 열 수 없습니다.");
    return;
  }
  w.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"/><title>발명신고서</title>
<style>
  body{font-family:"Malgun Gothic",system-ui,sans-serif;max-width:900px;margin:28px auto;padding:0 16px;line-height:1.55;color:#1a1a1a}
  h1{font-size:1.35rem;margin:0 0 1rem}
  pre{white-space:pre-wrap;word-break:break-word;font-size:12.5px}
  @media print{body{margin:12px}}
</style></head><body>${html}</body></html>`);
  w.document.close();
  w.focus();
  requestAnimationFrame(() => {
    w.print();
  });
}

/** PDF: 브라우저 인쇄 대화상자에서 "PDF로 저장" 선택 */
export function openPatentPrintAsPdf(doc: Record<string, unknown>): void {
  const md = patentDocumentToMarkdown(doc);
  const body = `<h1>발명신고서 초안</h1><pre>${escapeHtml(md)}</pre>`;
  openPrintWindow(body);
}

type WindowWithSavePicker = Window & {
  showSaveFilePicker?: (options: {
    suggestedName?: string;
    types?: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<FileSystemFileHandle>;
};

async function saveBlobWithFilePicker(
  blob: Blob,
  suggestedName: string,
  accept: Record<string, string[]>,
): Promise<void> {
  const w = window as WindowWithSavePicker;
  if (typeof w.showSaveFilePicker === "function") {
    const handle = await w.showSaveFilePicker({
      suggestedName,
      types: [{ description: "내보내기", accept }],
    });
    const stream = await handle.createWritable();
    await stream.write(await blob.arrayBuffer());
    await stream.close();
    return;
  }
  const a = document.createElement("a");
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = suggestedName;
  a.click();
  URL.revokeObjectURL(url);
}

export async function savePatentExport(
  doc: Record<string, unknown>,
  format: PatentExportFormat,
  baseName = "patent-draft",
): Promise<void> {
  const safe = baseName.replace(/[<>:"/\\|?*]+/g, "_").slice(0, 80) || "patent-draft";
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === "markdown") {
    const md = patentDocumentToMarkdown(doc);
    const blob = new Blob([`\uFEFF${md}`], { type: "text/markdown;charset=utf-8" });
    await saveBlobWithFilePicker(blob, `${safe}-${stamp}.md`, {
      "text/markdown": [".md"],
    });
    return;
  }

  if (format === "docx") {
    const blob = await patentDocumentToDocxBlob(doc);
    await saveBlobWithFilePicker(blob, `${safe}-${stamp}.docx`, {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    });
    return;
  }

  openPatentPrintAsPdf(doc);
}

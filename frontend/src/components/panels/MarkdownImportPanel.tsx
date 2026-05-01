import type { DragEvent } from "react";
import { useCallback, useRef, useState } from "react";

import {
  isMarkdownFileByName,
  pickMarkdownFileWithNavigator,
  readMarkdownFileUtf8,
} from "../../lib/markdownImport";

type MarkdownImportPanelProps = {
  onLoaded: (text: string) => void;
  expanded: boolean;
  /** embeddedToggle 이 true 일 때만 사용(패널 안 토글) */
  onToggleExpanded?: () => void;
  /** false: 제목 줄에서 토글을 따로 두고, 여기서는 펼쳤을 때 본문만 렌더 */
  embeddedToggle?: boolean;
};

export function MarkdownImportPanel({
  onLoaded,
  expanded,
  onToggleExpanded,
  embeddedToggle = true,
}: MarkdownImportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  const ingestFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file) {
        return;
      }
      if (!isMarkdownFileByName(file)) {
        window.alert("Markdown 파일(.md, .markdown)만 불러올 수 있습니다.");
        return;
      }
      try {
        const text = await readMarkdownFileUtf8(file);
        onLoaded(text);
      } catch {
        window.alert("파일을 읽을 수 없습니다.");
      }
    },
    [onLoaded],
  );

  const handleBrowseClick = async () => {
    const input = fileInputRef.current;
    if (!input) {
      return;
    }
    const file = await pickMarkdownFileWithNavigator(input);
    await ingestFile(file);
  };

  const onDragEnter = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      setDragActive(true);
    }
  };

  const onDragLeave = (e: DragEvent) => {
    const next = e.relatedTarget as Node | null;
    if (next && (e.currentTarget as HTMLElement).contains(next)) {
      return;
    }
    setDragActive(false);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.types.includes("Files")) {
      e.dataTransfer.dropEffect = "copy";
    }
  };

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    await ingestFile(file);
  };

  const inner = expanded ? (
    <>
      <div className="shared-md-import-header">
        <p className="shared-md-import-sub">
          <strong>파일 탐색</strong>으로 고르거나, 아래 영역으로 .md 파일을 끌어다 놓을 수 있습니다. 불러오면 입력란이
          덮어써집니다.
        </p>
      </div>
      <input
        ref={fileInputRef}
        accept=".md,.markdown,text/markdown"
        aria-hidden
        className="visually-hidden"
        tabIndex={-1}
        type="file"
      />
      <div
        aria-label="Markdown 파일 드래그 앤 드롭 영역"
        className={"shared-md-dropzone" + (dragActive ? " shared-md-dropzone--active" : "")}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={(e) => void onDrop(e)}
        role="region"
      >
        <span className="shared-md-dropzone-logo" aria-hidden>
          MD
        </span>
        <p className="shared-md-dropzone-text">
          {dragActive ? "파일을 놓으면 아래 입력란에 반영합니다." : "탐색기에서 끌어다 놓거나"}
        </p>
        <button className="btn btn-subtle" type="button" onClick={() => void handleBrowseClick()}>
          파일 탐색에서 선택…
        </button>
        <p className="shared-md-dropzone-caption">불러온 내용은 기존 입력을 덮어씁니다.</p>
      </div>
    </>
  ) : null;

  if (!embeddedToggle) {
    if (!expanded) {
      return null;
    }
    return (
      <div className="shared-md-import shared-md-import--expanded shared-md-import--between-heading-editor">
        {inner}
      </div>
    );
  }

  return (
    <div className={`shared-md-import${expanded ? " shared-md-import--expanded" : " shared-md-import--compact"}`}>
      <button
        aria-expanded={expanded}
        className="shared-md-import-toggle"
        type="button"
        onClick={() => onToggleExpanded?.()}
      >
        <span className="shared-md-import-toggle-label">Markdown 불러오기</span>
        <span aria-hidden className="shared-md-import-toggle-chevron">
          {expanded ? "▼" : "▶"}
        </span>
      </button>

      {expanded ? inner : null}
    </div>
  );
}

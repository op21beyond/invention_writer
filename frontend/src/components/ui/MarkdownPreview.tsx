import Markdown from "react-markdown";

type MarkdownPreviewProps = {
  markdown: string;
  className?: string;
};

export function MarkdownPreview({ markdown, className }: MarkdownPreviewProps) {
  return (
    <div className={`detail-markdown-preview ${className ?? ""}`.trim()}>
      <Markdown>{markdown}</Markdown>
    </div>
  );
}

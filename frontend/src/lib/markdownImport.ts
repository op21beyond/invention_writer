/**
 * Opens the OS file-navigation dialog when possible (`showOpenFilePicker`),
 * otherwise falls back to a legacy `<input type="file">` click (same navigator UI on desktop).
 */

type MarkdownOpenFilePickerOptions = {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: Array<{ description: string; accept: Record<string, string[]> }>;
};

type WindowWithOpenFilePicker = Window & {
  showOpenFilePicker?: (
    options?: MarkdownOpenFilePickerOptions,
  ) => Promise<FileSystemFileHandle[]>;
};

function legacyPickFile(input: HTMLInputElement): Promise<File | null> {
  input.accept = ".md,.markdown,text/markdown";
  return new Promise((resolve) => {
    const onDone = () => {
      input.removeEventListener("change", onDone);
      const f = input.files?.[0] ?? null;
      input.value = "";
      resolve(f);
    };
    input.addEventListener("change", onDone);
    input.click();
  });
}

export async function pickMarkdownFileWithNavigator(input: HTMLInputElement): Promise<File | null> {
  const win = typeof window !== "undefined" ? (window as WindowWithOpenFilePicker) : undefined;

  if (win?.showOpenFilePicker) {
    try {
      const handles = await win.showOpenFilePicker({
        multiple: false,
        types: [
          {
            description: "Markdown 문서",
            accept: {
              "text/markdown": [".md", ".markdown"],
              "text/plain": [".md", ".markdown"],
            },
          },
        ],
      });
      const first = handles[0];
      if (!first) {
        return null;
      }
      return await first.getFile();
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        return null;
      }
      // 정책 등으로 차단된 경우 레거시 input으로 재시도
      return legacyPickFile(input);
    }
  }

  return legacyPickFile(input);
}

export function isMarkdownFileByName(file: File): boolean {
  const lower = file.name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

export async function readMarkdownFileUtf8(file: File): Promise<string> {
  let text = await file.text();
  return text.replace(/^\ufeff/, "");
}

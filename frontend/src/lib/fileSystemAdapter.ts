import type { ProjectDirectorySelection, SessionRecord, SettingsPayload } from "../types";

/** 프로젝트 폴더에 저장되는 전체 세션 스냅샷(복구용). */
export const SESSION_SNAPSHOT_FILENAME = "session-snapshot.json";

/** Chromium exposes directory picking on `window`, not `navigator`. */
type WindowWithFsAccess = Window & {
  showDirectoryPicker?: (options?: {
    id?: string;
    mode?: "read" | "readwrite";
    startIn?: FileSystemHandle;
  }) => Promise<FileSystemDirectoryHandle>;
};

function getWindowFs(): WindowWithFsAccess | undefined {
  return typeof window !== "undefined" ? (window as WindowWithFsAccess) : undefined;
}

export function canUseFileSystemAccessApi(): boolean {
  const w = getWindowFs();
  return Boolean(w && typeof w.showDirectoryPicker === "function");
}

export async function pickProjectDirectory(): Promise<ProjectDirectorySelection> {
  const w = getWindowFs();
  if (!w || typeof w.showDirectoryPicker !== "function") {
    throw new Error("이 브라우저는 File System Access API를 지원하지 않습니다.");
  }
  const handle = await w.showDirectoryPicker({ mode: "readwrite" });
  return {
    name: handle.name,
    handle,
  };
}

async function writeJsonFile(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
  payload: unknown,
): Promise<void> {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  await writable.write(JSON.stringify(payload, null, 2));
  await writable.close();
}

async function readJsonFile(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
): Promise<unknown | undefined> {
  try {
    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();
    if (!text.trim()) {
      return undefined;
    }
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

const DEFAULT_RESTORE_SETTINGS: SettingsPayload = {
  auto_run: false,
  auto_run_delay_seconds: 5,
  agent_configs: {},
};

function coerceSettings(raw: unknown): SettingsPayload {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return DEFAULT_RESTORE_SETTINGS;
  }
  const o = raw as Record<string, unknown>;
  return {
    auto_run: typeof o.auto_run === "boolean" ? o.auto_run : DEFAULT_RESTORE_SETTINGS.auto_run,
    auto_run_delay_seconds:
      typeof o.auto_run_delay_seconds === "number"
        ? o.auto_run_delay_seconds
        : DEFAULT_RESTORE_SETTINGS.auto_run_delay_seconds,
    agent_configs:
      o.agent_configs && typeof o.agent_configs === "object" && !Array.isArray(o.agent_configs)
        ? (o.agent_configs as SettingsPayload["agent_configs"])
        : {},
  };
}

function isRecordSessionSnapshot(data: unknown, folderName: string): SessionRecord | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const row = data as Record<string, unknown>;
  const threadId = row.thread_id;
  const stateVal = row.state;
  if (typeof threadId !== "string" || !threadId.trim()) {
    return null;
  }
  if (!stateVal || typeof stateVal !== "object" || Array.isArray(stateVal)) {
    return null;
  }

  const project_name = typeof row.project_name === "string" ? row.project_name : folderName;
  const project_dir = typeof row.project_dir === "string" ? row.project_dir : folderName;

  return {
    thread_id: threadId.trim(),
    project_name,
    project_dir,
    created_at: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : new Date().toISOString(),
    status: typeof row.status === "string" ? row.status : "awaiting_human",
    state: stateVal as SessionRecord["state"],
    settings: coerceSettings(row.settings),
  };
}

/** `session-snapshot.json` 또는 예전 분할 JSON 조합으로 복구용 세션을 만든다. */
export async function loadWorkspaceSession(
  directoryHandle: FileSystemDirectoryHandle,
  folderName: string,
): Promise<SessionRecord | null> {
  const snapshotJson = await readJsonFile(directoryHandle, SESSION_SNAPSHOT_FILENAME);
  const fromFull = snapshotJson !== undefined ? isRecordSessionSnapshot(snapshotJson, folderName) : null;
  if (fromFull) {
    return fromFull;
  }

  const projectMeta = await readJsonFile(directoryHandle, "project.json");
  if (!projectMeta || typeof projectMeta !== "object" || Array.isArray(projectMeta)) {
    return null;
  }
  const meta = projectMeta as Record<string, unknown>;
  const tid = meta.thread_id;
  if (typeof tid !== "string" || !tid.trim()) {
    return null;
  }

  const shared = (await readJsonFile(directoryHandle, "shared-document.json")) ?? {};
  const sharedObj =
    typeof shared === "object" && shared !== null && !Array.isArray(shared)
      ? (shared as Record<string, unknown>)
      : {};

  const patentRaw = await readJsonFile(directoryHandle, "patent-document.json");
  const patent =
    patentRaw && typeof patentRaw === "object" && !Array.isArray(patentRaw)
      ? (patentRaw as Record<string, unknown>)
      : {};

  const clog = await readJsonFile(directoryHandle, "conversation-log.json");
  const searchCache = await readJsonFile(directoryHandle, "patent-search-cache.json");

  const conversation_log = Array.isArray(clog) ? clog : [];
  const search_results = Array.isArray(searchCache) ? searchCache : [];

  const phase = typeof meta.phase === "string" ? meta.phase : "draft";
  const status = typeof meta.status === "string" ? meta.status : "awaiting_human";

  const baseState = {
    raw_idea: typeof sharedObj.raw_idea === "string" ? sharedObj.raw_idea : "",
    anchor_document: sharedObj.anchor_document ?? null,
    human_directive: typeof sharedObj.human_directive === "string" ? sharedObj.human_directive : "",
    patent_document: patent,
    conversation_log,
    search_results,
    phase,
  };

  return {
    thread_id: tid.trim(),
    project_name: folderName,
    project_dir: typeof meta.project_dir === "string" ? meta.project_dir : folderName,
    created_at: typeof meta.created_at === "string" ? meta.created_at : new Date().toISOString(),
    updated_at: typeof meta.updated_at === "string" ? meta.updated_at : new Date().toISOString(),
    status,
    state: baseState as SessionRecord["state"],
    settings: DEFAULT_RESTORE_SETTINGS,
  };
}

export async function syncProjectWorkspace(
  directoryHandle: FileSystemDirectoryHandle,
  session: SessionRecord,
): Promise<void> {
  const state = session.state ?? {};
  await writeJsonFile(directoryHandle, "project.json", {
    thread_id: session.thread_id,
    project_name: session.project_name,
    project_dir: session.project_dir,
    created_at: session.created_at,
    updated_at: session.updated_at,
    status: session.status,
    phase: state.phase ?? "draft",
  });

  await writeJsonFile(directoryHandle, SESSION_SNAPSHOT_FILENAME, {
    thread_id: session.thread_id,
    project_name: session.project_name,
    project_dir: session.project_dir,
    created_at: session.created_at,
    updated_at: session.updated_at,
    status: session.status,
    state: session.state ?? {},
    settings: session.settings ?? DEFAULT_RESTORE_SETTINGS,
  });

  await writeJsonFile(directoryHandle, "shared-document.json", {
    raw_idea: state.raw_idea ?? "",
    anchor_document: state.anchor_document ?? null,
    human_directive: state.human_directive ?? "",
  });

  await writeJsonFile(directoryHandle, "patent-document.json", state.patent_document ?? {});
  await writeJsonFile(directoryHandle, "conversation-log.json", state.conversation_log ?? []);
  await writeJsonFile(directoryHandle, "patent-search-cache.json", state.search_results ?? []);
}

export interface EnrichedDiscussionRow {
  suggestion_id: string;
  status: "accepted" | "rejected" | "skipped";
  reason: string;
  suggestionType: string;
  content: string;
}

export function findDiscussionFeedbackEntry(history: unknown, round: number | null): Record<string, unknown> | null {
  if (round === null || history === undefined || !Array.isArray(history)) {
    return null;
  }
  for (let i = history.length - 1; i >= 0; i--) {
    const row = history[i];
    if (row && typeof row === "object" && !Array.isArray(row)) {
      const r = row as Record<string, unknown>;
      if (typeof r.discussion_round === "number" && r.discussion_round === round) {
        return r;
      }
    }
  }
  return null;
}

function normalizeStatus(raw: unknown): EnrichedDiscussionRow["status"] {
  const s = String(raw ?? "skipped")
    .trim()
    .toLowerCase();
  if (s === "accepted") {
    return "accepted";
  }
  if (s === "rejected") {
    return "rejected";
  }
  return "skipped";
}

/** 스냅샷 순서대로 전 제안과 판정(없으면 skipped) 결합 — 상세표·탭 분리용 */
export function rosterDiscussionRows(entry: Record<string, unknown>): EnrichedDiscussionRow[] {
  const snap = Array.isArray(entry.expander_suggestions_snapshot)
    ? (entry.expander_suggestions_snapshot as Array<Record<string, unknown>>)
    : [];

  const decMap = new Map<string, { status: EnrichedDiscussionRow["status"]; reason: string }>();
  const rawDecisions = Array.isArray(entry.discussion_decisions) ? entry.discussion_decisions : [];
  for (const raw of rawDecisions) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const d = raw as Record<string, unknown>;
    const id = String(d.suggestion_id ?? "").trim();
    if (!id) {
      continue;
    }
    decMap.set(id, {
      status: normalizeStatus(d.status),
      reason: typeof d.reason === "string" ? d.reason : String(d.reason ?? ""),
    });
  }

  return snap.map((s, idx) => {
    const suggestion_id =
      typeof s.id === "string" && s.id.trim()
        ? s.id.trim()
        : `s-idx-${idx}`;
    const fb = decMap.get(suggestion_id) ?? { status: "skipped" as const, reason: "" };
    return {
      suggestion_id,
      status: fb.status,
      reason: fb.reason,
      suggestionType: typeof s.type === "string" ? s.type : String(s.type ?? ""),
      content: typeof s.content === "string" ? s.content : String(s.content ?? ""),
    };
  });
}

export function patentAfterFromFeedbackEntry(entry: Record<string, unknown>): Record<string, unknown> | undefined {
  const after = entry.patent_document_after;
  if (after !== null && typeof after === "object" && !Array.isArray(after)) {
    return after as Record<string, unknown>;
  }
  return undefined;
}

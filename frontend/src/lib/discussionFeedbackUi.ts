import type { MeritScore } from "./discussionDecisions";

export interface EnrichedDiscussionRow {
  suggestion_id: string;
  merit_score: MeritScore;
  reason: string;
  suggestionType: string;
  content: string;
}

function parseMeritScore(raw: unknown): MeritScore | null {
  if (raw === 0 || raw === 1 || raw === 2) {
    return raw;
  }
  if (raw === "0" || raw === "1" || raw === "2") {
    return Number(raw) as MeritScore;
  }
  return null;
}

function normalizeStatusToMerit(
  raw: unknown,
): MeritScore {
  const s = String(raw ?? "skipped")
    .trim()
    .toLowerCase();
  if (s === "accepted") {
    return 2;
  }
  if (s === "rejected") {
    return 0;
  }
  return 1;
}

/** UI·표 헤더용 */
export function meritLabelKr(merit: MeritScore): string {
  if (merit === 2) {
    return "적합(완전 채택)";
  }
  if (merit === 1) {
    return "유지·보완(다툴 여지)";
  }
  return "부적절(배제)";
}

/** Markdown 미리보기·상세보기 부록 */
export function formatDiscussionRosterMarkdown(rows: EnrichedDiscussionRow[]): string {
  if (rows.length === 0) {
    return "";
  }
  const lines = rows.map((r) => {
    const label = meritLabelKr(r.merit_score);
    const reason = r.reason.trim();
    const reasonPart =
      r.merit_score === 0 || r.merit_score === 1
        ? reason || "_사유·보완 메모 없음_"
        : "—";
    const gist = r.content.length > 400 ? `${r.content.slice(0, 400)}…` : r.content || "—";
    return `- **${r.suggestion_id}** (${r.suggestionType || "유형 미상"}) · **${label}**\n  - 사유·보완: ${reasonPart}\n  - 요지: ${gist}`;
  });
  return "## 제안별 적합도 판정 (이 라운드)\n\n" + lines.join("\n\n");
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

/** 스냅샷 순서대로 전 제안과 판정 결합 — 상세표·탭 분리용 */
export function rosterDiscussionRows(entry: Record<string, unknown>): EnrichedDiscussionRow[] {
  const snap = Array.isArray(entry.expander_suggestions_snapshot)
    ? (entry.expander_suggestions_snapshot as Array<Record<string, unknown>>)
    : [];

  const decMap = new Map<string, { merit_score: MeritScore; reason: string }>();
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
    const m = parseMeritScore(d.merit_score) ?? normalizeStatusToMerit(d.status);
    decMap.set(id, {
      merit_score: m,
      reason: typeof d.reason === "string" ? d.reason : String(d.reason ?? ""),
    });
  }

  return snap.map((s, idx) => {
    const suggestion_id =
      typeof s.id === "string" && s.id.trim()
        ? s.id.trim()
        : `s-idx-${idx}`;
    const fb = decMap.get(suggestion_id) ?? { merit_score: 1 as MeritScore, reason: "" };
    return {
      suggestion_id,
      merit_score: fb.merit_score,
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

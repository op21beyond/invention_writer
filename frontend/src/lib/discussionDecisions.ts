export type DiscussionDecisionStatus = "accepted" | "rejected" | "skipped";

export interface DiscussionDecisionCell {
  status: DiscussionDecisionStatus;
  reason: string;
}

export function suggestionLocalId(raw: Record<string, unknown>, index: number): string {
  const id = raw.id;
  if (typeof id === "string" && id.trim()) {
    return id.trim();
  }
  return `s-idx-${index}`;
}

/** Resume API body: snake_case suggestion_id matches backend normalization. */
export function buildDiscussionDecisionsPayload(
  suggestions: Array<Record<string, unknown>>,
  draft: Record<string, DiscussionDecisionCell>,
): Array<{ suggestion_id: string; status: DiscussionDecisionStatus; reason: string }> {
  return suggestions.map((s, i) => {
    const sid = suggestionLocalId(s, i);
    const cell = draft[sid] ?? { status: "skipped" as const, reason: "" };
    return {
      suggestion_id: sid,
      status: cell.status,
      reason: cell.reason.trim().slice(0, 4000),
    };
  });
}

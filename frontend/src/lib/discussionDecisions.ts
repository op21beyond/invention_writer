/** Developer 적합도: 2=완전 적합, 1=유지·보완, 0=배제 */
export type MeritScore = 0 | 1 | 2;

export type DiscussionDecisionStatus = "accepted" | "rejected" | "skipped";

export interface DiscussionDecisionCell {
  merit_score: MeritScore;
  reason: string;
}

export function suggestionLocalId(raw: Record<string, unknown>, index: number): string {
  const id = raw.id;
  if (typeof id === "string" && id.trim()) {
    return id.trim();
  }
  return `s-idx-${index}`;
}

/** Resume API body */
export function buildDiscussionDecisionsPayload(
  suggestions: Array<Record<string, unknown>>,
  draft: Record<string, DiscussionDecisionCell>,
): Array<{ suggestion_id: string; merit_score: MeritScore; reason: string }> {
  return suggestions.map((s, i) => {
    const sid = suggestionLocalId(s, i);
    const cell = draft[sid] ?? { merit_score: 1 as MeritScore, reason: "" };
    return {
      suggestion_id: sid,
      merit_score: cell.merit_score,
      reason: cell.reason.trim().slice(0, 4000),
    };
  });
}

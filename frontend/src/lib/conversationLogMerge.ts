/** LangGraph add_messages / 직렬화 과정에서 message_detail 이 빠질 수 있어, 이전 스냅샷에서 복원한다. */

export function extractMessageDetail(entry: Record<string, unknown>): Record<string, unknown> | null {
  const top = entry.message_detail;
  if (typeof top === "object" && top !== null && !Array.isArray(top)) {
    return top as Record<string, unknown>;
  }
  const add =
    typeof entry.additional_kwargs === "object" && entry.additional_kwargs !== null
      ? (entry.additional_kwargs as Record<string, unknown>)
      : null;
  const nested = add?.message_detail;
  if (typeof nested === "object" && nested !== null && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return null;
}

function withDetail(entry: Record<string, unknown>, detail: Record<string, unknown>): Record<string, unknown> {
  return {
    ...entry,
    message_detail: detail,
    additional_kwargs: {
      ...(typeof entry.additional_kwargs === "object" && entry.additional_kwargs !== null
        ? (entry.additional_kwargs as Record<string, unknown>)
        : {}),
      message_detail: detail,
    },
  };
}

/** 서버에서 온 next 로그에 message_detail 이 비어 있으면, 같은 인덱스의 prev 항목에서 채운다. */
export function mergeConversationLogsPreserveMessageDetail(
  prev: unknown[] | undefined,
  next: unknown[] | undefined,
): unknown[] {
  if (!Array.isArray(next)) {
    return [];
  }
  if (!Array.isArray(prev) || prev.length === 0) {
    return next;
  }
  return next.map((entry, i) => {
    const cur = entry as Record<string, unknown>;
    const curDetail = extractMessageDetail(cur);
    if (curDetail !== null && Object.keys(curDetail).length > 0) {
      return withDetail(cur, curDetail);
    }
    if (i < prev.length) {
      const prevDetail = extractMessageDetail(prev[i] as Record<string, unknown>);
      if (prevDetail !== null && Object.keys(prevDetail).length > 0) {
        return withDetail(cur, prevDetail);
      }
    }
    return entry;
  });
}

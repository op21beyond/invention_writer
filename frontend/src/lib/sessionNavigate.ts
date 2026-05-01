import { navigateSession } from "./apiClient";
import type { SessionRecord } from "../types";

import { WORKFLOW_STEP_LABELS } from "./workflowRibbon";

export async function navigateWithConfirm(
  session: SessionRecord,
  targetIndex: number,
  setCurrentSession: (s: SessionRecord) => void,
): Promise<void> {
  const label = WORKFLOW_STEP_LABELS[targetIndex] ?? String(targetIndex);
  if (
    !window.confirm(
      `플로 상태를 「${label}」 구간 시작 지점에 맞춥니다.\n대화 로그 텍스트는 유지하고, 단계별 필드(라운드·검색·심사 등)만 바꿉니다. 계속할까요?`,
    )
  ) {
    return;
  }

  try {
    const next = await navigateSession(session.thread_id, targetIndex);
    setCurrentSession(next);
  } catch (e) {
    window.alert(e instanceof Error ? e.message : "단계 이동에 실패했습니다.");
  }
}

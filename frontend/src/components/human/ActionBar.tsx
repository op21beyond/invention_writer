import { useCallback, useEffect, useRef, useState } from "react";

import { cancelSession, fetchSession, resumeSession, startSession } from "../../lib/apiClient";
import { buildDiscussionDecisionsPayload } from "../../lib/discussionDecisions";
import { navigateWithConfirm } from "../../lib/sessionNavigate";
import { getActiveWorkflowStepIndex } from "../../lib/workflowRibbon";
import type { ResumeAction } from "../../types";
import { useSettingsStore } from "../../stores/settingsStore";
import { useWorkflowStore } from "../../stores/workflowStore";

import { NavigateStepPicker } from "./NavigateStepPicker";

type ResumeExtras = {
  skipDiscussionToSearch?: boolean;
  skipExaminationToFinalize?: boolean;
};

function formatElapsed(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function ActionBar() {
  const {
    currentSession,
    directive,
    discussionDecisionById,
    sharedDocumentDraft,
    setCurrentSession,
    latestInterrupt,
    streamConnected,
  } = useWorkflowStore();
  const { settings } = useSettingsStore();
  const [primaryBusy, setPrimaryBusy] = useState(false);
  const [gateBusyAction, setGateBusyAction] = useState<ResumeAction | null>(null);
  const [pickPreviousOpen, setPickPreviousOpen] = useState(false);
  const [elapsedLabel, setElapsedLabel] = useState("—");
  const progressStartWall = useRef<number | null>(null);

  const anyBusy = primaryBusy || gateBusyAction !== null;

  const bootstrapPhase = currentSession?.status === "created";
  const serverRunning = currentSession?.status === "running";
  const workflowTerminal = currentSession?.status === "completed" || currentSession?.status === "error";
  const docFilled = Boolean(sharedDocumentDraft.trim());
  const bootstrapPrimaryLocked = Boolean(bootstrapPhase && !docFilled);
  /** 첫 진입: 문서가 있어야 활성. 백그라운드 플로(running)·요청 처리 중에는 잠금. */
  const primaryDisabled =
    !currentSession ||
    serverRunning ||
    anyBusy ||
    workflowTerminal ||
    (bootstrapPhase && !docFilled);
  const primaryLooksMuted =
    (bootstrapPrimaryLocked && !anyBusy && !serverRunning && Boolean(currentSession)) ||
    (!anyBusy && !serverRunning && workflowTerminal && Boolean(currentSession));
  const primaryWorking = Boolean(primaryBusy || serverRunning);

  const activeRibbonIdx = getActiveWorkflowStepIndex(currentSession);
  const previousRibbonTargets =
    activeRibbonIdx <= 1 ? [] : Array.from({ length: activeRibbonIdx - 1 }, (_, i) => i + 1);

  const st = currentSession?.state as Record<string, unknown> | undefined;
  const awaitingHuman = currentSession?.status === "awaiting_human";
  const discussionRound =
    typeof st?.discussion_round === "number" ? st.discussion_round : Number(st?.discussion_round ?? NaN);
  const maxDiscuss = Number(st?.max_discussion_rounds ?? 3);
  const examinationRound =
    typeof st?.examination_round === "number" ? st.examination_round : Number(st?.examination_round ?? NaN);
  const maxEx = Number(st?.max_examination_rounds ?? 3);

  const discussionSkipEligible =
    awaitingHuman &&
    String(st?.phase ?? "") === "discussion" &&
    Number.isFinite(discussionRound) &&
    discussionRound < maxDiscuss;

  const examinationSkipEligible =
    awaitingHuman &&
    String(st?.phase ?? "") === "examination" &&
    String(st?.examiner_status ?? "") !== "approved" &&
    Number.isFinite(examinationRound) &&
    examinationRound < maxEx;

  const finishBusy = () => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setPrimaryBusy(false);
        setGateBusyAction(null);
      });
    });
  };

  useEffect(() => {
    const w = primaryBusy || serverRunning;
    if (!w) {
      progressStartWall.current = null;
      setElapsedLabel("—");
      return;
    }

    if (progressStartWall.current === null) {
      progressStartWall.current = Date.now();
    }

    const tick = () => {
      if (progressStartWall.current === null) {
        return;
      }
      const sec = Math.floor((Date.now() - progressStartWall.current) / 1000);
      setElapsedLabel(formatElapsed(sec));
    };

    tick();
    const iv = window.setInterval(tick, 500);
    return () => window.clearInterval(iv);
  }, [primaryBusy, serverRunning]);

  const abortRun = useCallback(async () => {
    if (!currentSession?.thread_id) {
      return;
    }
    try {
      await cancelSession(currentSession.thread_id);
      const next = await fetchSession(currentSession.thread_id);
      setCurrentSession(next);
    } catch (e) {
      window.alert(e instanceof Error ? e.message : "중지 요청에 실패했습니다.");
    }
  }, [currentSession, setCurrentSession]);

  const send = useCallback(
    async (action: ResumeAction, extras?: ResumeExtras) => {
      if (!currentSession) {
        return;
      }

      if (action === "continue" && currentSession.status === "created") {
        if (!sharedDocumentDraft.trim()) {
          return;
        }
        setPrimaryBusy(true);
        try {
          const session = await startSession(currentSession.thread_id, sharedDocumentDraft);
          setCurrentSession(session);
        } finally {
          finishBusy();
        }
        return;
      }

      if (action === "continue") {
        setPrimaryBusy(true);
      } else {
        setGateBusyAction(action);
      }

      try {
        const sess = currentSession;
        const sessSt = sess.state as Record<string, unknown>;
        const suggestions = Array.isArray(sessSt.expander_suggestions)
          ? (sessSt.expander_suggestions as Array<Record<string, unknown>>)
          : [];
        const expanderReview =
          sess.status === "awaiting_human" &&
          sessSt.phase === "discussion" &&
          sessSt.discussion_turn === "developer";

        const ack = await resumeSession(sess.thread_id, {
          action,
          directive,
          editedDocument: { draft: sharedDocumentDraft },
          discussionDecisions: expanderReview
            ? buildDiscussionDecisionsPayload(suggestions, discussionDecisionById)
            : undefined,
          skipDiscussionToSearch: extras?.skipDiscussionToSearch,
          skipExaminationToFinalize: extras?.skipExaminationToFinalize,
        });
        if (typeof ack?.status === "string") {
          setCurrentSession({
            ...sess,
            status: ack.status,
          });
        }
      } finally {
        finishBusy();
      }
    },
    [currentSession, directive, discussionDecisionById, setCurrentSession, sharedDocumentDraft],
  );

  const gateMode = latestInterrupt?.type === "gate";

  const showNavigateBackUi =
    currentSession != null &&
    currentSession.status !== "running" &&
    currentSession.status !== "created" &&
    activeRibbonIdx > 1 &&
    previousRibbonTargets.length > 0;

  return (
    <>
      <div className="action-bar">
        <div className="action-bar-meta">
          <strong>사람 검토</strong>
          <div className="action-bar-lines">
            진행 방식: {settings.auto_run ? `자동 (${settings.auto_run_delay_seconds}초 후)` : "한 단계씩 수동"}
          </div>
          <div className="action-bar-lines">
            서버 연결: {streamConnected ? "연결됨" : "대기"} · 세션: {currentSession?.status ?? "—"}
          </div>
          {latestInterrupt ? (
            <div className="action-bar-lines">
              멈춤 지점 요약 · 유형 {latestInterrupt.type} · 회차 정보 {latestInterrupt.phase} / 라운드{" "}
              {latestInterrupt.round}
            </div>
          ) : null}
          {bootstrapPhase && !docFilled ? (
            <div className="action-bar-lines action-bar-lines--hint">
              공유 작업 문서에 내용을 넣으면 「다음 단계」로 구조화를 시작할 수 있습니다.
            </div>
          ) : null}
        </div>
        <div className="action-group action-group--stack">
          <div className="action-bar-primary-row">
            <button
              aria-busy={primaryWorking}
              className={`btn btn-primary action-bar-main ${primaryLooksMuted ? "action-bar-main--bootstrap-idle" : ""} ${workflowTerminal ? "action-bar-main--workflow-terminal" : ""}`}
              disabled={primaryDisabled}
              title={
                bootstrapPrimaryLocked
                  ? "공유 작업 문서를 입력하거나 Markdown으로 불러오세요."
                  : currentSession?.status === "completed"
                    ? "워크플로가 이미 종료되었습니다."
                    : currentSession?.status === "error"
                      ? "세션 오류 상태입니다."
                    : serverRunning
                      ? "에이전트가 단계를 실행 중입니다. 완료되면 다음 메시지를 기다린 뒤 다시 진행합니다."
                      : undefined
              }
              onClick={() => void send("continue")}
              type="button"
            >
              {workflowTerminal && !primaryWorking
                ? currentSession?.status === "error"
                  ? "세션 오류"
                  : "워크플로 종료됨"
                : primaryWorking
                  ? `진행 중… (${elapsedLabel})`
                  : "다음 단계"}
            </button>
            {gateMode ? (
              <>
                <button
                  aria-busy={gateBusyAction === "approve"}
                  className="btn action-bar-secondary"
                  disabled={anyBusy || serverRunning}
                  onClick={() => void send("approve")}
                  type="button"
                >
                  {gateBusyAction === "approve" ? "처리 중…" : "승인"}
                </button>
                <button
                  aria-busy={gateBusyAction === "reject"}
                  className="btn action-bar-secondary"
                  disabled={anyBusy || serverRunning}
                  onClick={() => void send("reject")}
                  type="button"
                >
                  {gateBusyAction === "reject" ? "처리 중…" : "반려"}
                </button>
              </>
            ) : null}
            {primaryWorking ? (
              <button
                className="btn action-bar-secondary action-bar-secondary--warn"
                disabled={!serverRunning}
                onClick={() => void abortRun()}
                type="button"
                title={
                  serverRunning
                    ? "백그라운드 플랜 실행을 끊고 사람 검토를 다시 시작합니다."
                    : "요청 처리만 남았을 때는 잠시 후 자동으로 끝납니다."
                }
              >
                실행 중지
              </button>
            ) : null}
          </div>
          {primaryWorking ? null : (
            <div className="action-bar-secondary-row">
              {showNavigateBackUi ? (
                <button className="btn action-bar-muted" type="button" onClick={() => setPickPreviousOpen(true)}>
                  이전 단계로…
                </button>
              ) : null}
              {discussionSkipEligible ? (
                <button
                  className="btn action-bar-muted"
                  type="button"
                  disabled={gateMode || Boolean(anyBusy)}
                  title="설정된 확장·논의 라운드를 다 채우지 않고 바로 검색 단계(agent3 질의)로 넘어갑니다."
                  onClick={() => void send("continue", { skipDiscussionToSearch: true })}
                >
                  확장 논의 생략 → 검색
                </button>
              ) : null}
              {examinationSkipEligible ? (
                <button
                  className="btn action-bar-muted"
                  type="button"
                  disabled={gateMode || Boolean(anyBusy)}
                  title="남은 심사 라운드를 생략하고 종료 처리로 건너뜁니다."
                  onClick={() => void send("continue", { skipExaminationToFinalize: true })}
                >
                  심사 대응 생략 → 종료
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
      <NavigateStepPicker
        open={pickPreviousOpen}
        title="되돌릴 플로 단계"
        stepIndices={previousRibbonTargets}
        onClose={() => setPickPreviousOpen(false)}
        onPick={(idx) => {
          if (currentSession) {
            void navigateWithConfirm(currentSession, idx, setCurrentSession);
          }
        }}
      />
    </>
  );
}

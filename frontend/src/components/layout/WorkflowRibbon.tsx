import {
  WORKFLOW_STEP_LABELS,
  canNavigateRibbonStep,
  getActiveWorkflowStepIndex,
  hasStructurerCheckpoint,
  workflowStatusNote,
} from "../../lib/workflowRibbon";
import { useWorkflowStore } from "../../stores/workflowStore";

type Variant = "full" | "inline";

type WorkflowRibbonProps = {
  variant?: Variant;
  onNavigateToStep?: (stepIndex: number) => void;
};

export function WorkflowRibbon({ variant = "full", onNavigateToStep }: WorkflowRibbonProps) {
  const { currentSession } = useWorkflowStore();
  const active = getActiveWorkflowStepIndex(currentSession);
  const note = workflowStatusNote(currentSession);
  const inline = variant === "inline";
  const running = currentSession?.status === "running";
  const navigableGlobally =
    Boolean(onNavigateToStep) &&
    Boolean(currentSession) &&
    currentSession?.status !== "running" &&
    currentSession?.status !== "created" &&
    hasStructurerCheckpoint(currentSession);

  return (
    <div
      className={inline ? "workflow-ribbon workflow-ribbon--inline" : "workflow-ribbon"}
      aria-label="전체 진행 순서"
    >
      <div className="workflow-ribbon-steps">
        {WORKFLOW_STEP_LABELS.map((label, index) => {
          const isDone = index < active;
          const isCurrent = index === active;
          const navigableHere =
            navigableGlobally && Boolean(onNavigateToStep) && canNavigateRibbonStep(index, active);

          const mods = [
            "workflow-step",
            isDone ? "workflow-step--done" : "",
            isCurrent ? "workflow-step--current" : "",
            !isDone && !isCurrent ? "workflow-step--upcoming" : "",
            navigableHere ? "workflow-step--navigable" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <div className="workflow-step-slot" key={label}>
              {index > 0 ? (
                <span aria-hidden className="workflow-arrow" title="다음 단계">
                  →
                </span>
              ) : null}
              {navigableHere ? (
                <button
                  type="button"
                  className={mods}
                  title="클릭하면 이 플로 구간 시작 지점으로 상태를 맞춥니다. (실행 중일 때는 사용할 수 없습니다.)"
                  onClick={() => onNavigateToStep?.(index)}
                >
                  <span className="workflow-step-index" aria-hidden>
                    {index + 1}
                  </span>
                  <span className="workflow-step-label">{label}</span>
                </button>
              ) : (
                <div className={mods}>
                  <span className="workflow-step-index" aria-hidden>
                    {index + 1}
                  </span>
                  <span className="workflow-step-label">{label}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!inline && note ? <p className="workflow-ribbon-note">{note}</p> : null}
    </div>
  );
}

export function WorkflowRibbonFooterNote() {
  const { currentSession } = useWorkflowStore();
  const note = workflowStatusNote(currentSession);
  const running = currentSession?.status === "running";

  if (!note && !running) {
    return null;
  }

  return (
    <div
      className="workflow-footer-slot"
      role={running ? "status" : undefined}
      aria-live={running ? "polite" : undefined}
      aria-busy={running || undefined}
    >
      {(note || running) && (
        <p className="workflow-ribbon-note workflow-ribbon-note--footer">
          {note ? <span className="workflow-ribbon-note__text">{note}</span> : null}
          {running ? (
            <span className="inline-dots-loading" aria-hidden title="처리 중">
              <span className="inline-dots-loading__dot" />
              <span className="inline-dots-loading__dot" />
              <span className="inline-dots-loading__dot" />
            </span>
          ) : null}
        </p>
      )}
    </div>
  );
}

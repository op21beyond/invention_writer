import { WORKFLOW_STEP_LABELS } from "../../lib/workflowRibbon";

type NavigateStepPickerProps = {
  open: boolean;
  onClose: () => void;
  stepIndices: number[];
  title?: string;
  onPick: (stepIndex: number) => void;
};

export function NavigateStepPicker({
  open,
  onClose,
  stepIndices,
  title = "이동할 단계 선택",
  onPick,
}: NavigateStepPickerProps) {
  if (!open || stepIndices.length === 0) {
    return null;
  }

  return (
    <div className="nav-step-overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="nav-step-dialog" role="dialog" aria-modal aria-labelledby="nav-step-title">
        <h2 id="nav-step-title" className="nav-step-dialog__title">
          {title}
        </h2>
        <p className="nav-step-dialog__hint">
          과거 플로로 되돌릴 때는 대화 로그는 유지하고, 해당 구간 시작에 맞는 상태값만 고칩니다.
        </p>
        <ul className="nav-step-dialog__list">
          {stepIndices.map((idx) => (
            <li key={idx}>
              <button
                className="btn nav-step-dialog__pick"
                type="button"
                onClick={() => {
                  onPick(idx);
                  onClose();
                }}
              >
                {idx + 1}. {WORKFLOW_STEP_LABELS[idx] ?? idx}
              </button>
            </li>
          ))}
        </ul>
        <button className="btn btn-subtle nav-step-dialog__close" type="button" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}

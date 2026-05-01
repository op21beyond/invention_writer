import { useMemo } from "react";

import { getDirectiveContext } from "../../lib/nextWorkflowStep";
import { useWorkflowStore } from "../../stores/workflowStore";

export function DirectiveInput() {
  const { directive, setDirective, currentSession } = useWorkflowStore();

  const guidance = useMemo(
    () => getDirectiveContext(currentSession?.status, (currentSession?.state ?? {}) as Record<string, unknown>),
    [currentSession?.status, currentSession?.state],
  );

  const canInsertExample = Boolean(guidance.suggestionToFill.trim());

  return (
    <div className="directive-box">
      <h3 className="directive-box-title">에이전트에게 남길 메모 (선택)</h3>
      <div className="directive-guidance">
        <p className="directive-guidance-head">{guidance.headline}</p>
        <p className="directive-guidance-body">{guidance.detail}</p>
      </div>
      <textarea
        className="directive-input"
        value={directive}
        onChange={(event) => setDirective(event.target.value)}
        placeholder="특별히 전달할 내용이 있으면 적으세요. 없으면 비워 두고 하단 「다음 단계」만 눌러도 됩니다."
      />
      {canInsertExample ? (
        <div className="directive-example-row">
          <button
            className="btn btn-subtle"
            type="button"
            onClick={() => setDirective(guidance.suggestionToFill)}
          >
            예시 문장을 입력란에 넣기
          </button>
          <span className="directive-example-note">필요할 때만 눌러 수정해 쓰면 됩니다.</span>
        </div>
      ) : null}
    </div>
  );
}

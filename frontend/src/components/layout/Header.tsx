import { createSession, restoreSessionFromWorkspaceSnapshot } from "../../lib/apiClient";
import { navigateWithConfirm } from "../../lib/sessionNavigate";
import {
  loadWorkspaceSession,
  pickProjectDirectory,
  syncProjectWorkspace,
} from "../../lib/fileSystemAdapter";
import { useUiStore } from "../../stores/uiStore";
import { useWorkflowStore } from "../../stores/workflowStore";
import type { SessionRecord } from "../../types";
import { WorkflowRibbon, WorkflowRibbonFooterNote } from "./WorkflowRibbon";

export function Header() {
  const { toggleSettings } = useUiStore();
  const {
    currentSession,
    fileSystemSupported,
    projectDirectory,
    setCurrentSession,
    setProjectDirectory,
  } = useWorkflowStore();

  const projectConfigured = Boolean(projectDirectory);
  const inventionName = projectDirectory?.name ?? null;

  async function handlePickFolder() {
    try {
      const selection = await pickProjectDirectory();
      const localSnapshot = await loadWorkspaceSession(selection.handle, selection.name);

      let session: SessionRecord;
      if (localSnapshot !== null) {
        session = await restoreSessionFromWorkspaceSnapshot(localSnapshot);
      } else {
        session = await createSession({
          projectName: selection.name,
          projectDir: selection.name,
        });
      }

      setProjectDirectory(selection);
      setCurrentSession(session);
      await syncProjectWorkspace(selection.handle, session);
    } catch (error) {
      console.error(error);
      window.alert(
        error instanceof Error
          ? error.message
          : "폴더 연결 또는 이전 작업 복구 중 오류가 났습니다. 콘솔을 확인해 주세요.",
      );
    }
  }

  return (
    <header className="header">
      <div className="header-primary">
        <div className="header-lead">
          {projectConfigured && inventionName ? (
            <>
              <p className="header-kicker">작업 중인 발명(프로젝트)</p>
              <h1 className="header-project-name">{inventionName}</h1>
              {currentSession ? (
                <p className="header-meta header-meta--status">상태: {currentSession.status}</p>
              ) : null}
            </>
          ) : (
            <>
              <p className="header-kicker">발명(프로젝트)</p>
              <h1 className="header-project-name header-project-name--unset">아직 설정되지 않음</h1>
              <p className="header-unset-hint">
                {fileSystemSupported
                  ? "「폴더 선택」으로 작업 폴더를 고르면, 폴더 이름이 발명 이름이 됩니다."
                  : "이 브라우저에서는 로컬 폴더를 연결할 수 없습니다. 크롬·엣지(데스크톱)에서 열어 주세요."}
              </p>
            </>
          )}
        </div>

        <WorkflowRibbon
          variant="inline"
          onNavigateToStep={
            currentSession
              ? (idx) => void navigateWithConfirm(currentSession, idx, setCurrentSession)
              : undefined
          }
        />

        <div className="header-actions">
          {projectConfigured && projectDirectory ? (
            <span className="header-meta header-folder-line">
              <span className="header-folder-label">로컬 폴더 연결됨</span>
              <code
                className="header-folder-path"
                title="브라우저 보안 정책상 디스크 전체 경로는 알 수 없고, 선택한 폴더 이름만 표시합니다."
              >
                {projectDirectory.name}
              </code>
            </span>
          ) : (
            <span className="header-meta">
              {fileSystemSupported ? "로컬 폴더 미연결" : "폴더 연결 기능 사용 불가"}
            </span>
          )}
          <div className="header-folder-row">
            <button
              className="btn"
              onClick={() => void handlePickFolder()}
              type="button"
              disabled={!fileSystemSupported}
            >
              폴더 선택
            </button>
            <div className="header-help-wrap">
              <span
                className="header-help"
                tabIndex={0}
                role="img"
                aria-label="선택한 폴더 이름은 발명(프로젝트) 이름과 동일하게 쓰입니다. 세션과 로컬 JSON에 반영됩니다."
              >
                ?
              </span>
              <div className="header-help-tooltip" role="presentation">
                선택한 폴더 이름이 발명 하나당 프로젝트 이름과 같게 사용됩니다.
              </div>
            </div>
          </div>
          <button className="btn" onClick={toggleSettings} type="button">
            설정
          </button>
        </div>
      </div>
      <WorkflowRibbonFooterNote />
    </header>
  );
}

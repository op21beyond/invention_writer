import { useEffect } from "react";

import { Header } from "./components/layout/Header";
import { ThreePanelLayout } from "./components/layout/ThreePanelLayout";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { ActionBar } from "./components/human/ActionBar";
import { createSession, fetchSettings } from "./lib/apiClient";
import { canUseFileSystemAccessApi, syncProjectWorkspace } from "./lib/fileSystemAdapter";
import { createSessionStream } from "./lib/sseClient";
import { useSettingsStore } from "./stores/settingsStore";
import { useUiStore } from "./stores/uiStore";
import { useWorkflowStore } from "./stores/workflowStore";

export function App() {
  const { settings, setSettings } = useSettingsStore();
  const { showSettings } = useUiStore();
  const {
    currentSession,
    setCurrentSession,
    applyCheckpoint,
    applyInterrupt,
    applyNodeComplete,
    projectDirectory,
    setFileSystemSupported,
    setStreamConnected,
  } = useWorkflowStore();

  useEffect(() => {
    setFileSystemSupported(canUseFileSystemAccessApi());
  }, [setFileSystemSupported]);

  useEffect(() => {
    void fetchSettings().then(setSettings).catch(() => undefined);
  }, [setSettings]);

  useEffect(() => {
    if (currentSession) {
      return;
    }
    void createSession({
      projectName: "untitled-project",
      projectDir: "",
    }).then(setCurrentSession).catch(() => undefined);
  }, [currentSession, setCurrentSession]);

  useEffect(() => {
    if (!currentSession?.thread_id) {
      return;
    }

    const source = createSessionStream(currentSession.thread_id, {
      onCheckpoint: (payload) => {
        applyCheckpoint(payload);
        if (payload.session && projectDirectory) {
          void syncProjectWorkspace(projectDirectory.handle, payload.session);
        }
      },
      onInterrupt: applyInterrupt,
      onNodeComplete: applyNodeComplete,
      onError: () => setStreamConnected(false),
    });

    setStreamConnected(true);

    return () => {
      setStreamConnected(false);
      source.close();
    };
  }, [
    currentSession?.thread_id,
    applyCheckpoint,
    applyInterrupt,
    applyNodeComplete,
    projectDirectory,
    setStreamConnected,
  ]);

  return (
    <div className="app-shell">
      <Header />
      <ThreePanelLayout />
      <ActionBar />
      {showSettings ? <SettingsPanel settings={settings} /> : null}
    </div>
  );
}

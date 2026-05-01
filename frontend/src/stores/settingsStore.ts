import { create } from "zustand";

import { DEFAULT_AGENT_CONFIGS } from "../lib/agentLlmPresets";
import type { SettingsPayload } from "../types";

interface SettingsStore {
  settings: SettingsPayload;
  setSettings: (settings: SettingsPayload) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: {
    auto_run: false,
    auto_run_delay_seconds: 5,
    agent_configs: {
      agent0: { ...DEFAULT_AGENT_CONFIGS.agent0 },
      agent1: { ...DEFAULT_AGENT_CONFIGS.agent1 },
      agent2: { ...DEFAULT_AGENT_CONFIGS.agent2 },
      agent3: { ...DEFAULT_AGENT_CONFIGS.agent3 },
    },
  },
  setSettings: (settings) => set({ settings }),
}));

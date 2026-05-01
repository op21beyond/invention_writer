import { useState } from "react";

import { updateSettings } from "../../lib/apiClient";
import {
  AGENT_LABELS,
  DEFAULT_AGENT_CONFIGS,
  MODEL_PRESETS,
  PROVIDER_LABELS,
  type LlmProviderId,
} from "../../lib/agentLlmPresets";
import { useUiStore } from "../../stores/uiStore";
import { useSettingsStore } from "../../stores/settingsStore";
import type { SettingsPayload } from "../../types";

const AGENT_IDS = ["agent0", "agent1", "agent2", "agent3"] as const;

function normalizeDraft(s: SettingsPayload): SettingsPayload {
  const base = { ...s, agent_configs: { ...s.agent_configs } };
  for (const id of AGENT_IDS) {
    if (!base.agent_configs[id]) {
      base.agent_configs[id] = { ...DEFAULT_AGENT_CONFIGS[id] };
    }
  }
  return base;
}

export function SettingsPanel({ settings }: { settings: SettingsPayload }) {
  const { closeSettings } = useUiStore();
  const { setSettings } = useSettingsStore();
  const [draft, setDraft] = useState(() => normalizeDraft(settings));

  async function handleSave() {
    const next = await updateSettings(draft);
    setSettings(next);
    closeSettings();
  }

  function setAgentProvider(id: (typeof AGENT_IDS)[number], provider: LlmProviderId) {
    setDraft((current) => {
      const prev = current.agent_configs[id] ?? { ...DEFAULT_AGENT_CONFIGS[id] };
      const models = MODEL_PRESETS[provider];
      const model = models.includes(prev.model) ? prev.model : models[0];
      return {
        ...current,
        agent_configs: {
          ...current.agent_configs,
          [id]: { provider, model },
        },
      };
    });
  }

  function setAgentModel(id: (typeof AGENT_IDS)[number], model: string) {
    setDraft((current) => ({
      ...current,
      agent_configs: {
        ...current.agent_configs,
        [id]: {
          ...(current.agent_configs[id] ?? DEFAULT_AGENT_CONFIGS[id]),
          model,
        },
      },
    }));
  }

  return (
    <aside className="settings-drawer">
      <div className="settings-card">
        <h2>워크플로우 설정</h2>
        <div className="field-grid">
          <label>
            자동 진행
            <select
              value={draft.auto_run ? "on" : "off"}
              onChange={(event) =>
                setDraft((current) => ({ ...current, auto_run: event.target.value === "on" }))
              }
            >
              <option value="off">OFF</option>
              <option value="on">ON</option>
            </select>
          </label>
          <label>
            자동 진행 대기 시간
            <input
              type="number"
              min={3}
              max={10}
              value={draft.auto_run_delay_seconds}
              onChange={(event) =>
                setDraft((current) => ({
                  ...current,
                  auto_run_delay_seconds: Number(event.target.value),
                }))
              }
            />
          </label>
        </div>

        <h3 className="settings-subheading">에이전트별 LLM</h3>
        <p className="settings-hint">
          각 단계를 수행하는 모델을 선택합니다. Anthropic 은 <code>ANTHROPIC_API_KEY</code>, OpenAI 는{" "}
          <code>OPENAI_API_KEY</code>, Google 은 <code>GOOGLE_API_KEY</code> 가 backend <code>.env</code> 에
          있어야 합니다.
        </p>
        <div className="agent-llm-list">
          {AGENT_IDS.map((id) => {
            const cfg = draft.agent_configs[id] ?? DEFAULT_AGENT_CONFIGS[id];
            const provider = (cfg.provider as LlmProviderId) || "anthropic";
            const presets = MODEL_PRESETS[provider] ?? MODEL_PRESETS.anthropic;
            return (
              <div className="agent-llm-row" key={id}>
                <div className="agent-llm-title">{AGENT_LABELS[id] ?? id}</div>
                <div className="agent-llm-fields">
                  <label>
                    API
                    <select
                      value={provider}
                      onChange={(e) => setAgentProvider(id, e.target.value as LlmProviderId)}
                    >
                      {(Object.keys(PROVIDER_LABELS) as LlmProviderId[]).map((p) => (
                        <option key={p} value={p}>
                          {PROVIDER_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    모델
                    <input
                      type="text"
                      list={`model-presets-${id}`}
                      value={cfg.model}
                      onChange={(e) => setAgentModel(id, e.target.value)}
                      placeholder="claude-sonnet-4-5"
                      autoComplete="off"
                    />
                    <datalist id={`model-presets-${id}`}>
                      {presets.map((m) => (
                        <option key={m} value={m} />
                      ))}
                    </datalist>
                  </label>
                </div>
              </div>
            );
          })}
        </div>

        <div className="action-group" style={{ marginTop: 14 }}>
          <button className="btn btn-primary" onClick={() => void handleSave()} type="button">
            저장
          </button>
          <button className="btn" onClick={closeSettings} type="button">
            닫기
          </button>
        </div>
      </div>
    </aside>
  );
}

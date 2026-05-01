from __future__ import annotations

from dataclasses import dataclass


@dataclass
class LLMTarget:
    provider: str
    model: str


def resolve_llm(agent_configs: dict, agent_id: str) -> LLMTarget:
    config = agent_configs.get(agent_id, {})
    return LLMTarget(
        provider=config.get("provider", "anthropic"),
        model=config.get("model", "claude-sonnet-4-5"),
    )

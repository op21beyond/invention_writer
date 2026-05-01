from __future__ import annotations

from fastapi import APIRouter

from backend.api.models import UpdateSettingsRequest
from backend.api.session_store import SESSIONS


router = APIRouter(prefix="/settings", tags=["settings"])

_global_settings = UpdateSettingsRequest(
    auto_run=False,
    auto_run_delay_seconds=5,
    agent_configs={
        "agent0": {"provider": "anthropic", "model": "claude-sonnet-4-5"},
        "agent1": {"provider": "anthropic", "model": "claude-sonnet-4-5"},
        "agent2": {"provider": "anthropic", "model": "claude-sonnet-4-5"},
        "agent3": {"provider": "anthropic", "model": "claude-sonnet-4-5"},
    },
)


def get_effective_settings() -> UpdateSettingsRequest:
    return _global_settings


@router.get("")
def get_settings():
    return _global_settings.model_dump()


@router.put("")
def update_settings(payload: UpdateSettingsRequest):
    global _global_settings
    _global_settings = payload
    for session in SESSIONS.values():
        session.settings = payload
        session.state["auto_run"] = payload.auto_run
        session.state["auto_run_delay_seconds"] = payload.auto_run_delay_seconds
        session.state["agent_configs"] = payload.agent_configs
    return _global_settings.model_dump()

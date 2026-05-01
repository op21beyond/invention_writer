from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import BaseModel, Field


BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent
ENV_PATH = BACKEND_DIR / ".env"
# 루트 .env 후 backend/.env (로컬이 있으면 덮어씀)
if (PROJECT_ROOT / ".env").is_file():
    load_dotenv(PROJECT_ROOT / ".env", override=False)
if ENV_PATH.is_file():
    load_dotenv(ENV_PATH, override=True)


def _first_env(*names: str) -> str:
    """여러 환경 변수 이름 중 비어 있지 않은 첫 값 (VITE_* 별칭 지원)."""
    import os

    for name in names:
        raw = os.getenv(name)
        if raw is not None and str(raw).strip():
            return str(raw).strip()
    return ""


class AppSettings(BaseModel):
    anthropic_api_key: str = Field(default="")
    openai_api_key: str = Field(default="")
    google_api_key: str = Field(default="")
    kipris_api_key: str = Field(default="")
    epo_client_id: str = Field(default="")
    epo_client_secret: str = Field(default="")
    uspto_api_key: str = Field(default="")
    # Patent search: "kipris" (default) or "uspto" (requires USPTO_API_KEY)
    patent_search_backend: str = Field(default="kipris")
    db_path: str = Field(default="./patent_sessions.db")
    cors_origins: list[str] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )


@lru_cache(maxsize=1)
def get_settings() -> AppSettings:
    import os

    return AppSettings(
        anthropic_api_key=_first_env(
            "ANTHROPIC_API_KEY",
            "VITE_ANTHROPIC_API_KEY",
            "VITE_ANTHROPIC_API_KE",  # 오타로 저장된 경우
        ),
        openai_api_key=_first_env("OPENAI_API_KEY", "VITE_OPENAI_API_KEY"),
        google_api_key=_first_env(
            "GOOGLE_API_KEY",
            "GOOGLE_AI_API_KEY",
            "VITE_GOOGLE_AI_API_KEY",
        ),
        kipris_api_key=_first_env("KIPRIS_API_KEY", "VITE_KIPRIS_API_KEY"),
        epo_client_id=os.getenv("EPO_CLIENT_ID", ""),
        epo_client_secret=os.getenv("EPO_CLIENT_SECRET", ""),
        uspto_api_key=os.getenv("USPTO_API_KEY", ""),
        patent_search_backend=_normalize_patent_search_backend(
            os.getenv("PATENT_SEARCH_BACKEND", "kipris")
        ),
    )


def _normalize_patent_search_backend(raw: str) -> str:
    v = (raw or "kipris").strip().lower()
    if v in ("uspto", "odp"):
        return "uspto"
    return "kipris"

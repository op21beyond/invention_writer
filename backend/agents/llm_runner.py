from __future__ import annotations

import json
import logging
import re
from contextvars import ContextVar, Token
from dataclasses import dataclass
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from backend.agents.llm_router import resolve_llm
from backend.config import get_settings

logger = logging.getLogger(__name__)

_JSON_FENCE = re.compile(r"```(?:json)?\s*([\s\S]*?)```", re.IGNORECASE)


@dataclass(frozen=True)
class LlmStreamContext:
    """Set by WorkflowRuntime while the LangGraph coroutine runs (same asyncio task as LLM nodes)."""

    runtime: Any
    thread_id: str


_LLM_STREAM_CTX: ContextVar[LlmStreamContext | None] = ContextVar("_LLM_STREAM_CTX", default=None)


def push_llm_stream_context(runtime: Any, thread_id: str) -> Token:
    return _LLM_STREAM_CTX.set(LlmStreamContext(runtime=runtime, thread_id=thread_id))


def pop_llm_stream_context(token: Token) -> None:
    _LLM_STREAM_CTX.reset(token)


def _normalize_message_content(content: Any) -> str:
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and "text" in block:
                parts.append(str(block["text"]))
            else:
                parts.append(str(block))
        return "".join(parts)
    return str(content or "")


def _loads_object(t: str) -> dict[str, Any]:
    try:
        out = json.loads(t)
    except json.JSONDecodeError:
        start = t.find("{")
        end = t.rfind("}")
        if start >= 0 and end > start:
            out = json.loads(t[start : end + 1])
        else:
            raise
    if not isinstance(out, dict):
        raise ValueError("JSON is not an object")
    return out


def _loads_array(t: str) -> list[Any]:
    try:
        out = json.loads(t)
    except json.JSONDecodeError:
        start = t.find("[")
        end = t.rfind("]")
        if start >= 0 and end > start:
            out = json.loads(t[start : end + 1])
        else:
            raise
    if not isinstance(out, list):
        raise ValueError("JSON is not an array")
    return out


def extract_json_object(text: str) -> dict[str, Any]:
    t = text.strip()
    if not t:
        raise ValueError("모델 응답이 비어 있어 JSON 객체를 파싱할 수 없습니다.")
    m = _JSON_FENCE.search(t)
    if m:
        t = m.group(1).strip()
    if not t:
        raise ValueError("코드 펜스 안에 유효한 JSON 본문이 없습니다.")
    return _loads_object(t)


def extract_json_array(text: str) -> list[Any]:
    t = text.strip()
    if not t:
        raise ValueError("모델 응답이 비어 있어 JSON 배열을 파싱할 수 없습니다.")
    m = _JSON_FENCE.search(t)
    if m:
        t = m.group(1).strip()
    if not t:
        raise ValueError("코드 펜스 안에 유효한 JSON 본문이 없습니다.")
    return _loads_array(t)


async def invoke_llm_text(
    agent_id: str,
    agent_configs: dict,
    system_prompt: str,
    user_content: str,
    *,
    temperature: float = 0.2,
) -> str:
    target = resolve_llm(agent_configs, agent_id)
    app = get_settings()
    model_name = target.model
    provider = (target.provider or "anthropic").lower()

    if provider == "anthropic":
        if not app.anthropic_api_key:
            raise RuntimeError("ANTHROPIC_API_KEY 가 설정되어 있지 않습니다.")
        from langchain_anthropic import ChatAnthropic

        llm = ChatAnthropic(
            model=model_name,
            temperature=temperature,
            api_key=app.anthropic_api_key,
            max_tokens=8192,
        )
    elif provider == "openai":
        if not app.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY 가 설정되어 있지 않습니다.")
        from langchain_openai import ChatOpenAI

        llm = ChatOpenAI(
            model=model_name,
            temperature=temperature,
            api_key=app.openai_api_key,
            max_tokens=8192,
        )
    elif provider in ("google", "gemini"):
        if not app.google_api_key:
            raise RuntimeError("GOOGLE_API_KEY 가 설정되어 있지 않습니다.")
        from langchain_google_genai import ChatGoogleGenerativeAI

        llm = ChatGoogleGenerativeAI(
            model=model_name,
            temperature=temperature,
            google_api_key=app.google_api_key,
            max_output_tokens=8192,
        )
    else:
        raise RuntimeError(f"지원하지 않는 provider: {provider}")

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_content),
    ]

    ctx = _LLM_STREAM_CTX.get()
    if ctx:
        await ctx.runtime.publish(ctx.thread_id, "llm_stream_start", {"agent_id": agent_id})

    parts: list[str] = []
    async for chunk in llm.astream(messages):
        delta = _normalize_message_content(getattr(chunk, "content", None))
        if not delta:
            continue
        parts.append(delta)
        if ctx:
            full = "".join(parts)
            await ctx.runtime.publish(
                ctx.thread_id,
                "llm_chunk",
                {
                    "agent_id": agent_id,
                    "chunk": delta,
                    "accumulated_len": len(full),
                },
            )

    return "".join(parts)

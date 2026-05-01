from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Request
from sse_starlette.sse import EventSourceResponse

from backend.api.session_store import SESSIONS


router = APIRouter(prefix="/sessions", tags=["stream"])


@router.get("/{thread_id}/stream")
async def stream_session(thread_id: str, request: Request):
    if thread_id not in SESSIONS:
        raise HTTPException(status_code=404, detail="Session not found")

    async def event_generator():
        runtime = request.app.state.runtime
        record = SESSIONS[thread_id]
        yield {
            "event": "checkpoint",
            "data": (
                '{"checkpoint_id":"initial","phase":"%s","status":"%s"}'
                % (record.state.get("phase", "draft"), record.status)
            ),
        }
        async for event in runtime.stream_events(thread_id):
            yield event
            await asyncio.sleep(0)

    return EventSourceResponse(event_generator())

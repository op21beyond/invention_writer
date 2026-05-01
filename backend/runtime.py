from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from typing import Any

from fastapi.encoders import jsonable_encoder
from langgraph.types import Command

from backend.agents.llm_runner import pop_llm_stream_context, push_llm_stream_context
from backend.api.session_store import SessionRecord, serialize_session, utcnow
from backend.graph.navigation import build_navigation_state_patch


@dataclass
class SessionRuntime:
    queue: asyncio.Queue[dict[str, str]] = field(default_factory=asyncio.Queue)
    task: asyncio.Task | None = None
    running: bool = False


class WorkflowRuntime:
    def __init__(self, graph: Any):
        self.graph = graph
        self._runtimes: dict[str, SessionRuntime] = {}

    def ensure_runtime(self, thread_id: str) -> SessionRuntime:
        runtime = self._runtimes.get(thread_id)
        if runtime is None:
            runtime = SessionRuntime()
            self._runtimes[thread_id] = runtime
        return runtime

    async def stream_events(self, thread_id: str):
        runtime = self.ensure_runtime(thread_id)
        while True:
            event = await runtime.queue.get()
            yield event

    async def cancel_session(self, thread_id: str) -> bool:
        runtime = self._runtimes.get(thread_id)
        if not runtime or not runtime.task or runtime.task.done():
            return False
        runtime.task.cancel()
        try:
            await runtime.task
        except asyncio.CancelledError:
            pass
        return True

    async def navigate_to_ribbon_step(self, record: SessionRecord, target_step_index: int) -> SessionRecord:
        runtime = self.ensure_runtime(record.thread_id)
        if runtime.task and not runtime.task.done():
            raise RuntimeError("Graph is still running.")

        patch = build_navigation_state_patch(target_step_index, dict(record.state))
        config = {"configurable": {"thread_id": record.thread_id}}

        await self.graph.aupdate_state(config, patch, as_node="human_review")
        snapshot = await self.graph.aget_state(config)
        if snapshot and snapshot.values:
            record.state = snapshot.values

        if target_step_index == 5:
            record.status = "completed"
        else:
            record.status = "awaiting_human"

        record.updated_at = utcnow()
        return record

    async def start_session(self, record: SessionRecord) -> None:
        record.status = "running"
        record.updated_at = utcnow()
        await self._launch(
            record,
            record.state,
            is_resume=False,
        )

    async def resume_session(self, record: SessionRecord, payload: dict[str, Any]) -> None:
        action = payload.get("action")

        resume_payload = {
            "action": action,
            "directive": payload.get("directive", ""),
            "edited_document": payload.get("edited_document"),
            "approved": action == "approve",
            "rejected": action == "reject",
            "discussion_decisions": payload.get("discussion_decisions") or [],
            "skip_discussion_to_search": bool(payload.get("skip_discussion_to_search")),
            "skip_examination_to_finalize": bool(payload.get("skip_examination_to_finalize")),
        }

        if payload.get("edited_document") is not None:
            record.state["patent_document"] = payload["edited_document"]
        if payload.get("directive"):
            record.state["human_directive"] = payload["directive"]

        record.status = "running"
        record.updated_at = utcnow()
        await self._launch(record, Command(resume=resume_payload), is_resume=True)

    async def _launch(self, record: SessionRecord, graph_input: Any, is_resume: bool) -> None:
        runtime = self.ensure_runtime(record.thread_id)

        if runtime.task and not runtime.task.done():
            runtime.task.cancel()

        runtime.running = True
        runtime.task = asyncio.create_task(self._run_graph(record, graph_input, is_resume=is_resume))

    async def _run_graph(self, record: SessionRecord, graph_input: Any, is_resume: bool) -> None:
        runtime = self.ensure_runtime(record.thread_id)
        config = {"configurable": {"thread_id": record.thread_id}}

        stream_token = push_llm_stream_context(self, record.thread_id)
        try:
            async for update in self.graph.astream(graph_input, config=config, stream_mode="updates"):
                if "__interrupt__" in update:
                    interrupt_payload = self._serialize_interrupts(update["__interrupt__"])
                    record.status = "awaiting_human"
                    record.updated_at = utcnow()
                    await self.publish(
                        record.thread_id,
                        "interrupt",
                        {
                            "type": "gate" if record.state.get("phase") == "finalize" else "review",
                            "phase": record.state.get("phase", "draft"),
                            "round": record.state.get("discussion_round", 0),
                            "payload": interrupt_payload,
                        },
                    )
                    break

                for node_name, patch in update.items():
                    if node_name == "__metadata__":
                        continue
                    await self.publish(
                        record.thread_id,
                        "node_complete",
                        {"node": node_name, "state_patch": patch},
                    )

            snapshot = await self.graph.aget_state(config)
            if snapshot and snapshot.values:
                record.state = snapshot.values
            record.updated_at = utcnow()

            if record.status == "running":
                record.status = "completed" if record.state.get("human_approved") else "awaiting_human"

            await self.publish(
                record.thread_id,
                "checkpoint",
                {
                    "checkpoint_id": "latest",
                    "phase": record.state.get("phase", "draft"),
                    "session": serialize_session(record),
                },
            )
        except asyncio.CancelledError:
            try:
                snapshot = await self.graph.aget_state(config)
                if snapshot and snapshot.values:
                    record.state = snapshot.values
            except Exception:  # pragma: no cover
                pass
            if record.status == "running":
                record.status = "awaiting_human"
            record.updated_at = utcnow()
            await self.publish(
                record.thread_id,
                "checkpoint",
                {
                    "checkpoint_id": "cancelled",
                    "phase": record.state.get("phase", "draft"),
                    "session": serialize_session(record),
                },
            )
            return
        except Exception as exc:  # pragma: no cover - defensive runtime reporting
            record.status = "error"
            record.updated_at = utcnow()
            await self.publish(
                record.thread_id,
                "error",
                {"message": str(exc), "recoverable": True},
            )
        finally:
            pop_llm_stream_context(stream_token)
            runtime.running = False

    async def publish(self, thread_id: str, event: str, data: dict[str, Any]) -> None:
        runtime = self.ensure_runtime(thread_id)
        safe = jsonable_encoder(data)
        await runtime.queue.put({"event": event, "data": json.dumps(safe, ensure_ascii=False)})

    def _serialize_interrupts(self, interrupts: Any) -> list[dict[str, Any]]:
        serialized: list[dict[str, Any]] = []
        for item in interrupts:
            serialized.append(
                {
                    "id": getattr(item, "id", ""),
                    "value": getattr(item, "value", item),
                }
            )
        return serialized

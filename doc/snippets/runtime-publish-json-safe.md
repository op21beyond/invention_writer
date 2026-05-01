# SSE `publish` 시 JSON 안전 페이로드

LangGraph `updates` 스트림의 `state_patch`에는 `conversation_log` 등으로 **LangChain 메시지 객체**가 들어올 수 있다. SSE로 내려보내기 전에 **그대로 `json.dumps` 하면 실패**하고 세션이 `error`가 될 수 있으므로, FastAPI의 `jsonable_encoder`로 한 번 거친다.

```python
from fastapi.encoders import jsonable_encoder

async def publish(self, thread_id: str, event: str, data: dict[str, Any]) -> None:
    runtime = self.ensure_runtime(thread_id)
    safe = jsonable_encoder(data)
    await runtime.queue.put({"event": event, "data": json.dumps(safe, ensure_ascii=False)})
```

참조: `backend/runtime.py`, `HISTORY.md` 항목 `2026-05-01 03:00`.

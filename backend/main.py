from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.sessions import router as sessions_router
from backend.api.settings import router as settings_router
from backend.api.stream import router as stream_router
from backend.config import get_settings
from backend.graph.builder import build_patent_graph
from backend.runtime import WorkflowRuntime
from backend.session.checkpointer import create_checkpointer_context


settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    checkpointer_context = create_checkpointer_context()
    checkpointer = await checkpointer_context.__aenter__()
    graph = build_patent_graph(checkpointer)
    app.state.graph = graph
    app.state.checkpointer = checkpointer
    app.state.checkpointer_context = checkpointer_context
    app.state.runtime = WorkflowRuntime(graph)
    yield
    await checkpointer_context.__aexit__(None, None, None)


app = FastAPI(title="invention_writer backend", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sessions_router)
app.include_router(stream_router)
app.include_router(settings_router)


@app.get("/health")
def healthcheck():
    return {"ok": True}

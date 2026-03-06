from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sequence.agent.agent_router import AgentRouter
from sequence.agent.base_agent import LLMAgent
from sequence.agent.llm_client import LLMClient
from sequence.api.routes import auth, chat, workspace
from sequence.core.config import AGENT_MODE_RUNTIME_CONFIG, get_settings
from sequence.core.redis import RedisClient
from sequence.database.chat_db import ChatDB
from sequence.database.files_db import FilesDB
from sequence.models.chat import AgentMode
from sequence.services.chat_service import ChatService
from sequence.services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()

    # ── Startup ──
    redis = RedisClient(settings.REDIS_URL)
    await redis.ping()
    logger.info("Redis connected")

    chat_db = ChatDB(dsn=settings.POSTGRES_URL)
    await chat_db.connect()

    files_db = FilesDB(dsn=settings.POSTGRES_URL)
    await files_db.connect()

    workspace_service = WorkspaceService(files_db=files_db)

    agents: dict[AgentMode, LLMAgent] = {}
    for mode in AgentMode:
        config = AGENT_MODE_RUNTIME_CONFIG[mode]
        agents[mode] = LLMAgent(
            llm_client=LLMClient(api_key=settings.OPENAI_API_KEY),
            system_prompt=config.system_prompt,
            tool_dir=list(config.tool_dirs),
            auto_execute_tools=config.auto_execute_tools,
        )

    agent_router = AgentRouter(agents)
    chat_service = ChatService(
        redis=redis,
        agent_router=agent_router,
        chat_db=chat_db,
        workspace_service=workspace_service,
    )

    app.state.redis = redis
    app.state.chat_service = chat_service
    app.state.files_db = files_db
    app.state.workspace_service = workspace_service

    yield

    # ── Shutdown ──
    await chat_service.shutdown()
    await redis.close()
    await files_db.disconnect()
    await chat_db.disconnect()
    logger.info("Shutdown complete")


app = FastAPI(title="Sequence", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(workspace.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}

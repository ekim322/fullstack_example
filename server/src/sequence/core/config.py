import os
from dataclasses import dataclass
from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel

from sequence.agent.prompts.planner_prompt import PLANNER_PROMPT
from sequence.agent.prompts.system_prompt import SYSTEM_PROMPT
from sequence.models.chat import AgentMode

load_dotenv(override=True)


class Settings(BaseModel):
    REDIS_URL: str
    POSTGRES_URL: str
    OPENAI_API_KEY: str
    CLIENT_PASSWORD: str
    SESSION_SIGNING_SECRET: str


@dataclass(frozen=True)
class AgentRuntimeConfig:
    system_prompt: str | None
    tool_dirs: tuple[str, ...]
    auto_execute_tools: tuple[str, ...] = ()


AGENT_MODE_RUNTIME_CONFIG: dict[AgentMode, AgentRuntimeConfig] = {
    AgentMode.PLAN: AgentRuntimeConfig(
        system_prompt=PLANNER_PROMPT,
        tool_dirs=(
            "sequence.agent.tools.planner_tools",
            "sequence.agent.tools.shared_tools",
        ),
        auto_execute_tools=("create_plan", "ask_user_question"),
    ),
    AgentMode.CHAT: AgentRuntimeConfig(
        system_prompt=SYSTEM_PROMPT,
        tool_dirs=(
            "sequence.agent.tools.execution_tools",
            "sequence.agent.tools.shared_tools",
        ),
        auto_execute_tools=("ask_user_question",),
    ),
}


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings(
        REDIS_URL=os.environ["REDIS_URL"],
        POSTGRES_URL=os.environ["POSTGRES_URL"],
        OPENAI_API_KEY=os.environ["OPENAI_API_KEY"],
        CLIENT_PASSWORD=os.environ["CLIENT_PASSWORD"],
        SESSION_SIGNING_SECRET=os.environ["SESSION_SIGNING_SECRET"],
    )

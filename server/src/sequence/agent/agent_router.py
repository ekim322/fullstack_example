import logging
from collections.abc import AsyncGenerator
from typing import Any

from sequence.agent.base_agent import LLMAgent
from sequence.agent.llm_client import ReasoningEffort
from sequence.models.chat import AgentMode
from sequence.models.stream_events import StreamEvent

logger = logging.getLogger(__name__)


class AgentRouter:
    def __init__(self, agents_by_mode: dict[AgentMode, LLMAgent]):
        if not agents_by_mode:
            raise ValueError("agents_by_mode must contain at least one agent")
        self._agents_by_mode = agents_by_mode
        self._fallback_mode = AgentMode.CHAT if AgentMode.CHAT in agents_by_mode else next(iter(agents_by_mode))

    def _agent_for_mode(self, mode: AgentMode) -> LLMAgent:
        agent = self._agents_by_mode.get(mode)
        if agent is not None:
            return agent
        logger.warning("No agent configured for mode '%s'; falling back to '%s'", mode.value, self._fallback_mode.value)
        return self._agents_by_mode[self._fallback_mode]

    def run(
        self,
        mode: AgentMode,
        messages: list[dict[str, Any]],
        auto_confirm_tools: bool = False,
        confirmations: dict[str, bool] | None = None,
        model: str | None = None,
        reasoning: ReasoningEffort | None = None,
    ) -> AsyncGenerator[StreamEvent, None]:
        agent = self._agent_for_mode(mode)
        return agent.run(
            messages=messages,
            auto_confirm_tools=auto_confirm_tools,
            confirmations=confirmations,
            model=model,
            reasoning=reasoning,
        )

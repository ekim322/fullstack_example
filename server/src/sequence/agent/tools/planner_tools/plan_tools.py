import json
import re
from typing import Any

from sequence.agent.helpers.tool_helper import ToolHelper

_PLANS_FOLDER_PATH = "/PLANS"


def _build_plan(
    steps: list[str],
    sub_steps: list[str] | None,
) -> list[dict[str, object]]:
    plan: list[dict[str, object]] = []
    for i, step in enumerate(steps, start=1):
        step_num = str(i)
        children = []
        if sub_steps:
            for sub_step in sub_steps:
                if re.match(rf"^{step_num}\.", sub_step):
                    children.append(sub_step)

        plan.append(
            {
                "step": i,
                "description": step,
                "sub_steps": children,
            }
        )

    return plan


def _normalize_plan_file_path(file_path: str, workspace_service: Any) -> str:
    if not isinstance(file_path, str) or not file_path.strip():
        raise ValueError("file_path is required")

    candidate = file_path.strip()
    if candidate.startswith("/"):
        normalized_path = workspace_service.normalize_absolute_path(candidate)
        if normalized_path == _PLANS_FOLDER_PATH:
            raise ValueError("file_path must point to a file under /PLANS")
        if not normalized_path.startswith(f"{_PLANS_FOLDER_PATH}/"):
            raise ValueError("file_path must be under /PLANS")
    else:
        normalized_relative_path = workspace_service.normalize_relative_path(candidate)
        normalized_path = f"{_PLANS_FOLDER_PATH}/{normalized_relative_path}"

    filename = normalized_path.rsplit("/", 1)[-1]
    if "." not in filename:
        normalized_path = f"{normalized_path}.json"

    return normalized_path


async def create_plan(
    steps: list[str],
    sub_steps: list[str] | None,
    file_path: str,
    tool_helper: ToolHelper = None,
) -> str:
    """
    Create a structured, sequential plan to fulfill the user's request.
    Call this once before any execution begins. Sub-steps are prefixed with
    their parent step number (e.g. "1.1", "1.2", "2.1") so they can be
    associated back to the correct top-level step.

    Args:
        steps: An ordered list of top-level steps to execute sequentially,
            each described in plain English (e.g. ["1. Write a Python script", "2. Execute it"]).
        sub_steps: An ordered list of smaller atomic actions that make up each
            top-level step, prefixed with their parent step index
            (e.g. ["1.1 Define the function", "1.2 Add a loop", "2.1 Run via subprocess"]).
            Pass null if no sub-steps are needed.
        file_path: Target file path for saving the plan. This must resolve to a file
            under "/PLANS". You may pass either an absolute path (e.g. "/PLANS/task-plan.json")
            or a relative path (e.g. "task-plan.json"), which will be saved under "/PLANS".
    """
    try:
        if tool_helper is None:
            return json.dumps({"error": "Missing tool helper dependency"})

        user_id, workspace_service = tool_helper.require_workspace_context()
        normalized_plan_file_path = _normalize_plan_file_path(file_path, workspace_service)

        plan_payload = {"plan": _build_plan(steps=steps, sub_steps=sub_steps)}
        serialized_plan = json.dumps(plan_payload, indent=2)

        await workspace_service.create_folder(
            user_id=user_id,
            path=_PLANS_FOLDER_PATH,
            recursive=True,
        )
        await workspace_service.write_text_file(
            user_id=user_id,
            path=normalized_plan_file_path,
            content=serialized_plan,
        )

        return json.dumps({"path": normalized_plan_file_path})
    except Exception as exc:
        return json.dumps({"error": str(exc) or "Failed to create plan"})

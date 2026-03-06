from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from sequence.core.dependencies import AuthenticatedUserDep, ChatServiceDep
from sequence.models.chat import (
    ChatRequest,
    ChatResponse,
    ThreadHistoryResponse,
    ThreadOpenStateRequest,
    ThreadOpenStateResponse,
    ThreadStatusResponse,
)

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("", response_model=ChatResponse, status_code=201)
async def chat(body: ChatRequest, service: ChatServiceDep, user_id: AuthenticatedUserDep):
    if body.user_id != user_id:
        raise HTTPException(403, "user_id does not match authenticated session")

    try:
        thread_id, session_id = await service.handle_chat(
            thread_id=body.thread_id,
            message=body.message,
            confirmations=body.confirmations,
            mode=body.mode,
            model=body.model,
            auto_confirm_tools=body.auto_confirm_tools,
            user_id=user_id,
        )
    except ValueError as exc:
        msg = str(exc).lower()
        if "not found" in msg:
            raise HTTPException(404, str(exc))
        raise HTTPException(409, str(exc))

    return ChatResponse(thread_id=thread_id, session_id=session_id, status="running")


@router.get("/threads", response_model=ThreadHistoryResponse)
async def get_threads(
    service: ChatServiceDep,
    user_id: AuthenticatedUserDep,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    threads = await service.list_threads_for_user(user_id=user_id, limit=limit, offset=offset)
    return ThreadHistoryResponse(threads=threads)


@router.patch("/{thread_id}/open-state", response_model=ThreadOpenStateResponse)
async def set_thread_open_state(
    thread_id: str,
    body: ThreadOpenStateRequest,
    service: ChatServiceDep,
    user_id: AuthenticatedUserDep,
):
    updated = await service.set_thread_open_state(
        thread_id=thread_id,
        user_id=user_id,
        is_open=body.is_open,
    )
    if not updated:
        raise HTTPException(404, "Thread not found")
    return ThreadOpenStateResponse(thread_id=thread_id, is_open=body.is_open)


@router.get("/{session_id}/events")
async def stream_session_events(
    session_id: str,
    service: ChatServiceDep,
    user_id: AuthenticatedUserDep,
    last_id: str = Query("0-0", description="Resume from this Redis stream entry ID"),
):
    try:
        await service.validate_session_access(session_id=session_id, user_id=user_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc

    async def sse_generator():
        try:
            async for item in service.stream_session_events(
                session_id,
                last_id,
                user_id=user_id,
                access_validated=True,
            ):
                if item is None:
                    yield ": heartbeat\n\n"
                else:
                    entry_id, event = item
                    yield (f"id: {entry_id}\n" f"event: {event.type.value}\n" f"data: {event.model_dump_json()}\n\n")
        except asyncio.CancelledError:
            return

    return StreamingResponse(
        sse_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{thread_id}/status", response_model=ThreadStatusResponse)
async def get_thread_status(thread_id: str, service: ChatServiceDep, user_id: AuthenticatedUserDep):
    status = await service.get_thread_status(thread_id, user_id=user_id)
    if status is None:
        raise HTTPException(404, "Thread not found")
    return ThreadStatusResponse(thread_id=thread_id, **status)


@router.post("/{thread_id}/stop")
async def stop_session(thread_id: str, service: ChatServiceDep, user_id: AuthenticatedUserDep):
    stopped = await service.stop_session(thread_id, user_id=user_id)
    if not stopped:
        raise HTTPException(404, "Active session not found for thread")
    return {"status": "stopped"}

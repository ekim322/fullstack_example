from __future__ import annotations

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile, status

from sequence.core.dependencies import AuthenticatedUserDep, WorkspaceServiceDep
from sequence.models.workspace import (
    MAX_TEXT_FILE_SIZE_BYTES,
    WorkspaceCreateFolderRequest,
    WorkspaceDeleteResult,
    WorkspaceDirectoryListing,
    WorkspaceFile,
    WorkspaceFolderCreateResult,
    WorkspaceTreeSnapshot,
    WorkspaceUploadItem,
    WorkspaceUploadResult,
    WorkspaceWriteFileRequest,
    WorkspaceWriteResult,
)

router = APIRouter(prefix="/workspace", tags=["workspace"])


def _to_http_error(exc: Exception) -> HTTPException:
    if isinstance(exc, HTTPException):
        return exc
    if isinstance(exc, FileNotFoundError):
        return HTTPException(status_code=404, detail=str(exc) or "Not found")
    if isinstance(exc, FileExistsError):
        return HTTPException(status_code=409, detail=str(exc) or "Already exists")
    if isinstance(exc, (IsADirectoryError, NotADirectoryError, OSError)):
        return HTTPException(status_code=409, detail=str(exc) or "Conflict")
    if isinstance(exc, ValueError):
        return HTTPException(status_code=422, detail=str(exc) or "Invalid request")
    return HTTPException(status_code=400, detail=str(exc) or "Workspace operation failed")


def _normalize_upload_relative_path(relative_path: str) -> str:
    candidate = relative_path.replace("\\", "/").strip().lstrip("/")
    if not candidate:
        raise HTTPException(status_code=422, detail="Upload relative path is required")

    parts = candidate.split("/")
    for part in parts:
        if part in ("", ".", ".."):
            raise HTTPException(status_code=422, detail=f"Invalid upload path segment: {part!r}")

    return "/".join(parts)


@router.get("/tree", response_model=WorkspaceTreeSnapshot)
async def get_workspace_tree(
    service: WorkspaceServiceDep,
    user_id: AuthenticatedUserDep,
):
    try:
        return await service.tree_snapshot(user_id=user_id)
    except Exception as exc:
        raise _to_http_error(exc) from exc


@router.get("/directory", response_model=WorkspaceDirectoryListing)
async def get_workspace_directory(
    service: WorkspaceServiceDep,
    user_id: AuthenticatedUserDep,
    path: str = Query("/", min_length=1),
):
    try:
        return await service.list_directory_children(user_id=user_id, path=path)
    except Exception as exc:
        raise _to_http_error(exc) from exc


@router.get("/file", response_model=WorkspaceFile)
async def get_workspace_file(
    service: WorkspaceServiceDep,
    user_id: AuthenticatedUserDep,
    path: str = Query(..., min_length=1),
):
    try:
        return await service.read_file(user_id=user_id, path=path)
    except Exception as exc:
        raise _to_http_error(exc) from exc


@router.put("/file", response_model=WorkspaceWriteResult)
async def put_workspace_file(
    body: WorkspaceWriteFileRequest,
    service: WorkspaceServiceDep,
    user_id: AuthenticatedUserDep,
):
    try:
        if not body.overwrite:
            try:
                await service.read_file(user_id=user_id, path=body.path)
                raise HTTPException(status_code=409, detail=f"File already exists: {body.path}")
            except FileNotFoundError:
                pass

        return await service.write_text_file(
            user_id=user_id,
            path=body.path,
            content=body.content,
            expected_version=body.expected_version,
        )
    except Exception as exc:
        raise _to_http_error(exc) from exc


@router.delete("/file", response_model=WorkspaceDeleteResult)
async def delete_workspace_file(
    service: WorkspaceServiceDep,
    user_id: AuthenticatedUserDep,
    path: str = Query(..., min_length=1),
):
    try:
        return await service.delete_file(user_id=user_id, path=path)
    except Exception as exc:
        raise _to_http_error(exc) from exc


@router.post("/folder", response_model=WorkspaceFolderCreateResult, status_code=status.HTTP_201_CREATED)
async def create_workspace_folder(
    body: WorkspaceCreateFolderRequest,
    service: WorkspaceServiceDep,
    user_id: AuthenticatedUserDep,
):
    try:
        return await service.create_folder(
            user_id=user_id,
            path=body.path,
            recursive=body.recursive,
        )
    except Exception as exc:
        raise _to_http_error(exc) from exc


@router.delete("/folder", response_model=WorkspaceDeleteResult)
async def delete_workspace_folder(
    service: WorkspaceServiceDep,
    user_id: AuthenticatedUserDep,
    path: str = Query(..., min_length=1),
    recursive: bool = Query(False),
):
    try:
        return await service.delete_folder(user_id=user_id, path=path, recursive=recursive)
    except Exception as exc:
        raise _to_http_error(exc) from exc


@router.post("/upload", response_model=WorkspaceUploadResult, status_code=status.HTTP_201_CREATED)
async def upload_workspace_files(
    service: WorkspaceServiceDep,
    user_id: AuthenticatedUserDep,
    files: list[UploadFile] = File(...),
    base_path: str = Form("/"),
    paths: list[str] | None = Form(default=None),
):
    if not files:
        raise HTTPException(status_code=422, detail="At least one file is required")
    if paths is not None and len(paths) != len(files):
        raise HTTPException(status_code=422, detail="'paths' must match the number of files")

    upload_items: list[WorkspaceUploadItem] = []
    for index, upload in enumerate(files):
        filename = upload.filename or ""
        try:
            relative_path = _normalize_upload_relative_path(paths[index] if paths is not None else filename)
            blob = await upload.read(MAX_TEXT_FILE_SIZE_BYTES + 1)
            if len(blob) > MAX_TEXT_FILE_SIZE_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"File '{filename}' exceeds {MAX_TEXT_FILE_SIZE_BYTES} bytes",
                )

            try:
                text_content = blob.decode("utf-8")
            except UnicodeDecodeError as exc:
                raise HTTPException(
                    status_code=422,
                    detail=f"File '{filename}' is not valid UTF-8 text",
                ) from exc

            upload_items.append(WorkspaceUploadItem(relative_path=relative_path, content=text_content))
        finally:
            await upload.close()

    try:
        return await service.upload_text_files(
            user_id=user_id,
            files=upload_items,
            target_base_path=base_path,
        )
    except Exception as exc:
        raise _to_http_error(exc) from exc

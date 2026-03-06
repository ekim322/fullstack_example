from __future__ import annotations

import enum
from datetime import datetime

from pydantic import BaseModel, Field

MAX_TEXT_FILE_SIZE_BYTES = 1_048_576
MAX_FILE_SIZE_BYTES = MAX_TEXT_FILE_SIZE_BYTES

SUPPORTED_TEXT_EXTENSIONS: tuple[str, ...] = (
    ".txt",
    ".md",
    ".json",
    ".csv",
    ".py",
    ".js",
    ".ts",
    ".tsx",
    ".jsx",
    ".html",
    ".css",
    ".yml",
    ".yaml",
    ".toml",
    ".ini",
)
SUPPORTED_TEXT_EXTENSIONS_SET = frozenset(SUPPORTED_TEXT_EXTENSIONS)


class WorkspaceNodeType(str, enum.Enum):
    FILE = "file"
    FOLDER = "folder"


class WorkspaceNode(BaseModel):
    path: str
    parent_path: str
    name: str
    node_type: WorkspaceNodeType
    size_bytes: int = Field(ge=0)
    version: int = Field(ge=1)
    created_at: datetime
    updated_at: datetime


class WorkspaceFile(WorkspaceNode):
    content: str


class WorkspaceDirectoryListing(BaseModel):
    path: str
    children: list[WorkspaceNode] = Field(default_factory=list)


class WorkspaceTreeNode(BaseModel):
    path: str
    name: str
    node_type: WorkspaceNodeType
    size_bytes: int = Field(ge=0)
    version: int = Field(ge=1)
    children: list[WorkspaceTreeNode] = Field(default_factory=list)


class WorkspaceTreeSnapshot(BaseModel):
    root: WorkspaceTreeNode


class WorkspaceWriteFileRequest(BaseModel):
    path: str = Field(min_length=1)
    content: str
    expected_version: int | None = Field(default=None, ge=0)
    overwrite: bool = True


class WorkspaceWriteResult(BaseModel):
    path: str
    parent_path: str
    name: str
    node_type: WorkspaceNodeType = WorkspaceNodeType.FILE
    size_bytes: int = Field(ge=0)
    version: int = Field(ge=1)
    created: bool
    created_at: datetime
    updated_at: datetime


class WorkspaceCreateFolderRequest(BaseModel):
    path: str = Field(min_length=1)
    recursive: bool = True


class WorkspaceFolderCreateResult(BaseModel):
    path: str
    parent_path: str
    name: str
    node_type: WorkspaceNodeType = WorkspaceNodeType.FOLDER
    size_bytes: int = 0
    version: int = Field(ge=1)
    created: bool
    created_at: datetime
    updated_at: datetime


class WorkspaceDeleteResult(BaseModel):
    path: str
    deleted: bool
    deleted_count: int = Field(ge=0)


class WorkspaceUploadItem(BaseModel):
    relative_path: str = Field(min_length=1)
    content: bytes | str
    expected_version: int | None = Field(default=None, ge=0)


class WorkspaceUploadResult(BaseModel):
    base_path: str
    files: list[WorkspaceWriteResult] = Field(default_factory=list)


WorkspaceTreeNode.model_rebuild()

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Iterable

from sequence.database.files_db import FilesDB
from sequence.models.workspace import (
    MAX_TEXT_FILE_SIZE_BYTES,
    SUPPORTED_TEXT_EXTENSIONS_SET,
    WorkspaceDeleteResult,
    WorkspaceDirectoryListing,
    WorkspaceFile,
    WorkspaceFolderCreateResult,
    WorkspaceNode,
    WorkspaceNodeType,
    WorkspaceTreeNode,
    WorkspaceTreeSnapshot,
    WorkspaceUploadItem,
    WorkspaceUploadResult,
    WorkspaceWriteResult,
)

logger = logging.getLogger(__name__)


class WorkspaceService:
    def __init__(self, files_db: FilesDB) -> None:
        self.files_db = files_db

    @staticmethod
    def normalize_absolute_path(path: str) -> str:
        if not isinstance(path, str):
            raise ValueError("Path must be a string")

        candidate = path.strip()
        if not candidate:
            raise ValueError("Path is required")
        if "\x00" in candidate:
            raise ValueError("Path cannot contain null bytes")
        if "\\" in candidate:
            raise ValueError("Path must use POSIX separators")
        if not candidate.startswith("/"):
            raise ValueError("Path must be an absolute POSIX path")

        if candidate == "/":
            return "/"

        if candidate.endswith("/"):
            candidate = candidate[:-1]

        segments = candidate.split("/")[1:]
        if not segments:
            return "/"
        for segment in segments:
            if segment in ("", ".", ".."):
                raise ValueError(f"Invalid path segment: {segment!r}")

        return "/" + "/".join(segments)

    @staticmethod
    def normalize_relative_path(path: str) -> str:
        if not isinstance(path, str):
            raise ValueError("Relative path must be a string")

        candidate = path.strip()
        if not candidate:
            raise ValueError("Relative path is required")
        if "\x00" in candidate:
            raise ValueError("Relative path cannot contain null bytes")
        if "\\" in candidate:
            raise ValueError("Relative path must use POSIX separators")
        if candidate.startswith("/"):
            raise ValueError("Relative path cannot be absolute")
        if candidate.endswith("/"):
            raise ValueError("Relative file path cannot end with '/'")

        segments = candidate.split("/")
        for segment in segments:
            if segment in ("", ".", ".."):
                raise ValueError(f"Invalid relative path segment: {segment!r}")

        return "/".join(segments)

    @staticmethod
    def _normalize_user_id(user_id: str) -> str:
        if not isinstance(user_id, str):
            raise ValueError("user_id must be a string")
        normalized = user_id.strip()
        if not normalized:
            raise ValueError("user_id is required")
        return normalized

    @staticmethod
    def _split_parent(path: str) -> tuple[str, str]:
        if path == "/":
            raise ValueError("Root path does not have a parent segment")

        segments = path[1:].split("/")
        name = segments[-1]
        if len(segments) == 1:
            return "/", name
        parent_path = "/" + "/".join(segments[:-1])
        return parent_path, name

    @staticmethod
    def _join_absolute_and_relative(base_path: str, relative_path: str) -> str:
        if base_path == "/":
            return "/" + relative_path
        return f"{base_path}/{relative_path}"

    @staticmethod
    def _ensure_supported_text_extension(path: str) -> None:
        normalized = path.lower()
        if not any(normalized.endswith(ext) for ext in SUPPORTED_TEXT_EXTENSIONS_SET):
            supported = ", ".join(sorted(SUPPORTED_TEXT_EXTENSIONS_SET))
            raise ValueError(
                f"Unsupported file extension for {path}. Supported text extensions: {supported}"
            )

    @staticmethod
    def _validate_text_size(size_bytes: int, path: str) -> None:
        if size_bytes > MAX_TEXT_FILE_SIZE_BYTES:
            raise ValueError(
                f"File too large for {path}: {size_bytes} bytes exceeds {MAX_TEXT_FILE_SIZE_BYTES} bytes"
            )

    def _ingest_upload_text_content(self, path: str, content: bytes | str) -> tuple[str, int]:
        if isinstance(content, bytes):
            self._validate_text_size(len(content), path)
            try:
                text = content.decode("utf-8")
            except UnicodeDecodeError as exc:
                raise ValueError(f"Binary/non-UTF-8 content is not supported for {path}") from exc
            return text, len(content)

        if isinstance(content, str):
            encoded = content.encode("utf-8")
            self._validate_text_size(len(encoded), path)
            return content, len(encoded)

        raise ValueError("Upload content must be bytes or string")

    async def list_directory_children(self, *, user_id: str, path: str = "/") -> WorkspaceDirectoryListing:
        scoped_user_id = self._normalize_user_id(user_id)
        directory_path = self.normalize_absolute_path(path)

        if directory_path != "/":
            node = await self.files_db.get_node(user_id=scoped_user_id, path=directory_path)
            if node is None:
                raise FileNotFoundError(f"Folder not found: {directory_path}")
            if node.node_type != WorkspaceNodeType.FOLDER:
                raise NotADirectoryError(f"Path is not a folder: {directory_path}")

        children = await self.files_db.list_directory_children(
            user_id=scoped_user_id,
            directory_path=directory_path,
        )
        return WorkspaceDirectoryListing(path=directory_path, children=children)

    async def tree_snapshot(self, *, user_id: str, root_path: str = "/") -> WorkspaceTreeSnapshot:
        scoped_user_id = self._normalize_user_id(user_id)
        normalized_root = self.normalize_absolute_path(root_path)

        root_folder: WorkspaceNode | None = None
        if normalized_root != "/":
            root_candidate = await self.files_db.get_node(user_id=scoped_user_id, path=normalized_root)
            if root_candidate is None:
                raise FileNotFoundError(f"Folder not found: {normalized_root}")
            if root_candidate.node_type != WorkspaceNodeType.FOLDER:
                raise NotADirectoryError(f"Path is not a folder: {normalized_root}")
            root_folder = root_candidate

        nodes = await self.files_db.list_subtree_nodes(user_id=scoped_user_id, root_path=normalized_root)
        tree_nodes: dict[str, WorkspaceTreeNode] = {}
        parent_by_path: dict[str, str | None] = {}

        if normalized_root == "/":
            tree_nodes["/"] = WorkspaceTreeNode(
                path="/",
                name="/",
                node_type=WorkspaceNodeType.FOLDER,
                size_bytes=0,
                version=1,
            )
            parent_by_path["/"] = None
        else:
            assert root_folder is not None
            tree_nodes[normalized_root] = WorkspaceTreeNode(
                path=root_folder.path,
                name=root_folder.name,
                node_type=root_folder.node_type,
                size_bytes=root_folder.size_bytes,
                version=root_folder.version,
            )
            parent_by_path[normalized_root] = root_folder.parent_path

        for node in nodes:
            if normalized_root != "/" and node.path == normalized_root:
                continue
            tree_nodes[node.path] = WorkspaceTreeNode(
                path=node.path,
                name=node.name,
                node_type=node.node_type,
                size_bytes=node.size_bytes,
                version=node.version,
            )
            parent_by_path[node.path] = node.parent_path

        for path_key, tree_node in tree_nodes.items():
            if path_key == normalized_root:
                continue

            parent_path = parent_by_path.get(path_key)
            if parent_path is None:
                continue
            parent_node = tree_nodes.get(parent_path)
            if parent_node is None:
                continue
            parent_node.children.append(tree_node)

        self._sort_tree_children(tree_nodes[normalized_root])
        return WorkspaceTreeSnapshot(root=tree_nodes[normalized_root])

    def _sort_tree_children(self, node: WorkspaceTreeNode) -> None:
        node.children.sort(
            key=lambda child: (
                0 if child.node_type == WorkspaceNodeType.FOLDER else 1,
                child.name.lower(),
                child.name,
            )
        )
        for child in node.children:
            self._sort_tree_children(child)

    async def read_file(self, *, user_id: str, path: str) -> WorkspaceFile:
        scoped_user_id = self._normalize_user_id(user_id)
        file_path = self.normalize_absolute_path(path)
        if file_path == "/":
            raise IsADirectoryError("Path is not a file: /")

        file_entry = await self.files_db.get_file(user_id=scoped_user_id, path=file_path)
        if file_entry is not None:
            return file_entry

        node = await self.files_db.get_node(user_id=scoped_user_id, path=file_path)
        if node is None:
            raise FileNotFoundError(f"File not found: {file_path}")
        raise IsADirectoryError(f"Path is not a file: {file_path}")

    async def create_folder(
        self,
        *,
        user_id: str,
        path: str,
        recursive: bool = True,
    ) -> WorkspaceFolderCreateResult:
        scoped_user_id = self._normalize_user_id(user_id)
        folder_path = self.normalize_absolute_path(path)

        if folder_path == "/":
            now = datetime.now(timezone.utc)
            return WorkspaceFolderCreateResult(
                path="/",
                parent_path="/",
                name="/",
                created=False,
                version=1,
                created_at=now,
                updated_at=now,
            )

        if not recursive:
            parent_path, name = self._split_parent(folder_path)
            return await self.files_db.create_folder(
                user_id=scoped_user_id,
                path=folder_path,
                parent_path=parent_path,
                name=name,
            )

        current_parent = "/"
        result: WorkspaceFolderCreateResult | None = None

        for segment in folder_path[1:].split("/"):
            current_path = f"/{segment}" if current_parent == "/" else f"{current_parent}/{segment}"
            result = await self.files_db.create_folder(
                user_id=scoped_user_id,
                path=current_path,
                parent_path=current_parent,
                name=segment,
            )
            current_parent = current_path

        assert result is not None
        return result

    async def write_text_file(
        self,
        *,
        user_id: str,
        path: str,
        content: str,
        expected_version: int | None = None,
    ) -> WorkspaceWriteResult:
        scoped_user_id = self._normalize_user_id(user_id)
        file_path = self.normalize_absolute_path(path)
        if file_path == "/":
            raise IsADirectoryError("Cannot write file content to root path '/'")
        if expected_version is not None and expected_version < 0:
            raise ValueError("expected_version must be >= 0")

        self._ensure_supported_text_extension(file_path)
        if not isinstance(content, str):
            raise ValueError("File content must be a UTF-8 text string")

        encoded_content = content.encode("utf-8")
        self._validate_text_size(len(encoded_content), file_path)

        parent_path, name = self._split_parent(file_path)
        if parent_path != "/":
            await self.create_folder(user_id=scoped_user_id, path=parent_path, recursive=True)

        return await self.files_db.upsert_text_file(
            user_id=scoped_user_id,
            path=file_path,
            parent_path=parent_path,
            name=name,
            content=content,
            size_bytes=len(encoded_content),
            expected_version=expected_version,
        )

    async def delete_file(self, *, user_id: str, path: str) -> WorkspaceDeleteResult:
        scoped_user_id = self._normalize_user_id(user_id)
        file_path = self.normalize_absolute_path(path)
        if file_path == "/":
            raise IsADirectoryError("Path is not a file: /")

        deleted = await self.files_db.delete_file(user_id=scoped_user_id, path=file_path)
        if deleted:
            return WorkspaceDeleteResult(path=file_path, deleted=True, deleted_count=1)

        node = await self.files_db.get_node(user_id=scoped_user_id, path=file_path)
        if node is None:
            raise FileNotFoundError(f"File not found: {file_path}")
        raise IsADirectoryError(f"Path is not a file: {file_path}")

    async def delete_folder(
        self,
        *,
        user_id: str,
        path: str,
        recursive: bool = False,
    ) -> WorkspaceDeleteResult:
        scoped_user_id = self._normalize_user_id(user_id)
        folder_path = self.normalize_absolute_path(path)

        deleted_count = await self.files_db.delete_folder(
            user_id=scoped_user_id,
            path=folder_path,
            recursive=recursive,
        )

        if folder_path != "/" and deleted_count == 0:
            raise FileNotFoundError(f"Folder not found: {folder_path}")

        return WorkspaceDeleteResult(
            path=folder_path,
            deleted=deleted_count > 0,
            deleted_count=deleted_count,
        )

    async def upload_text_files(
        self,
        *,
        user_id: str,
        files: Iterable[WorkspaceUploadItem | dict],
        target_base_path: str | None = None,
    ) -> WorkspaceUploadResult:
        scoped_user_id = self._normalize_user_id(user_id)
        base_path = self.normalize_absolute_path(target_base_path or "/")

        if base_path != "/":
            await self.create_folder(user_id=scoped_user_id, path=base_path, recursive=True)

        uploaded: list[WorkspaceWriteResult] = []
        seen_relative_paths: set[str] = set()

        for raw_item in files:
            item = raw_item if isinstance(raw_item, WorkspaceUploadItem) else WorkspaceUploadItem.model_validate(raw_item)

            relative_path = self.normalize_relative_path(item.relative_path)
            if relative_path in seen_relative_paths:
                raise ValueError(f"Duplicate upload relative path: {relative_path}")
            seen_relative_paths.add(relative_path)

            absolute_path = self.normalize_absolute_path(self._join_absolute_and_relative(base_path, relative_path))
            self._ensure_supported_text_extension(absolute_path)

            text_content, _ = self._ingest_upload_text_content(absolute_path, item.content)
            write_result = await self.write_text_file(
                user_id=scoped_user_id,
                path=absolute_path,
                content=text_content,
                expected_version=item.expected_version,
            )
            uploaded.append(write_result)

        logger.info(
            "Uploaded %d text files for user=%s into base_path=%s",
            len(uploaded),
            scoped_user_id,
            base_path,
        )
        return WorkspaceUploadResult(base_path=base_path, files=uploaded)

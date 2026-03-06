from __future__ import annotations

import logging

from sequence.database.pg_base import PostgresBase
from sequence.models.workspace import (
    WorkspaceFile,
    WorkspaceFolderCreateResult,
    WorkspaceNode,
    WorkspaceNodeType,
    WorkspaceWriteResult,
)

logger = logging.getLogger(__name__)


class FilesDB(PostgresBase):
    """Postgres-backed workspace tree storage scoped by user_id."""

    async def connect(self) -> None:
        await super().connect()
        await self.create_tables()

    async def create_tables(self) -> None:
        create_workspace_nodes_table = """
        CREATE TABLE IF NOT EXISTS workspace_nodes (
            id                  BIGSERIAL   PRIMARY KEY,
            user_id             TEXT        NOT NULL,
            path                TEXT        NOT NULL,
            parent_path         TEXT        NOT NULL,
            name                TEXT        NOT NULL,
            node_type           TEXT        NOT NULL CHECK (node_type IN ('file', 'folder')),
            content_text        TEXT        DEFAULT NULL,
            size_bytes          BIGINT      NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
            version             INTEGER     NOT NULL DEFAULT 1 CHECK (version >= 1),
            created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

            CONSTRAINT workspace_nodes_path_not_root
                CHECK (path <> '/'),
            CONSTRAINT workspace_nodes_path_format
                CHECK (path ~ '^/[^/]+(?:/[^/]+)*$'),
            CONSTRAINT workspace_nodes_parent_path_format
                CHECK (parent_path = '/' OR parent_path ~ '^/[^/]+(?:/[^/]+)*$'),
            CONSTRAINT workspace_nodes_valid_name
                CHECK (
                    name <> '' AND
                    name <> '.' AND
                    name <> '..' AND
                    POSITION('/' IN name) = 0
                ),
            CONSTRAINT workspace_nodes_folder_content_rules
                CHECK (
                    (node_type = 'folder' AND content_text IS NULL AND size_bytes = 0) OR
                    (node_type = 'file' AND content_text IS NOT NULL)
                ),

            UNIQUE (user_id, path),
            UNIQUE (user_id, parent_path, name)
        );
        """

        create_user_parent_index = """
        CREATE INDEX IF NOT EXISTS idx_workspace_nodes_user_parent
            ON workspace_nodes (user_id, parent_path, name);
        """

        create_user_path_index = """
        CREATE INDEX IF NOT EXISTS idx_workspace_nodes_user_path
            ON workspace_nodes (user_id, path);
        """

        await self.execute(create_workspace_nodes_table)
        await self.execute(create_user_parent_index)
        await self.execute(create_user_path_index)

    @staticmethod
    def _node_from_row(row) -> WorkspaceNode:
        return WorkspaceNode(
            path=row["path"],
            parent_path=row["parent_path"],
            name=row["name"],
            node_type=WorkspaceNodeType(row["node_type"]),
            size_bytes=int(row["size_bytes"]),
            version=int(row["version"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _file_from_row(row) -> WorkspaceFile:
        return WorkspaceFile(
            path=row["path"],
            parent_path=row["parent_path"],
            name=row["name"],
            node_type=WorkspaceNodeType(row["node_type"]),
            size_bytes=int(row["size_bytes"]),
            version=int(row["version"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            content=row["content_text"] or "",
        )

    async def get_node(self, *, user_id: str, path: str) -> WorkspaceNode | None:
        query = """
        SELECT path, parent_path, name, node_type, size_bytes, version, created_at, updated_at
        FROM workspace_nodes
        WHERE user_id = $1 AND path = $2;
        """
        row = await self.fetch_row(query, user_id, path)
        return self._node_from_row(row) if row is not None else None

    async def get_file(self, *, user_id: str, path: str) -> WorkspaceFile | None:
        query = """
        SELECT path, parent_path, name, node_type, content_text, size_bytes, version, created_at, updated_at
        FROM workspace_nodes
        WHERE user_id = $1 AND path = $2 AND node_type = 'file';
        """
        row = await self.fetch_row(query, user_id, path)
        return self._file_from_row(row) if row is not None else None

    async def list_directory_children(self, *, user_id: str, directory_path: str) -> list[WorkspaceNode]:
        query = """
        SELECT path, parent_path, name, node_type, size_bytes, version, created_at, updated_at
        FROM workspace_nodes
        WHERE user_id = $1 AND parent_path = $2
        ORDER BY CASE WHEN node_type = 'folder' THEN 0 ELSE 1 END, name ASC;
        """
        rows = await self.fetch(query, user_id, directory_path)
        return [self._node_from_row(row) for row in rows]

    async def list_subtree_nodes(self, *, user_id: str, root_path: str) -> list[WorkspaceNode]:
        if root_path == "/":
            query = """
            SELECT path, parent_path, name, node_type, size_bytes, version, created_at, updated_at
            FROM workspace_nodes
            WHERE user_id = $1
            ORDER BY path ASC;
            """
            rows = await self.fetch(query, user_id)
            return [self._node_from_row(row) for row in rows]

        query = """
        SELECT path, parent_path, name, node_type, size_bytes, version, created_at, updated_at
        FROM workspace_nodes
        WHERE user_id = $1 AND (path = $2 OR path LIKE $3)
        ORDER BY path ASC;
        """
        rows = await self.fetch(query, user_id, root_path, f"{root_path}/%")
        return [self._node_from_row(row) for row in rows]

    async def create_folder(
        self,
        *,
        user_id: str,
        path: str,
        parent_path: str,
        name: str,
    ) -> WorkspaceFolderCreateResult:
        select_existing = """
        SELECT path, parent_path, name, node_type, size_bytes, version, created_at, updated_at
        FROM workspace_nodes
        WHERE user_id = $1 AND path = $2
        FOR UPDATE;
        """

        select_parent = """
        SELECT node_type
        FROM workspace_nodes
        WHERE user_id = $1 AND path = $2;
        """

        insert_folder = """
        INSERT INTO workspace_nodes (
            user_id, path, parent_path, name, node_type, content_text, size_bytes, version, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, 'folder', NULL, 0, 1, NOW(), NOW())
        RETURNING path, parent_path, name, node_type, size_bytes, version, created_at, updated_at;
        """

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                existing = await conn.fetchrow(select_existing, user_id, path)
                if existing is not None:
                    if existing["node_type"] != WorkspaceNodeType.FOLDER.value:
                        raise FileExistsError(f"A file already exists at path: {path}")
                    return WorkspaceFolderCreateResult(
                        path=existing["path"],
                        parent_path=existing["parent_path"],
                        name=existing["name"],
                        size_bytes=int(existing["size_bytes"]),
                        version=int(existing["version"]),
                        created=False,
                        created_at=existing["created_at"],
                        updated_at=existing["updated_at"],
                    )

                if parent_path != "/":
                    parent = await conn.fetchrow(select_parent, user_id, parent_path)
                    if parent is None:
                        raise FileNotFoundError(f"Parent folder not found: {parent_path}")
                    if parent["node_type"] != WorkspaceNodeType.FOLDER.value:
                        raise NotADirectoryError(f"Parent path is not a folder: {parent_path}")

                inserted = await conn.fetchrow(insert_folder, user_id, path, parent_path, name)
                return WorkspaceFolderCreateResult(
                    path=inserted["path"],
                    parent_path=inserted["parent_path"],
                    name=inserted["name"],
                    size_bytes=int(inserted["size_bytes"]),
                    version=int(inserted["version"]),
                    created=True,
                    created_at=inserted["created_at"],
                    updated_at=inserted["updated_at"],
                )

    async def upsert_text_file(
        self,
        *,
        user_id: str,
        path: str,
        parent_path: str,
        name: str,
        content: str,
        size_bytes: int,
        expected_version: int | None = None,
    ) -> WorkspaceWriteResult:
        select_parent = """
        SELECT node_type
        FROM workspace_nodes
        WHERE user_id = $1 AND path = $2;
        """

        select_existing = """
        SELECT node_type, version
        FROM workspace_nodes
        WHERE user_id = $1 AND path = $2
        FOR UPDATE;
        """

        insert_file = """
        INSERT INTO workspace_nodes (
            user_id, path, parent_path, name, node_type, content_text, size_bytes, version, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, 'file', $5, $6, 1, NOW(), NOW())
        RETURNING path, parent_path, name, node_type, size_bytes, version, created_at, updated_at;
        """

        update_file = """
        UPDATE workspace_nodes
        SET content_text = $1,
            size_bytes = $2,
            version = $3,
            updated_at = NOW()
        WHERE user_id = $4 AND path = $5
        RETURNING path, parent_path, name, node_type, size_bytes, version, created_at, updated_at;
        """

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                if parent_path != "/":
                    parent = await conn.fetchrow(select_parent, user_id, parent_path)
                    if parent is None:
                        raise FileNotFoundError(f"Parent folder not found: {parent_path}")
                    if parent["node_type"] != WorkspaceNodeType.FOLDER.value:
                        raise NotADirectoryError(f"Parent path is not a folder: {parent_path}")

                existing = await conn.fetchrow(select_existing, user_id, path)
                if existing is None:
                    if expected_version not in (None, 0):
                        raise ValueError(
                            f"Version conflict for {path}: expected={expected_version} actual=missing"
                        )

                    inserted = await conn.fetchrow(insert_file, user_id, path, parent_path, name, content, size_bytes)
                    return WorkspaceWriteResult(
                        path=inserted["path"],
                        parent_path=inserted["parent_path"],
                        name=inserted["name"],
                        size_bytes=int(inserted["size_bytes"]),
                        version=int(inserted["version"]),
                        created=True,
                        created_at=inserted["created_at"],
                        updated_at=inserted["updated_at"],
                    )

                if existing["node_type"] != WorkspaceNodeType.FILE.value:
                    raise IsADirectoryError(f"Cannot write file to folder path: {path}")

                current_version = int(existing["version"])
                if expected_version is not None and expected_version != current_version:
                    raise ValueError(
                        f"Version conflict for {path}: expected={expected_version} actual={current_version}"
                    )

                next_version = current_version + 1
                updated = await conn.fetchrow(
                    update_file,
                    content,
                    size_bytes,
                    next_version,
                    user_id,
                    path,
                )
                return WorkspaceWriteResult(
                    path=updated["path"],
                    parent_path=updated["parent_path"],
                    name=updated["name"],
                    size_bytes=int(updated["size_bytes"]),
                    version=int(updated["version"]),
                    created=False,
                    created_at=updated["created_at"],
                    updated_at=updated["updated_at"],
                )

    async def delete_file(self, *, user_id: str, path: str) -> bool:
        query = """
        DELETE FROM workspace_nodes
        WHERE user_id = $1 AND path = $2 AND node_type = 'file'
        RETURNING path;
        """
        row = await self.fetch_row(query, user_id, path)
        return row is not None

    async def delete_folder(self, *, user_id: str, path: str, recursive: bool) -> int:
        if path == "/":
            if not recursive:
                count_query = "SELECT COUNT(*)::BIGINT FROM workspace_nodes WHERE user_id = $1;"
                total = int(await self.fetch_val(count_query, user_id) or 0)
                if total > 0:
                    raise OSError("Folder is not empty: /")
                return 0

            delete_all = """
            DELETE FROM workspace_nodes
            WHERE user_id = $1
            RETURNING path;
            """
            rows = await self.fetch(delete_all, user_id)
            return len(rows)

        select_folder = """
        SELECT node_type
        FROM workspace_nodes
        WHERE user_id = $1 AND path = $2
        FOR UPDATE;
        """

        count_children = """
        SELECT COUNT(*)::BIGINT
        FROM workspace_nodes
        WHERE user_id = $1 AND parent_path = $2;
        """

        delete_recursive = """
        DELETE FROM workspace_nodes
        WHERE user_id = $1 AND (path = $2 OR path LIKE $3)
        RETURNING path;
        """

        delete_single = """
        DELETE FROM workspace_nodes
        WHERE user_id = $1 AND path = $2 AND node_type = 'folder'
        RETURNING path;
        """

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                folder = await conn.fetchrow(select_folder, user_id, path)
                if folder is None:
                    return 0
                if folder["node_type"] != WorkspaceNodeType.FOLDER.value:
                    raise NotADirectoryError(f"Path is not a folder: {path}")

                if recursive:
                    deleted_rows = await conn.fetch(delete_recursive, user_id, path, f"{path}/%")
                    return len(deleted_rows)

                child_count = int(await conn.fetchval(count_children, user_id, path) or 0)
                if child_count > 0:
                    raise OSError(f"Folder is not empty: {path}")

                deleted = await conn.fetchrow(delete_single, user_id, path)
                return 1 if deleted is not None else 0

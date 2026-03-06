import {
  requestJson as requestHttpJson,
  type HttpErrorContext,
} from "@shared/api/httpClient";
import {
  WorkspaceApiError,
  type WorkspaceDeleteResult,
  type WorkspaceFile,
  type WorkspaceFolderCreateResult,
  type WorkspaceTreeSnapshot,
  type WorkspaceUploadResult,
  type WorkspaceWriteResult,
} from "../types/workspace";

export type WriteWorkspaceFilePayload = {
  path: string;
  content: string;
  expected_version?: number;
  overwrite?: boolean;
};

export type CreateWorkspaceFolderPayload = {
  path: string;
  recursive?: boolean;
};

export type UploadWorkspaceFilesPayload = {
  files: File[];
  paths?: string[];
  base_path?: string;
};

function maybeExtractPath(message: string): string | undefined {
  const match = message.match(/\/(?:[^\s'"`]|\\ )+/);
  return match ? match[0].replace(/\\ /g, " ") : undefined;
}

function parseError(response: HttpErrorContext): WorkspaceApiError {
  let message = response.detail ?? `Request failed (${response.status})`;
  if (!message.trim() && response.bodyText.trim()) {
    message = response.bodyText.trim();
  }

  return new WorkspaceApiError({
    status: response.status,
    message,
    path: maybeExtractPath(message),
  });
}

async function requestJson<T>(
  path: string,
  authToken: string,
  init?: RequestInit,
  options?: { multipart?: boolean },
): Promise<T> {
  return requestHttpJson<T, WorkspaceApiError>({
    path,
    authToken,
    init,
    multipart: options?.multipart,
    fallbackErrorMessage: "Request failed",
    createError: parseError,
  });
}

export async function getTree(authToken: string): Promise<WorkspaceTreeSnapshot> {
  return requestJson<WorkspaceTreeSnapshot>("/api/workspace/tree", authToken);
}

export async function getFile(path: string, authToken: string): Promise<WorkspaceFile> {
  const query = new URLSearchParams({ path });
  return requestJson<WorkspaceFile>(`/api/workspace/file?${query.toString()}`, authToken);
}

export async function writeFile(payload: WriteWorkspaceFilePayload, authToken: string): Promise<WorkspaceWriteResult> {
  return requestJson<WorkspaceWriteResult>("/api/workspace/file", authToken, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function createFolder(
  payload: CreateWorkspaceFolderPayload,
  authToken: string,
): Promise<WorkspaceFolderCreateResult> {
  return requestJson<WorkspaceFolderCreateResult>("/api/workspace/folder", authToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function deleteFile(path: string, authToken: string): Promise<WorkspaceDeleteResult> {
  const query = new URLSearchParams({ path });
  return requestJson<WorkspaceDeleteResult>(`/api/workspace/file?${query.toString()}`, authToken, {
    method: "DELETE",
  });
}

export async function deleteFolder(path: string, recursive: boolean, authToken: string): Promise<WorkspaceDeleteResult> {
  const query = new URLSearchParams({ path, recursive: recursive ? "true" : "false" });
  return requestJson<WorkspaceDeleteResult>(`/api/workspace/folder?${query.toString()}`, authToken, {
    method: "DELETE",
  });
}

export async function uploadFiles(
  payload: UploadWorkspaceFilesPayload,
  authToken: string,
): Promise<WorkspaceUploadResult> {
  const formData = new FormData();
  payload.files.forEach((file) => {
    formData.append("files", file, file.name);
  });

  if (payload.paths) {
    payload.paths.forEach((relativePath) => {
      formData.append("paths", relativePath);
    });
  }

  if (payload.base_path) {
    formData.append("base_path", payload.base_path);
  }

  return requestJson<WorkspaceUploadResult>("/api/workspace/upload", authToken, {
    method: "POST",
    body: formData,
  }, { multipart: true });
}

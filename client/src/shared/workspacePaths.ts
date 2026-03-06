function splitWorkspaceSegments(path: string): string[] {
  return path.split("/").filter((segment) => segment.length > 0);
}

export function normalizeAbsoluteWorkspacePath(path: string): string {
  const replaced = path.replace(/\\/g, "/").trim();
  if (!replaced.startsWith("/")) {
    throw new Error("Path must be absolute (start with '/')");
  }

  const segments = splitWorkspaceSegments(replaced);
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Path cannot contain '.' or '..'");
  }

  return segments.length > 0 ? `/${segments.join("/")}` : "/";
}

export function toAbsoluteWorkspacePath(input: string, baseFolderPath: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }

  const normalized = trimmed.replace(/\\/g, "/");
  if (normalized.startsWith("/")) {
    return normalizeAbsoluteWorkspacePath(normalized);
  }

  const joined = baseFolderPath === "/" ? `/${normalized}` : `${baseFolderPath}/${normalized}`;
  return normalizeAbsoluteWorkspacePath(joined);
}

export function normalizeWorkspacePathForTool(
  rawPath: string,
  defaultParent?: string,
): string | null {
  const trimmed = rawPath.trim();
  if (!trimmed) {
    return null;
  }

  const normalized = trimmed.replace(/\\/g, "/");
  if (normalized.startsWith("/")) {
    try {
      return normalizeAbsoluteWorkspacePath(normalized);
    } catch {
      return null;
    }
  }

  const relativePath = normalized.replace(/^\/+/, "");
  const normalizedParent = defaultParent
    ? normalizeAbsoluteWorkspacePath(defaultParent)
    : "/";
  const parentWithoutLeadingSlash = normalizedParent === "/"
    ? ""
    : normalizedParent.slice(1);

  const mergedRelativePath =
    parentWithoutLeadingSlash && relativePath.startsWith(`${parentWithoutLeadingSlash}/`)
      ? relativePath
      : parentWithoutLeadingSlash
        ? `${parentWithoutLeadingSlash}/${relativePath}`
        : relativePath;

  try {
    return normalizeAbsoluteWorkspacePath(`/${mergedRelativePath}`);
  } catch {
    return null;
  }
}

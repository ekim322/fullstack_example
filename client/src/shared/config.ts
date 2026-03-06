function readApiBaseUrl(): string {
  const rawValue = import.meta.env.VITE_API_BASE_URL;

  if (typeof rawValue !== "string" || rawValue.trim().length === 0) {
    throw new Error(
      "Missing VITE_API_BASE_URL. Set it in your frontend environment (e.g. .env.local)."
    );
  }

  const trimmed = rawValue.trim();
  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(
      `Invalid VITE_API_BASE_URL "${rawValue}". Expected an absolute URL like "http://localhost:8000".`
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Invalid VITE_API_BASE_URL "${rawValue}". URL must use http:// or https://.`
    );
  }

  if (parsed.search || parsed.hash) {
    throw new Error(
      `Invalid VITE_API_BASE_URL "${rawValue}". URL must not include query params or hash fragments.`
    );
  }

  const normalizedPathname = parsed.pathname.replace(/\/+$/, "");
  const basePath = normalizedPathname === "/" ? "" : normalizedPathname;
  return `${parsed.origin}${basePath}`;
}

export const API_BASE_URL = readApiBaseUrl();
export const CHAT_STORAGE_KEY_PREFIX = "sequence.chat.ui.v2";
export const AUTH_STORAGE_KEY = "sequence.auth.ui.v1";

export function chatStorageKeyForUser(userId: string): string {
  return `${CHAT_STORAGE_KEY_PREFIX}:${encodeURIComponent(userId)}`;
}

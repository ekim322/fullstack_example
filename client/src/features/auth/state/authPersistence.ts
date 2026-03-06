import { AUTH_STORAGE_KEY } from "../../../shared/config";
import type { AuthSession } from "../types";

function isValidAuthSession(value: unknown): value is AuthSession {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<AuthSession>;
  return (
    typeof candidate.userId === "string" &&
    candidate.userId.trim().length > 0 &&
    typeof candidate.token === "string" &&
    candidate.token.length > 0 &&
    Number.isFinite(candidate.expiresAt)
  );
}

function clearStoredAuthSession(): void {
  try {
    sessionStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }

  try {
    // Drop legacy token persistence if present.
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Ignore local storage failures.
  }
}

function readAuthSessionFromSessionStorage(): string | null {
  try {
    return sessionStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readAuthSessionFromLocalStorage(): string | null {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function loadAuthSession(): AuthSession | null {
  const rawFromSession = readAuthSessionFromSessionStorage();
  const rawFromLocal = rawFromSession ? null : readAuthSessionFromLocalStorage();
  const raw = rawFromSession ?? rawFromLocal;

  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidAuthSession(parsed)) {
      clearStoredAuthSession();
      return null;
    }

    if (parsed.expiresAt <= Date.now() / 1000) {
      clearStoredAuthSession();
      return null;
    }

    // Migrate any legacy localStorage session into session storage.
    saveAuthSession(parsed);

    return parsed;
  } catch {
    clearStoredAuthSession();
    return null;
  }
}

export function saveAuthSession(session: AuthSession): void {
  try {
    sessionStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Ignore local storage write failures to avoid breaking chat UX.
  }

  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // Ignore local storage failures.
  }
}

export function clearAuthSession(): void {
  clearStoredAuthSession();
}

import {
  requestJson as requestHttpJson,
  type HttpErrorContext,
} from "@shared/api/httpClient";
import type { LoginResponse } from "../types";
import { isSessionExpired } from "../utils/sessionExpiry";

type LoginRequest = {
  user_id: string;
  password: string;
};

function isLoginResponse(value: unknown): value is LoginResponse {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<LoginResponse>;
  return (
    typeof candidate.user_id === "string" &&
    candidate.user_id.trim().length > 0 &&
    typeof candidate.token === "string" &&
    candidate.token.length > 0 &&
    Number.isFinite(candidate.expires_at)
  );
}

function toLoginErrorMessage(status: number, detail: string | null): string {
  if (status === 401 || status === 403) {
    return "Invalid user ID or password.";
  }

  if (detail) {
    return detail;
  }

  if (status >= 500) {
    return "Login is temporarily unavailable. Please try again.";
  }

  return `Login failed (${status}).`;
}

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const parsedResponse = await requestHttpJson<unknown>({
    path: "/api/auth/login",
    init: {
      method: "POST",
      body: JSON.stringify(payload),
    },
    fallbackErrorMessage: "Login failed",
    createError: (context: HttpErrorContext) =>
      new Error(toLoginErrorMessage(context.status, context.detail)),
  });

  if (!isLoginResponse(parsedResponse)) {
    throw new Error("Login failed: response did not match expected format.");
  }

  if (isSessionExpired(parsedResponse.expires_at)) {
    throw new Error("Login failed: server returned an already expired session.");
  }

  return parsedResponse;
}

import { API_BASE_URL } from "../config";
import { notifyInvalidSession } from "../sessionInvalidation";

export type HttpErrorContext = {
  response: Response;
  status: number;
  bodyText: string;
  bodyJson: unknown;
  detail: string | null;
  fallbackMessage: string;
};

type RequestJsonOptions<TError extends Error = Error> = {
  path: string;
  authToken?: string;
  init?: RequestInit;
  multipart?: boolean;
  fallbackErrorMessage?: string;
  createError?: (context: HttpErrorContext) => TError;
};

export class HttpRequestError extends Error {
  readonly status: number;
  readonly response: Response;
  readonly bodyText: string;
  readonly bodyJson: unknown;
  readonly detail: string | null;

  constructor(context: HttpErrorContext) {
    super(context.detail ?? context.fallbackMessage);
    this.name = "HttpRequestError";
    this.status = context.status;
    this.response = context.response;
    this.bodyText = context.bodyText;
    this.bodyJson = context.bodyJson;
    this.detail = context.detail;
  }
}

type ParsedBody = {
  json: unknown | null;
  isJson: boolean;
  isEmpty: boolean;
};

function parseJson(text: string): ParsedBody {
  const trimmedText = text.trim();
  if (!trimmedText) {
    return { json: null, isJson: false, isEmpty: true };
  }

  try {
    return { json: JSON.parse(trimmedText), isJson: true, isEmpty: false };
  } catch {
    return { json: null, isJson: false, isEmpty: false };
  }
}

function extractDetailMessage(bodyText: string, bodyJson: unknown): string | null {
  if (bodyJson && typeof bodyJson === "object") {
    const parsed = bodyJson as { detail?: unknown; message?: unknown };
    if (typeof parsed.detail === "string" && parsed.detail.trim()) {
      return parsed.detail.trim();
    }
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return parsed.message.trim();
    }
  }

  return bodyText.trim() ? bodyText : null;
}

function buildRequestHeaders(
  headersInput: HeadersInit | undefined,
  authToken: string | undefined,
  body: BodyInit | null | undefined,
  multipart: boolean,
): Headers {
  const headers = new Headers(headersInput);

  if (authToken) {
    headers.set("Authorization", `Bearer ${authToken}`);
  }

  if (!multipart && body != null && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

export function isInvalidSessionStatus(status: number): boolean {
  return status === 401 || status === 403;
}

export function isInvalidSessionError(error: unknown): boolean {
  if (error instanceof HttpRequestError) {
    return isInvalidSessionStatus(error.status);
  }

  if (typeof error === "object" && error !== null && "status" in error) {
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" && isInvalidSessionStatus(status);
  }

  return false;
}

export async function requestJson<T, TError extends Error = Error>({
  path,
  authToken,
  init,
  multipart = false,
  fallbackErrorMessage = "Request failed",
  createError,
}: RequestJsonOptions<TError>): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: buildRequestHeaders(init?.headers, authToken, init?.body, multipart),
  });

  const bodyText = await response.text().catch(() => "");
  const parsedBody = parseJson(bodyText);
  const bodyJson = parsedBody.isJson ? parsedBody.json : null;
  const detail = extractDetailMessage(bodyText, bodyJson);

  if (!response.ok) {
    const context: HttpErrorContext = {
      response,
      status: response.status,
      bodyText,
      bodyJson,
      detail,
      fallbackMessage: `${fallbackErrorMessage} (${response.status})`,
    };

    if (isInvalidSessionStatus(context.status)) {
      notifyInvalidSession("http");
    }

    if (createError) {
      throw createError(context);
    }

    throw new HttpRequestError(context);
  }

  if (!parsedBody.isJson) {
    const reason = parsedBody.isEmpty ? "empty response body" : "non-JSON response body";
    throw new Error(`Expected JSON response for ${path}, received ${reason}`);
  }

  return parsedBody.json as T;
}

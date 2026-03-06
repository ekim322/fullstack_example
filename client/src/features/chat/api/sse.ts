import { API_BASE_URL } from "../../../shared/config";
import { notifyInvalidSession } from "../../../shared/sessionInvalidation";
import type { StreamEvent } from "../types";

export type StreamHandlers = {
  onEvent: (entryId: string, event: StreamEvent) => void;
  onError: () => void;
};

type PendingSseEvent = {
  id: string;
  eventName: string;
  data: string[];
};

function createPendingEvent(): PendingSseEvent {
  return {
    id: "0-0",
    eventName: "message",
    data: [],
  };
}

function applySseField(fieldName: string, value: string, pending: PendingSseEvent): void {
  if (fieldName === "id") {
    pending.id = value;
    return;
  }

  if (fieldName === "event") {
    pending.eventName = value;
    return;
  }

  if (fieldName === "data") {
    pending.data.push(value);
  }
}

function dispatchPendingEvent(pending: PendingSseEvent, handlers: StreamHandlers): boolean {
  if (pending.data.length === 0) {
    return true;
  }

  const payload = pending.data.join("\n");

  try {
    const parsed = JSON.parse(payload) as StreamEvent;
    handlers.onEvent(pending.id || "0-0", parsed);
    return true;
  } catch {
    handlers.onError();
    return false;
  }
}

export function openSessionEventStream(
  sessionId: string,
  lastId: string,
  authToken: string,
  handlers: StreamHandlers,
): () => void {
  const streamUrl =
    `${API_BASE_URL}/api/chat/${encodeURIComponent(sessionId)}/events` +
    `?last_id=${encodeURIComponent(lastId)}`;

  const abortController = new AbortController();
  let closed = false;

  void (async () => {
    try {
      const response = await fetch(streamUrl, {
        method: "GET",
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${authToken}`,
        },
        signal: abortController.signal,
      });

      if (!response.ok || !response.body) {
        if (!closed && (response.status === 401 || response.status === 403)) {
          notifyInvalidSession("stream");
        }

        if (!closed) {
          handlers.onError();
        }
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let pending = createPendingEvent();

      while (!closed) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let lineBreakIndex = buffer.indexOf("\n");
        while (lineBreakIndex !== -1) {
          const rawLine = buffer.slice(0, lineBreakIndex);
          buffer = buffer.slice(lineBreakIndex + 1);

          const line = rawLine.endsWith("\r")
            ? rawLine.slice(0, -1)
            : rawLine;

          if (!line) {
            const didDispatch = dispatchPendingEvent(pending, handlers);
            pending = createPendingEvent();

            if (!didDispatch || closed) {
              return;
            }

            lineBreakIndex = buffer.indexOf("\n");
            continue;
          }

          if (line.startsWith(":")) {
            lineBreakIndex = buffer.indexOf("\n");
            continue;
          }

          const separatorIndex = line.indexOf(":");
          const fieldName = separatorIndex === -1
            ? line
            : line.slice(0, separatorIndex);
          const rawValue = separatorIndex === -1
            ? ""
            : line.slice(separatorIndex + 1);
          const valueText = rawValue.startsWith(" ")
            ? rawValue.slice(1)
            : rawValue;

          applySseField(fieldName, valueText, pending);
          lineBreakIndex = buffer.indexOf("\n");
        }
      }

      buffer += decoder.decode();
      if (buffer.length > 0) {
        const trailingLines = buffer.split(/\r?\n/);
        trailingLines.forEach((line) => {
          if (!line) {
            const didDispatch = dispatchPendingEvent(pending, handlers);
            pending = createPendingEvent();
            if (!didDispatch) {
              closed = true;
            }
            return;
          }

          if (line.startsWith(":")) {
            return;
          }

          const separatorIndex = line.indexOf(":");
          const fieldName = separatorIndex === -1
            ? line
            : line.slice(0, separatorIndex);
          const rawValue = separatorIndex === -1
            ? ""
            : line.slice(separatorIndex + 1);
          const valueText = rawValue.startsWith(" ")
            ? rawValue.slice(1)
            : rawValue;

          applySseField(fieldName, valueText, pending);
        });
      }

      if (!closed && pending.data.length > 0) {
        const didDispatch = dispatchPendingEvent(pending, handlers);
        pending = createPendingEvent();
        if (!didDispatch || closed) {
          return;
        }
      }

      if (!closed) {
        handlers.onError();
      }
    } catch (error) {
      if (closed) {
        return;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      handlers.onError();
    }
  })();

  return () => {
    if (closed) {
      return;
    }

    closed = true;
    abortController.abort();
  };
}

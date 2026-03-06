export type InvalidSessionSource = "http" | "stream";

type InvalidSessionListener = (source: InvalidSessionSource) => void;

const listeners = new Set<InvalidSessionListener>();

export function notifyInvalidSession(source: InvalidSessionSource): void {
  listeners.forEach((listener) => {
    listener(source);
  });
}

export function subscribeToInvalidSession(listener: InvalidSessionListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

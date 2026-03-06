export function isSessionExpired(expiresAtEpochSeconds: number, nowMs: number = Date.now()): boolean {
  return expiresAtEpochSeconds <= nowMs / 1000;
}

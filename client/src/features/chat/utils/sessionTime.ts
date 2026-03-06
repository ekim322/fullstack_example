const SESSION_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatSessionTime(updatedAt: number): string {
  if (!Number.isFinite(updatedAt)) {
    return "Unknown";
  }

  return SESSION_TIME_FORMATTER.format(new Date(updatedAt));
}

export function toDateTimeAttribute(updatedAt: number): string | undefined {
  if (!Number.isFinite(updatedAt)) {
    return undefined;
  }

  return new Date(updatedAt).toISOString();
}

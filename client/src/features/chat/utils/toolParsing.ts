export function parseJsonObject(content: string): Record<string, unknown> | null {
  if (!content.trim()) {
    return null;
  }

  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Keep raw content when arguments are not valid JSON.
  }

  return null;
}

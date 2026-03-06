function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function parseTextBlocks(value: unknown): string {
  if (!Array.isArray(value)) {
    return "";
  }

  return value
    .map((block) => {
      const rec = asRecord(block);
      if (!rec) {
        return "";
      }
      return asString(rec.text) ?? "";
    })
    .join("\n")
    .trim();
}

export function parseAssistantText(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  return parseTextBlocks(content);
}

export function parseReasoningSummary(summary: unknown): string {
  return parseTextBlocks(summary);
}


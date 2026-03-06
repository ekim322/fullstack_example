export function getSessionLabel(label: string | null | undefined): string {
  const trimmed = typeof label === "string" ? label.trim() : "";
  return trimmed.length > 0 ? trimmed : "Untitled session";
}

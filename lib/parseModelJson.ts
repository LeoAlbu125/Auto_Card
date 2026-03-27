/**
 * Normalizes assistant output into a string suitable for JSON.parse.
 * Handles markdown fences and raw `{ ... }` embedded in prose.
 */
export function extractJsonCandidate(text: string): string {
  const t = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)```/im.exec(t);
  if (fenced?.[1]) return fenced[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) return t.slice(start, end + 1);
  return t;
}

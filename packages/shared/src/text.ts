const URL_RE = /https?:\/\/[^\s<>"'`]+/i;

/** Pull the first http(s) URL out of shared or typed text. */
export function extractUrl(text: string): string | null {
  const match = text.match(URL_RE);
  if (!match) return null;
  // Trailing punctuation is usually sentence punctuation, not part of the URL.
  return match[0].replace(/[),.;:!?\]]+$/, "");
}

export function hostnameOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split text into matching and non-matching runs for search highlighting.
 * Used by the web dashboard and the mobile list so both highlight the same way.
 */
export function splitMatches(text: string, query: string): { text: string; match: boolean }[] {
  const q = query.trim();
  if (!q) return [{ text, match: false }];
  return text
    .split(new RegExp(`(${escapeRegex(q)})`, "gi"))
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, match: part.toLowerCase() === q.toLowerCase() }));
}

/** What to show as an item's heading when the AI hasn't titled it yet. */
export function displayTitle(item: { title: string | null; content: string; url: string | null }): string {
  if (item.title) return item.title;
  const firstLine = item.content.split("\n")[0]?.trim() ?? "";
  if (item.url && firstLine === item.url) return hostnameOf(item.url) ?? item.url;
  return firstLine.length > 90 ? `${firstLine.slice(0, 87)}…` : firstLine;
}

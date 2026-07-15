/**
 * Derives a compact, human-readable label from a local path or remote URL.
 * URL credentials, query parameters, and fragments are intentionally omitted.
 */
export function mcapSourceDisplayName(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const source = value.trim();
  if (!source) return null;

  if (/^https?:\/\//i.test(source)) {
    try {
      const url = new URL(source);
      const fileName = lastPathSegment(url.pathname);
      return fileName ? safelyDecode(fileName) : url.hostname || null;
    } catch {
      // Fall through to path parsing for malformed URLs. The source may still
      // contain a useful filename before its query string.
    }
  }

  const path = source.split(/[?#]/, 1)[0];
  return lastPathSegment(path);
}

function lastPathSegment(path: string): string | null {
  return path.split(/[/\\]/).filter(Boolean).pop() || null;
}

function safelyDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

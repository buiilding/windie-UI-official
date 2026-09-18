/** Browser-path helpers for addressable hosted conversations. */

const conversationPathPattern = /^\/c\/([^/]+)\/?$/;

/** Returns the server-issued conversation ID addressed by a Windie browser URL. */
export function conversationIdFromPath(pathname: string): string | null {
  const match = conversationPathPattern.exec(pathname);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/** Returns the canonical browser path for one server-owned conversation ID. */
export function conversationPath(conversationId: string): string {
  return `/c/${encodeURIComponent(conversationId)}`;
}

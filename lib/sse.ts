/** Durable SSE parsing for authenticated hosted Windie browser streams. */

export type SseRecord = {
  id: number | null;
  event: string;
  data: unknown;
};

/** Parses one complete SSE block, including its durable event cursor. */
export function parseSseRecord(block: string): SseRecord | null {
  const fields = new Map<string, string[]>();
  for (const line of block.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator <= 0) continue;
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1).replace(/^ /, '');
    fields.set(key, [...(fields.get(key) ?? []), value]);
  }
  const data = fields.get('data')?.join('\n');
  if (!data) return null;
  try {
    return {
      id: Number(fields.get('id')?.at(-1)) || null,
      event: fields.get('event')?.at(-1) ?? 'message',
      data: JSON.parse(data),
    };
  } catch {
    return null;
  }
}

/** Reads one HTTP SSE response until it closes or its caller aborts it. */
export async function readSse(
  url: string,
  accessToken: string,
  signal: AbortSignal,
  onRecord: (record: SseRecord) => void | Promise<void>,
): Promise<void> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`Windie event stream failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? '';
      for (const block of blocks) {
        if (signal.aborted) return;
        const record = parseSseRecord(block);
        // Saved-message reconciliation must finish before a following terminal
        // event or delta is applied, even if they arrive in one network chunk.
        if (record) await onRecord(record);
      }
      if (done) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSseRecord, readSse } from './sse';

afterEach(() => vi.unstubAllGlobals());

describe('durable SSE parsing', () => {
  it('keeps the cursor and typed event payload', () => {
    expect(
      parseSseRecord(
        'id: 42\nevent: session\ndata: {"type":"assistant_delta","text":"Hello"}',
      ),
    ).toEqual({
      id: 42,
      event: 'session',
      data: { type: 'assistant_delta', text: 'Hello' },
    });
  });

  it('rejects malformed payloads instead of manufacturing an event', () => {
    expect(parseSseRecord('id: 42\ndata: not-json')).toBeNull();
  });

  it('awaits saved-message hydration before completion even within the same chunk', async () => {
    const text =
      'id: 1\ndata: {"type":"assistant_message_saved"}\n\nid: 2\ndata: {"type":"completed"}\n\n';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(text)),
    );
    let finishSave!: () => void;
    const save = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const received: number[] = [];
    const reading = readSse(
      '/events',
      'token',
      new AbortController().signal,
      async (record) => {
        received.push(record.id!);
        if (record.id === 1) await save;
      },
    );
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(received).toEqual([1]);
    finishSave();
    await reading;
    expect(received).toEqual([1, 2]);
  });

  it('parses fragmented CRLF and UTF-8 bytes without dropping a delta', async () => {
    const bytes = new TextEncoder().encode(
      'id: 3\r\nevent: assistant_delta\r\ndata: {"text":"héllo"}\r\n\r\n',
    );
    const body = new ReadableStream({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body)),
    );
    const received: unknown[] = [];
    await readSse(
      '/events',
      'token',
      new AbortController().signal,
      (record) => {
        received.push(record.data);
      },
    );
    expect(received).toEqual([{ text: 'héllo' }]);
  });

  it('stops processing buffered events after navigation aborts the subscription', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('id: 1\ndata: {}\n\nid: 2\ndata: {}\n\n')),
    );
    const controller = new AbortController();
    const received: number[] = [];
    await readSse('/events', 'token', controller.signal, (record) => {
      received.push(record.id!);
      controller.abort();
    });
    expect(received).toEqual([1]);
  });

  it('propagates projection failure without acknowledging or delivering later records', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('id: 1\ndata: {}\n\nid: 2\ndata: {}\n\n')),
    );
    const received: number[] = [];
    await expect(
      readSse('/events', 'token', new AbortController().signal, (record) => {
        received.push(record.id!);
        throw new Error('snapshot unavailable');
      }),
    ).rejects.toThrow('snapshot unavailable');
    expect(received).toEqual([1]);
  });
});

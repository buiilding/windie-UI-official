import { afterEach, expect, it, vi } from 'vitest';
import { beginDevicePolling } from './device-polling';
import { HostedApiError } from './hosted-api';
import { deviceRoute } from './device-route';

afterEach(() => vi.useRealTimers());
it('allows only exact local device return routes, preserving chat routing', () => {
  expect(deviceRoute('/computers')).toBe('/computers');
  expect(deviceRoute('/devices/connect')).toBe('/devices/connect');
  for (const path of [
    '/',
    '/c/123',
    '//evil.test',
    'https://evil.test',
    '/devices/connect?next=https://evil.test',
    '/computers/../',
  ]) {
    expect(deviceRoute(path)).toBeNull();
  }
});
it('stops after one expired-token response, including focus refresh', async () => {
  vi.useFakeTimers();
  const load = vi.fn().mockRejectedValue(new HostedApiError('Expired', 401));
  const failed = vi.fn();
  const poller = beginDevicePolling(load, vi.fn(), failed, () => true);
  await vi.advanceTimersByTimeAsync(120_000);
  poller.refresh();
  await Promise.resolve();
  expect(load).toHaveBeenCalledTimes(1);
  expect(failed).toHaveBeenCalledTimes(1);
  poller.dispose();
});
it('honors rate limiting and polls only while visible', async () => {
  vi.useFakeTimers();
  let visible = true;
  const load = vi
    .fn()
    .mockRejectedValueOnce(new HostedApiError('Wait', 429))
    .mockResolvedValue([]);
  const poller = beginDevicePolling(load, vi.fn(), vi.fn(), () => visible);
  await vi.advanceTimersByTimeAsync(59_999);
  expect(load).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(load).toHaveBeenCalledTimes(2);
  visible = false;
  poller.refresh();
  await vi.advanceTimersByTimeAsync(90_000);
  expect(load).toHaveBeenCalledTimes(2);
  visible = true;
  poller.refresh();
  await Promise.resolve();
  expect(load).toHaveBeenCalledTimes(3);
  poller.dispose();
});
it('does not overlap requests and discards results after unmount', async () => {
  vi.useFakeTimers();
  let resolve!: (rows: []) => void;
  const receive = vi.fn();
  const load = vi.fn(
    () =>
      new Promise<[]>((done) => {
        resolve = done;
      }),
  );
  const poller = beginDevicePolling(load, receive, vi.fn(), () => true);
  poller.refresh();
  poller.refresh();
  expect(load).toHaveBeenCalledTimes(1);
  poller.dispose();
  resolve([]);
  await Promise.resolve();
  expect(receive).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(90_000);
  expect(load).toHaveBeenCalledTimes(1);
});

/** Sequential visibility-aware presence polling; a 401 permanently stops this instance. */
import { HostedApiError } from './hosted-api';
import type { Device } from './device-api';

export function beginDevicePolling(
  load: (signal: AbortSignal) => Promise<Device[]>,
  receive: (devices: Device[]) => void,
  failed: (error: unknown) => void,
  visible: () => boolean,
) {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let active: AbortController | null = null;
  let failures = 0;
  const poll = async () => {
    if (stopped || !visible() || active) return;
    const controller = new AbortController();
    active = controller;
    let delay = 20_000;
    try {
      const rows = await load(controller.signal);
      if (!stopped && !controller.signal.aborted) receive(rows);
      failures = 0;
    } catch (error) {
      if (!stopped && !controller.signal.aborted) {
        if (error instanceof HostedApiError && error.status === 401)
          stopped = true;
        failed(error);
        delay =
          error instanceof HostedApiError && error.status === 429
            ? 60_000
            : Math.min(30_000, 1000 * 2 ** Math.min(++failures, 5));
      }
    } finally {
      active = null;
      if (!stopped && visible()) timer = setTimeout(poll, delay);
    }
  };
  const refresh = () => {
    clearTimeout(timer);
    if (!visible()) active?.abort();
    else void poll();
  };
  refresh();
  return {
    refresh,
    dispose() {
      stopped = true;
      clearTimeout(timer);
      active?.abort();
    },
  };
}

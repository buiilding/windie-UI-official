/** Presence-only device contracts; no tool or installation authority. */
import { request } from './hosted-api';

export type DeviceMetadata = {
  name: string;
  os: string;
  architecture: string;
  agent_version: string;
  protocol_version: number;
};
export type Device = {
  id: string;
  metadata: DeviceMetadata;
  revoked: boolean;
  online: boolean;
  last_seen: number | null;
};
export type Enrollment = {
  id: string;
  metadata: DeviceMetadata;
  state:
    | 'pending'
    | 'approved'
    | 'consumed'
    | 'denied'
    | 'cancelled'
    | 'expired';
  expires_at: number;
  account_label: string | null;
};

/** Every device request is bounded and cancellable. Codes stay in JSON, never URLs. */
function call<T>(token: string, path: string, options: RequestInit = {}) {
  return request<T>(token, path, {
    ...options,
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(10_000)])
      : AbortSignal.timeout(10_000),
  });
}
export const listDevices = (token: string, signal?: AbortSignal) =>
  call<Device[]>(token, '/v1/devices', { signal });
export const revokeDevice = (token: string, id: string) =>
  call<void>(token, `/v1/devices/${encodeURIComponent(id)}/revoke`, {
    method: 'POST',
  });
export function enrollmentAction(
  token: string,
  code: string,
  action: 'lookup' | 'approve' | 'deny',
) {
  return call<Enrollment>(token, `/v1/device-enrollments/${action}`, {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
}

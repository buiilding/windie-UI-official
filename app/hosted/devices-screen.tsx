/** Explicit browser consent and owned computer presence. Never grants tool permissions. */
/* oxlint-disable next/no-html-link-for-pages -- Vite app, not Next.js. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { HostedApiError } from '@/lib/hosted-api';
import {
  enrollmentAction,
  listDevices,
  revokeDevice,
  type Device,
  type Enrollment,
} from '@/lib/device-api';
import './devices.css';
import { beginDevicePolling } from '@/lib/device-polling';

export function DevicesScreen({
  token,
  accountId,
  email,
  pairing,
  onSignOut,
}: {
  token: string;
  accountId: string;
  email: string | null;
  pairing: boolean;
  onSignOut: () => void;
}) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<Enrollment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const stopped = useRef(false);
  const actionPending = useRef(false);
  const signOut = useRef(onSignOut);
  useEffect(() => {
    signOut.current = onSignOut;
  }, [onSignOut]);
  const fail = useCallback((failure: unknown) => {
    if (failure instanceof HostedApiError && failure.status === 401) {
      stopped.current = true;
      signOut.current();
    } else {
      setError(
        failure instanceof Error ? failure.message : 'Unable to reach Windie.',
      );
    }
  }, []);

  useEffect(() => {
    if (pairing) return;
    stopped.current = false;
    const polling = beginDevicePolling(
      (signal) => listDevices(token, signal),
      (rows) => {
        setDevices(rows);
        setLoaded(true);
        setError(null);
      },
      fail,
      () => !document.hidden,
    );
    document.addEventListener('visibilitychange', polling.refresh);
    window.addEventListener('focus', polling.refresh);
    return () => {
      polling.dispose();
      document.removeEventListener('visibilitychange', polling.refresh);
      window.removeEventListener('focus', polling.refresh);
    };
  }, [token, pairing, fail]);

  async function act(action: () => Promise<void>) {
    if (actionPending.current || stopped.current) return;
    actionPending.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      fail(failure);
    } finally {
      actionPending.current = false;
      setBusy(false);
    }
  }
  const terminal = preview && !['pending', 'approved'].includes(preview.state);
  return (
    <main className="devices-screen">
      <header>
        <a href="/">Windie</a>
        <nav>
          <a href="/computers">Computers</a>
          <a href="/devices/connect">Connect computer</a>
          <button onClick={onSignOut}>Sign out</button>
        </nav>
      </header>
      <section className="devices-content">
        <p className="devices-eyebrow">{email ?? 'Signed-in account'}</p>
        <h1>{pairing ? 'Connect your computer' : 'Your computers'}</h1>
        <p>
          Registration and online status. A hosted conversation may later ask
          you to approve one tool on a selected online computer; plugin
          installation and remote desktop are not enabled here.
        </p>
        {error && (
          <p role="alert" className="devices-error">
            {error}
          </p>
        )}
        {pairing ? (
          <>
            <p>
              Run <code>windie agent connect</code> on your computer. Only
              approve a code you requested yourself—never one sent by someone
              else.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void act(async () =>
                  setPreview(await enrollmentAction(token, code, 'lookup')),
                );
              }}
            >
              <label htmlFor="pair-code">Pairing code</label>
              <div className="devices-input">
                <input
                  id="pair-code"
                  value={code}
                  maxLength={32}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={busy}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setPreview(null);
                  }}
                  placeholder="XXXXXXX-XXXXXXX"
                />
                <button disabled={busy || !code.trim()}>
                  Preview computer
                </button>
              </div>
            </form>
            {preview && (
              <article className="device-card">
                <h2>{preview.metadata.name}</h2>
                <p>
                  {preview.metadata.os} · {preview.metadata.architecture} ·
                  Windie {preview.metadata.agent_version}
                </p>
                <p>
                  Device details are self-reported, not verified hardware
                  identity.
                </p>
                <p>
                  Account ID to compare in your terminal:{' '}
                  <code>{accountId}</code>
                </p>
                <p>
                  Expires{' '}
                  {new Date(preview.expires_at * 1000).toLocaleTimeString()} ·{' '}
                  {preview.state}
                </p>
                {preview.state === 'pending' && (
                  <div className="device-actions">
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(async () =>
                          setPreview(
                            await enrollmentAction(token, code, 'approve'),
                          ),
                        )
                      }
                    >
                      Approve registration
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        void act(async () =>
                          setPreview(
                            await enrollmentAction(token, code, 'deny'),
                          ),
                        )
                      }
                    >
                      Deny
                    </button>
                  </div>
                )}
                {preview.state === 'approved' && (
                  <output>
                    Approved. Compare the account ID and confirm in your
                    terminal, then run <code>windie agent run --tools</code>{' '}
                    only when you want this computer to receive approved hosted work.
                  </output>
                )}
                {terminal && (
                  <output>
                    This pairing is {preview.state}. Start a new pairing in your
                    terminal if needed.
                  </output>
                )}
              </article>
            )}
          </>
        ) : (
          <>
            <a className="device-connect" href="/devices/connect">
              Connect a computer →
            </a>
            {!loaded && <output>Loading computers…</output>}
            {loaded && devices.length === 0 && (
              <p>No computers registered to this account yet.</p>
            )}
            {devices.map((device) => (
              <article className="device-card" key={device.id}>
                <h2>
                  {device.metadata.name}{' '}
                  <span>
                    {device.revoked
                      ? 'Revoked'
                      : device.online
                        ? 'Online'
                        : 'Offline'}
                  </span>
                </h2>
                <p>
                  {device.metadata.os} · {device.metadata.architecture}
                </p>
                <p>
                  <code>{device.id}</code>
                </p>
                <p>
                  Last seen:{' '}
                  {device.last_seen
                    ? new Date(device.last_seen * 1000).toLocaleString()
                    : 'Never connected'}
                </p>
                {!device.revoked &&
                  (revokeTarget === device.id ? (
                    <div>
                      <p>
                        Revoke this computer? Its credential will stop working.
                        Reconnecting requires a new pairing.
                      </p>
                      <div className="device-actions">
                        <button
                          disabled={busy}
                          onClick={() =>
                            void act(async () => {
                              await revokeDevice(token, device.id);
                              setDevices((rows) =>
                                rows.map((row) =>
                                  row.id === device.id
                                    ? { ...row, revoked: true, online: false }
                                    : row,
                                ),
                              );
                              setRevokeTarget(null);
                            })
                          }
                        >
                          Confirm revoke
                        </button>
                        <button
                          disabled={busy}
                          onClick={() => setRevokeTarget(null)}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => setRevokeTarget(device.id)}
                    >
                      Revoke access
                    </button>
                  ))}
              </article>
            ))}
            <p>
              Online means recent authenticated contact, not tool readiness. An
              interrupted connection may take up to 90 seconds to show offline.
            </p>
          </>
        )}
      </section>
    </main>
  );
}

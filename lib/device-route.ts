/** OAuth may restore only these exact local device routes, never arbitrary URLs. */
export function deviceRoute(
  path: string,
): '/computers' | '/devices/connect' | null {
  return path === '/computers' || path === '/devices/connect' ? path : null;
}
const returnKey = 'windie.device-signin-return';
export function rememberDeviceReturn() {
  try {
    const path = deviceRoute(window.location.pathname);
    if (path) sessionStorage.setItem(returnKey, path);
    else sessionStorage.removeItem(returnKey);
  } catch {
    /* Storage can be disabled; sign-in still works. */
  }
}
export function restoreDeviceReturn() {
  try {
    const path = deviceRoute(sessionStorage.getItem(returnKey) ?? '');
    sessionStorage.removeItem(returnKey);
    if (path && window.location.pathname === '/') {
      window.history.replaceState({}, '', path);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  } catch {
    /* No arbitrary redirect fallback. */
  }
}

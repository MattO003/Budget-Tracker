import { useEffect, useState } from 'react';

// Chrome/Edge/Android fire `beforeinstallprompt` once, early. Keep it so the
// Settings → Phone app tab can offer a one-tap Install button later.
let deferred = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export function listenForInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export const isInstalled = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;

export function devicePlatform() {
  const ua = window.navigator.userAgent || '';
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/** {installed, canInstall, install()} */
export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return {
    installed: isInstalled(),
    canInstall: Boolean(deferred),
    install: async () => {
      if (!deferred) return false;
      deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      notify();
      return outcome === 'accepted';
    },
  };
}

/** True once if the page was opened from the home-screen "Add transaction" shortcut; removes the flag from the address. */
export function takeAddShortcut() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('action') !== 'add') return false;
  params.delete('action');
  const q = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${q ? `?${q}` : ''}${window.location.hash}`);
  return true;
}

let pendingAdd = false;
/** Call once at startup (before sign-in can change the address). */
export function captureAddShortcut() {
  pendingAdd = takeAddShortcut();
}
/** True the first time it's asked after opening from the shortcut. */
export function consumeAddShortcut() {
  const v = pendingAdd;
  pendingAdd = false;
  return v;
}

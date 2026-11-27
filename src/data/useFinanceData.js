import { useCallback, useEffect, useRef, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, WRITES_ENABLED } from '../lib/firebase.js';
import { createDefaultData, normalizeData } from './model.js';

const SAVE_DELAY_MS = 800;

/**
 * Live copy of users/{uid}.
 *
 * Differences from the original app's sync, on purpose:
 *  - Only writes after a real local change (the original also re-saved every
 *    snapshot it received, so each edit was written twice).
 *  - Ignores the echo of its own pending writes.
 *  - While local edits are unsaved, incoming snapshots don't overwrite them.
 *  - Saves immediately when the tab is hidden or closed, instead of losing the
 *    last second of edits.
 *  - In local development, nothing is written unless VITE_ALLOW_WRITES=true.
 *
 * status: 'loading' | 'saved' | 'pending' | 'saving' | 'readonly' | 'error'
 */
export function useFinanceData(user) {
  const uid = user?.uid ?? null;
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const latest = useRef(null); // most recent local state
  const dirty = useRef(false); // local changes not yet confirmed saved
  const timer = useRef(null);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    if (!uid || !dirty.current || !latest.current) return;
    if (!WRITES_ENABLED) {
      setStatus('readonly');
      return;
    }
    const snapshot = latest.current;
    setStatus('saving');
    try {
      await setDoc(doc(db, 'users', uid), snapshot);
      if (latest.current === snapshot) {
        dirty.current = false;
        setStatus('saved');
        setLastSavedAt(new Date());
      }
    } catch (e) {
      setError(e);
      setStatus('error');
    }
  }, [uid]);

  // Subscribe to the user's document.
  useEffect(() => {
    if (!uid) {
      latest.current = null;
      dirty.current = false;
      setData(null);
      return undefined;
    }
    setStatus('loading');
    setError(null);
    const ref = doc(db, 'users', uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.metadata.hasPendingWrites) return; // our own save echoing back
        if (dirty.current) return; // keep unsaved local edits
        if (snap.exists()) {
          const next = normalizeData(snap.data());
          latest.current = next;
          setData(next);
          setStatus(WRITES_ENABLED ? 'saved' : 'readonly');
        } else {
          // Brand-new user: same starting data the original app created.
          const next = createDefaultData();
          latest.current = next;
          setData(next);
          if (WRITES_ENABLED) {
            setDoc(ref, next).catch((e) => {
              setError(e);
              setStatus('error');
            });
          }
          setStatus(WRITES_ENABLED ? 'saved' : 'readonly');
        }
      },
      (e) => {
        setError(e);
        setStatus('error');
      },
    );
    return () => {
      unsubscribe();
      clearTimeout(timer.current);
    };
  }, [uid, reloadKey]);

  // Save right away if the tab is hidden or closed with edits pending.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden' && dirty.current) flush();
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', flush);
    };
  }, [flush]);

  /** Apply a change: update(prev => next). `fn` must be pure (no side effects). */
  const update = useCallback(
    (fn) => {
      const next = fn(latest.current);
      if (next === latest.current) return;
      latest.current = next;
      dirty.current = true;
      setData(next);
      clearTimeout(timer.current);
      if (!WRITES_ENABLED) {
        setStatus('readonly');
        return;
      }
      setStatus('pending');
      timer.current = setTimeout(flush, SAVE_DELAY_MS);
    },
    [flush],
  );

  /** Replace everything (used by restore) and save immediately. */
  const replaceAll = useCallback(
    async (nextData) => {
      const next = normalizeData(nextData);
      latest.current = next;
      dirty.current = true;
      setData(next);
      await flush();
    },
    [flush],
  );

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  const hasUnsaved = useCallback(() => dirty.current, []);

  return { data, status, error, lastSavedAt, update, replaceAll, retry, saveNow: flush, hasUnsaved, writesEnabled: WRITES_ENABLED };
}

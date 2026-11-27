// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Fake Firestore: capture the snapshot listener and every write.
const fs = { listener: null, setDoc: vi.fn(async () => {}) };
vi.mock('firebase/firestore', () => ({
  doc: (_db, ...path) => path.join('/'),
  onSnapshot: (_ref, next) => {
    fs.listener = next;
    return () => {};
  },
  setDoc: (...args) => fs.setDoc(...args),
}));

const snap = (data, { pending = false } = {}) => ({
  exists: () => data !== null,
  data: () => JSON.parse(JSON.stringify(data)),
  metadata: { hasPendingWrites: pending },
});

const legacy = { categories: { fixed: [], savings: [] }, assets: [], debts: [], savingsGoals: [], years: { 2025: {} }, preferences: { darkMode: false } };

async function mountHook(writesEnabled) {
  vi.resetModules();
  vi.doMock('../lib/firebase.js', () => ({ db: {}, WRITES_ENABLED: writesEnabled }));
  const { useFinanceData } = await import('./useFinanceData.js');
  const out = { current: null };
  function Probe() {
    out.current = useFinanceData({ uid: 'u1' });
    return null;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  await act(async () => root.render(<Probe />));
  return { out, unmount: () => act(async () => root.unmount()) };
}

beforeEach(() => {
  vi.useFakeTimers();
  fs.listener = null;
  fs.setDoc.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('test mode (saving off)', () => {
  it('loads real data but never writes, even after edits', async () => {
    const { out, unmount } = await mountHook(false);
    await act(async () => fs.listener(snap(legacy)));
    expect(out.current.data.years[2025][0]).toBeDefined();
    expect(out.current.status).toBe('readonly');

    await act(async () => out.current.update((d) => ({ ...d, assets: [{ id: 1, label: 'X', history: [] }] })));
    await act(async () => vi.advanceTimersByTime(5000));
    await act(async () => out.current.saveNow());
    expect(fs.setDoc).not.toHaveBeenCalled();
    expect(out.current.data.assets).toHaveLength(1); // the edit still shows locally
    await unmount();
  });

  it('does not create a document for a brand-new user', async () => {
    const { out, unmount } = await mountHook(false);
    await act(async () => fs.listener(snap(null)));
    expect(out.current.data.categories.fixed.length).toBeGreaterThan(0);
    expect(fs.setDoc).not.toHaveBeenCalled();
    await unmount();
  });
});

describe('normal mode (saving on)', () => {
  it('does not write just because data loaded', async () => {
    const { unmount } = await mountHook(true);
    await act(async () => fs.listener(snap(legacy)));
    await act(async () => vi.advanceTimersByTime(5000));
    expect(fs.setDoc).not.toHaveBeenCalled();
    await unmount();
  });

  it('writes once per batch of edits and ignores its own echo', async () => {
    const { out, unmount } = await mountHook(true);
    await act(async () => fs.listener(snap(legacy)));

    await act(async () => out.current.update((d) => ({ ...d, savingsGoals: [{ id: 1, label: 'A', target: 10, saved: 0 }] })));
    await act(async () => out.current.update((d) => ({ ...d, savingsGoals: [...d.savingsGoals, { id: 2, label: 'B', target: 5, saved: 0 }] })));
    expect(out.current.status).toBe('pending');
    await act(async () => vi.advanceTimersByTime(1000));
    expect(fs.setDoc).toHaveBeenCalledOnce();
    const written = fs.setDoc.mock.calls[0][1];
    expect(written.savingsGoals.map((g) => g.label)).toEqual(['A', 'B']);
    expect(out.current.status).toBe('saved');

    // Firestore echoes the write back (pending, then confirmed): no second write.
    await act(async () => fs.listener(snap(written, { pending: true })));
    await act(async () => fs.listener(snap(written)));
    await act(async () => vi.advanceTimersByTime(5000));
    expect(fs.setDoc).toHaveBeenCalledOnce();
    await unmount();
  });

  it('keeps unsaved local edits when another device’s update arrives', async () => {
    const { out, unmount } = await mountHook(true);
    await act(async () => fs.listener(snap(legacy)));
    await act(async () => out.current.update((d) => ({ ...d, assets: [{ id: 1, label: 'Mine', history: [] }] })));
    await act(async () => fs.listener(snap({ ...legacy, assets: [] }))); // remote update mid-edit
    expect(out.current.data.assets[0].label).toBe('Mine');
    await unmount();
  });

  it('applies another device’s update when nothing is unsaved', async () => {
    const { out, unmount } = await mountHook(true);
    await act(async () => fs.listener(snap(legacy)));
    await act(async () => fs.listener(snap({ ...legacy, debts: [{ id: 'd', label: 'Loan', history: [] }] })));
    expect(out.current.data.debts[0].label).toBe('Loan');
    expect(fs.setDoc).not.toHaveBeenCalled();
    await unmount();
  });

  it('reports a failed save and can retry', async () => {
    const { out, unmount } = await mountHook(true);
    await act(async () => fs.listener(snap(legacy)));
    fs.setDoc.mockRejectedValueOnce(Object.assign(new Error('offline'), { code: 'unavailable' }));
    await act(async () => out.current.update((d) => ({ ...d, assets: [{ id: 1, label: 'X', history: [] }] })));
    await act(async () => vi.advanceTimersByTime(1000));
    expect(out.current.status).toBe('error');
    await act(async () => out.current.saveNow());
    expect(fs.setDoc).toHaveBeenCalledTimes(2);
    expect(out.current.status).toBe('saved');
    await unmount();
  });
});

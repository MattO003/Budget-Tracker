// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultData } from '../data/model.js';
import { makeBackup } from '../data/backup.js';

vi.mock('../lib/firebase.js', () => ({ auth: {}, db: {}, googleProvider: {}, WRITES_ENABLED: false }));
vi.mock('firebase/auth', () => ({ signOut: vi.fn(), signInWithPopup: vi.fn(), signInWithRedirect: vi.fn() }));

const { default: Shell } = await import('../components/Shell.jsx');
const { default: Overview } = await import('./Overview.jsx');
const { default: Settings } = await import('./Settings.jsx');
const { ToastProvider } = await import('../components/Toasts.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const user = { uid: 'u1', displayName: 'Test Person', email: 'test@example.com' };

let host;
let root;
const render = async (el) => {
  await act(async () => root.render(<ToastProvider>{el}</ToastProvider>));
};
const click = async (el) => act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const byText = (sel, text) => [...host.querySelectorAll(sel)].find((n) => n.textContent.includes(text));

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn(); // downloads
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.location.hash = '';
});

describe('shell + overview', () => {
  it('shows navigation, save status and the data check', async () => {
    const data = createDefaultData(2026);
    data.assets.push({ id: 1, label: 'Checking', history: [] });
    await render(
      <Shell user={user} page="overview" theme="light" onTheme={() => {}} status="readonly" lastSavedAt={null}>
        <Overview data={data} user={user} />
      </Shell>,
    );
    expect(host.textContent).toContain('Welcome back, Test');
    expect(host.textContent).toContain('Your data loaded');
    expect(host.textContent).toContain('Test mode: saving is off');
    expect(byText('.stat', 'Assets').textContent).toContain('1');
    expect(host.querySelectorAll('.nav a')).toHaveLength(6);
  });
});

describe('settings', () => {
  const baseProps = (over = {}) => ({
    data: createDefaultData(2026),
    user,
    theme: 'light',
    onTheme: vi.fn(),
    replaceAll: vi.fn(async () => {}),
    writesEnabled: true,
    beforeSignOut: vi.fn(async () => {}),
    ...over,
  });

  it('downloads a backup', async () => {
    await render(<Settings {...baseProps()} />);
    await click(byText('button', 'Download backup'));
    expect(URL.createObjectURL).toHaveBeenCalledOnce();
    expect(host.textContent).not.toContain('Last backup on this device: never');
  });

  it('blocks restore in test mode', async () => {
    await render(<Settings {...baseProps({ writesEnabled: false })} />);
    expect(byText('button', 'Choose backup file').disabled).toBe(true);
    expect(host.textContent).toContain('Restoring is off in test mode');
  });

  it('previews, then restores a backup after confirmation', async () => {
    const props = baseProps();
    await render(<Settings {...props} />);
    const backupData = createDefaultData(2025);
    backupData.debts.push({ id: 'car', label: 'Car loan', history: [] });
    const file = new File([JSON.stringify(makeBackup(backupData))], 'backup.json', { type: 'application/json' });
    const input = host.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => new Promise((r) => setTimeout(r, 0)));

    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('2026'); // now
    expect(dialog.textContent).toContain('2025'); // in backup
    expect(props.replaceAll).not.toHaveBeenCalled();

    await click(byText('button', 'Replace my data'));
    expect(URL.createObjectURL).toHaveBeenCalledOnce(); // safety copy first
    expect(props.replaceAll).toHaveBeenCalledOnce();
    expect(props.replaceAll.mock.calls[0][0].debts[0].label).toBe('Car loan');
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows a readable error for a bad file', async () => {
    await render(<Settings {...baseProps()} />);
    const input = host.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: [new File(['nope'], 'x.json')], configurable: true });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await act(async () => new Promise((r) => setTimeout(r, 0)));
    expect(host.querySelector('[role="alert"]').textContent).toContain("isn't a Financial OS backup");
  });

  it('switches theme from Appearance', async () => {
    const props = baseProps();
    await render(<Settings {...props} />);
    await click(byText('[role="tab"]', 'Appearance'));
    await click(byText('button', 'Dark'));
    expect(props.onTheme).toHaveBeenCalledWith('dark');
  });
});

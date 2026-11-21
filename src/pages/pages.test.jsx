// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultData } from '../data/model.js';
import { makeBackup } from '../data/backup.js';
import { MONTHS, pad2 } from '../lib/format.js';

vi.mock('../lib/firebase.js', () => ({ auth: {}, db: {}, googleProvider: {}, WRITES_ENABLED: false }));
vi.mock('firebase/auth', () => ({ signOut: vi.fn(), signInWithPopup: vi.fn(), signInWithRedirect: vi.fn() }));

const { default: Shell } = await import('../components/Shell.jsx');
const { default: QuickAdd } = await import('../components/QuickAdd.jsx');
const { default: Overview } = await import('./Overview.jsx');
const { default: Budget } = await import('./Budget.jsx');
const { default: Settings } = await import('./Settings.jsx');
const { ToastProvider } = await import('../components/Toasts.jsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const user = { uid: 'u1', displayName: 'Test Person', email: 'test@example.com' };
const NOW = new Date();
const Y = String(NOW.getFullYear());
const M = NOW.getMonth();

/** Realistic data for the current month. */
function sample() {
  const d = createDefaultData(Number(Y));
  const m = d.years[Y][M];
  m.income.push({ label: 'Paycheck', amount: 2450 });
  Object.assign(m.expenses, { rent: 1450, trash: 32, groceries: 500, gas: 180, roth: 500 });
  Object.assign(m.spent, { rent: 1450, roth: 500 });
  m.transactions.groceries = [{ id: 1, desc: 'Costco', amount: 148.62 }, { id: 2, desc: 'Kroger', amount: 92.4, date: `${Y}-${pad2(M + 1)}-02` }];
  m.transactions.gas = [{ id: 3, desc: 'Shell', amount: 46.1 }];
  return d;
}

let host;
let root;
let latest; // most recent data seen by the harness
/** Holds data in state like the real app, so edits re-render the page. */
function Harness({ initial, render }) {
  const [data, setData] = useState(initial);
  latest = data;
  const update = (fn) => setData((d) => fn(d));
  return render({ data, update });
}
const mount = async (initial, render) => act(async () => root.render(<ToastProvider><Harness initial={initial} render={render} /></ToastProvider>));
const click = async (el) => {
  if (!el) throw new Error('element not found');
  await act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
};
const type = async (el, value) => {
  if (!el) throw new Error('input not found');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const submit = async (form, submitter) => act(async () => form.requestSubmit(submitter));
const byText = (sel, text, scope = document) => [...scope.querySelectorAll(sel)].find((n) => n.textContent.includes(text));
const flush = () => act(async () => new Promise((r) => setTimeout(r, 0)));

beforeEach(() => {
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.location.hash = '';
});

describe('shell', () => {
  it('shows navigation, quick add, privacy toggle and save status', async () => {
    const onQuickAdd = vi.fn();
    const onTogglePrivacy = vi.fn();
    await mount(sample(), () => (
      <Shell user={user} page="overview" theme="light" onTheme={() => {}} status="readonly" lastSavedAt={null} onQuickAdd={onQuickAdd} privacy={false} onTogglePrivacy={onTogglePrivacy}>
        <p>child</p>
      </Shell>
    ));
    expect(host.querySelectorAll('.nav a')).toHaveLength(6);
    expect(host.textContent).toContain('Test mode: saving is off');
    await click(byText('.side button', 'Add transaction'));
    await click(byText('.side button', 'Hide amounts'));
    expect(onQuickAdd).toHaveBeenCalledOnce();
    expect(onTogglePrivacy).toHaveBeenCalledOnce();
  });
});

describe('overview', () => {
  it('summarises this month', async () => {
    await mount(sample(), (p) => <Overview {...p} onQuickAdd={() => {}} />);
    expect(host.querySelector('h1').textContent).toBe(`${MONTHS[M]} ${Y}`);
    expect(byText('.fig', 'Income').textContent).toContain('$2,450');
    expect(byText('.li', 'Groceries').textContent).toContain('$241.02');
    expect(byText('.card', 'Bills').textContent).toContain('1 of 2 paid'); // rent paid, trash not
    expect(byText('.card', 'Recent purchases').textContent).toContain('Kroger');
  });
  it('offers to add this year when it is missing', async () => {
    const d = createDefaultData(Number(Y) - 1);
    await mount(d, (p) => <Overview {...p} onQuickAdd={() => {}} />);
    await click(byText('button', `Add ${Y}`));
    expect(latest.years[Y]).toBeDefined();
  });
});

describe('budget page', () => {
  beforeEach(() => {
    window.location.hash = `#/budget/${Y}-${pad2(M + 1)}`;
  });

  it('edits a bill and shows it as paid', async () => {
    await mount(sample(), (p) => <Budget {...p} />);
    expect(host.querySelector('h1').textContent).toBe(`${MONTHS[M]} ${Y}`);
    await type(host.querySelector('input[aria-label="Trash paid"]'), '32');
    expect(latest.years[Y][M].spent.trash).toBe(32);
    expect(byText('tr', 'Trash').textContent).toContain('Paid');
  });

  it('logs a purchase with a date, deletes it, and undoes the delete', async () => {
    await mount(sample(), (p) => <Budget {...p} />);
    await click(byText('.cat-head', 'Gas'));
    const form = host.querySelector('.tx-add');
    await type(form.querySelector('.desc'), 'BP');
    await type(form.querySelector('input[aria-label="Amount"]'), '40.5');
    await submit(form);
    const gas = latest.years[Y][M].transactions.gas;
    expect(gas.at(-1)).toMatchObject({ desc: 'BP', amount: 40.5 });
    expect(gas.at(-1).date).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await click(host.querySelector('button[aria-label="Delete Shell"]'));
    expect(latest.years[Y][M].transactions.gas.map((t) => t.desc)).toEqual(['BP']);
    await click(byText('.toast button', 'Undo'));
    expect(latest.years[Y][M].transactions.gas.map((t) => t.desc)).toEqual(['Shell', 'BP']);
  });

  it('asks before applying the budget to the whole year', async () => {
    await mount(sample(), (p) => <Budget {...p} />);
    await click(byText('button', `Use this budget for all of ${Y}`));
    expect(document.querySelector('[role="dialog"]').textContent).toContain('Replaces the budget amounts in the other 11 months');
    await click(byText('[role="dialog"] button', 'Replace 11 months'));
    const other = (M + 1) % 12;
    expect(latest.years[Y][other].expenses).toEqual(latest.years[Y][M].expenses);
  });

  it('year overview lists every month and opens one', async () => {
    window.location.hash = `#/budget/${Y}`;
    await mount(sample(), (p) => <Budget {...p} />);
    expect(host.querySelectorAll('tbody tr.click')).toHaveLength(12);
    await click(byText('tr.click', MONTHS[M]));
    expect(window.location.hash).toBe(`#/budget/${Y}-${pad2(M + 1)}`);
  });
});

describe('quick add', () => {
  it('reads one line, fills the remembered category, and adds the purchase', async () => {
    const onClose = vi.fn();
    await mount(sample(), (p) => <QuickAdd {...p} onClose={onClose} />);
    await type(document.getElementById('qa-line'), '45.20 costco');
    expect(document.getElementById('qa-amt').value).toBe('45.2');
    expect(document.getElementById('qa-store').value).toBe('Costco');
    expect(document.getElementById('qa-cat').value).toBe('groceries');
    expect(document.querySelector('.memo').textContent).toContain('goes to Groceries');
    await submit(document.querySelector('[role="dialog"] form'));
    expect(latest.years[Y][M].transactions.groceries.at(-1)).toMatchObject({ desc: 'Costco', amount: 45.2 });
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the box open with "Add & add another"', async () => {
    const onClose = vi.fn();
    await mount(sample(), (p) => <QuickAdd {...p} onClose={onClose} />);
    await type(document.getElementById('qa-line'), '6.75 starbucks');
    expect(document.querySelector('.memo').textContent).toContain('New store');
    await submit(document.querySelector('[role="dialog"] form'), byText('button', 'Add & add another'));
    expect(onClose).not.toHaveBeenCalled();
    expect(document.getElementById('qa-line').value).toBe('');
  });

  it('explains what is missing', async () => {
    await mount(sample(), (p) => <QuickAdd {...p} onClose={() => {}} />);
    await type(document.getElementById('qa-line'), 'costco');
    await submit(document.querySelector('[role="dialog"] form'));
    expect(document.querySelector('.memo').textContent).toContain('Add an amount');
  });
});

describe('settings', () => {
  const props = (over = {}) => ({ user, theme: 'light', onTheme: vi.fn(), replaceAll: vi.fn(async () => {}), writesEnabled: true, beforeSignOut: vi.fn(async () => {}), ...over });

  describe('categories', () => {
    it('hides a bill instead of deleting it', async () => {
      await mount(sample(), (p) => <Settings {...p} {...props()} />);
      await click(host.querySelector('button[aria-label="Remove Rent"]'));
      expect(document.querySelector('[role="dialog"]').textContent).toContain('It has amounts in 1 month');
      await click(byText('[role="dialog"] button', 'Hide it'));
      expect(latest.categories.fixed[0].items.find((i) => i.id === 'rent').archived).toBe(true);
    });
    it('deletes everywhere when asked, with undo', async () => {
      await mount(sample(), (p) => <Settings {...p} {...props()} />);
      await click(host.querySelector('button[aria-label="Remove Trash"]'));
      await click(byText('[role="dialog"] button', 'Delete everywhere'));
      expect(latest.categories.fixed[0].items.map((i) => i.id)).toEqual(['rent']);
      await click(byText('.toast button', 'Undo'));
      expect(latest.categories.fixed[0].items.map((i) => i.id)).toEqual(['rent', 'trash']);
    });
    it('renames and adds bills', async () => {
      await mount(sample(), (p) => <Settings {...p} {...props()} />);
      await click(host.querySelector('button[aria-label="Rename Trash"]'));
      const input = host.querySelector('input[aria-label="New name for Trash"]');
      await type(input, 'Garbage');
      await submit(input.form);
      expect(latest.categories.fixed[0].items[1]).toEqual({ id: 'trash', label: 'Garbage' });
      const add = host.querySelector('input[aria-label="Add a bill to Housing"]');
      await type(add, 'Water');
      await submit(add.form);
      expect(latest.categories.fixed[0].items.at(-1).label).toBe('Water');
    });
  });

  describe('backup', () => {
    beforeEach(() => {
      window.location.hash = '#/settings/backup';
    });
    it('downloads a backup', async () => {
      await mount(sample(), (p) => <Settings {...p} {...props()} />);
      await click(byText('button', 'Download backup'));
      expect(URL.createObjectURL).toHaveBeenCalledOnce();
    });
    it('blocks restore in test mode', async () => {
      await mount(sample(), (p) => <Settings {...p} {...props({ writesEnabled: false })} />);
      expect(byText('button', 'Choose backup file').disabled).toBe(true);
    });
    it('previews, then restores a backup after confirmation', async () => {
      const p0 = props();
      await mount(sample(), (p) => <Settings {...p} {...p0} />);
      const backupData = createDefaultData(2025);
      backupData.debts.push({ id: 'car', label: 'Car loan', history: [] });
      const input = host.querySelector('input[type="file"]');
      Object.defineProperty(input, 'files', { value: [new File([JSON.stringify(makeBackup(backupData))], 'b.json')], configurable: true });
      await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
      await flush();
      expect(document.querySelector('[role="dialog"]').textContent).toContain('2025');
      await click(byText('button', 'Replace my data'));
      expect(URL.createObjectURL).toHaveBeenCalledOnce(); // safety copy first
      expect(p0.replaceAll.mock.calls[0][0].debts[0].label).toBe('Car loan');
    });
    it('shows a readable error for a bad file', async () => {
      await mount(sample(), (p) => <Settings {...p} {...props()} />);
      const input = host.querySelector('input[type="file"]');
      Object.defineProperty(input, 'files', { value: [new File(['nope'], 'x.json')], configurable: true });
      await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
      await flush();
      expect(host.querySelector('[role="alert"]').textContent).toContain("isn't a Financial OS backup");
    });
  });

  it('switches theme from Appearance', async () => {
    const p0 = props();
    await mount(sample(), (p) => <Settings {...p} {...p0} />);
    await click(byText('[role="tab"]', 'Appearance'));
    await click(byText('button', 'Dark'));
    expect(p0.onTheme).toHaveBeenCalledWith('dark');
  });
});

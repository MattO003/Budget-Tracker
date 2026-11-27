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
const { default: NetWorth } = await import('./NetWorth.jsx');
const { default: Goals } = await import('./Goals.jsx');
const { default: Analytics } = await import('./Analytics.jsx');

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

  it('shows purchases hidden in a dropped category and brings them back', async () => {
    const d = sample();
    d.years[Y][M].transactions.vacation_1700000000000 = [{ id: 9, desc: 'Flights', amount: 400 }, { id: 10, desc: 'Hotel', amount: 250.5 }];
    await mount(d, (p) => <Budget {...p} />);
    const banner = byText('.banner', 'counted');
    expect(banner.textContent).toContain('2 purchases ($650.50)');
    expect(banner.textContent).toContain('“Vacation”');
    await click(byText('.banner button', 'Bring back Vacation'));
    expect(latest.years[Y][M].variableCategories.at(-1)).toEqual({ id: 'vacation_1700000000000', label: 'Vacation' });
    expect(byText('.banner', 'counted')).toBeUndefined();
    expect(byText('.cat-head', 'Vacation').textContent).toContain('2 purchases');
    await click(byText('.toast button', 'Undo'));
    expect(latest.years[Y][M].variableCategories.some((c) => c.id === 'vacation_1700000000000')).toBe(false);
  });

  it('asks before removing a category that has purchases, but not an empty one', async () => {
    const d = sample();
    d.years[Y][M].variableCategories.push({ id: 'misc', label: 'Misc' });
    await mount(d, (p) => <Budget {...p} />);
    await click(byText('.cat-head', 'Misc'));
    await click(byText('button', 'Remove category'));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(latest.years[Y][M].variableCategories.map((c) => c.id)).toEqual(['groceries', 'gas']);

    await click(byText('.cat-head', 'Gas'));
    await click(byText('button', 'Remove category'));
    expect(document.querySelector('[role="dialog"]').textContent).toContain('1 purchase ($46.10)');
    await click(byText('[role="dialog"] button', 'Remove category'));
    expect(latest.years[Y][M].variableCategories.map((c) => c.id)).toEqual(['groceries']);
    expect(byText('.banner', 'counted').textContent).toContain('Bring back Gas');
  });

  it('jumps to another year with the year picker', async () => {
    const d = sample();
    const other = String(Number(Y) - 3);
    d.years[other] = createDefaultData(Number(other)).years[other];
    await mount(d, (p) => <Budget {...p} />);
    const select = host.querySelector('select[aria-label="Go to year"]');
    expect([...select.options].map((o) => o.value)).toEqual([other, Y]);
    await act(async () => {
      select.value = other;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(window.location.hash).toBe(`#/budget/${other}-${pad2(M + 1)}`);
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

function withWorth() {
  const d = sample();
  d.assets.push(
    { id: 1, label: 'Checking', type: 'Asset', history: [{ date: '2025-01-01', value: 1000 }, { date: '2025-06-01', value: 3000 }] },
    { id: 2, label: 'Roth', history: [{ date: '2025-03-01', value: 8000 }] },
  );
  d.debts.push({ id: 'card_1', label: 'Card', history: [{ date: '2025-01-01', value: 1200 }] });
  d.years[Y][M].debts.card_1 = { payment: 150 };
  return d;
}

describe('net worth page', () => {
  it('shows totals, assets and debts', async () => {
    await mount(withWorth(), (p) => <NetWorth {...p} />);
    expect(host.querySelector('h1').textContent).toBe('$9,800');
    const card = (title) => [...host.querySelectorAll('.card')].find((c) => c.querySelector('h2')?.textContent === title);
    expect(card('Assets').textContent).toContain('Checking');
    expect(card('Debts').textContent).toContain('No APR set');
    expect(host.querySelector('svg.chart')).not.toBeNull();
    await click(byText('.seg button', '1 year')); // nothing logged in the last year: still a line, up to today
    expect(host.querySelector('svg.chart')).not.toBeNull();
  });

  it('logs a value in the side panel and the history updates right away', async () => {
    await mount(withWorth(), (p) => <NetWorth {...p} />);
    await click(byText('button.li', 'Checking'));
    const panel = host.querySelector('.scrim.drawer');
    expect(panel.querySelectorAll('.hist')).toHaveLength(2);
    await type(panel.querySelector('input[aria-label="Date"]'), '2025-09-01');
    await type(panel.querySelector('input[aria-label="Amount"]'), '4200');
    await submit(panel.querySelector('form.log-box'));
    expect(latest.assets[0].history).toHaveLength(3);
    expect(latest.assets[0].type).toBe('Asset');
    expect(host.querySelectorAll('.scrim.drawer .hist')).toHaveLength(3);
    expect(host.querySelector('.big-num').textContent).toBe('$4,200.00');
  });

  it('deletes a history entry with undo, and marks an account as cash', async () => {
    await mount(withWorth(), (p) => <NetWorth {...p} />);
    await click(byText('button.li', 'Checking'));
    await click(host.querySelector('.scrim.drawer .hist .del')); // newest: Jun 1
    expect(latest.assets[0].history.map((h) => h.value)).toEqual([1000]);
    await click(byText('.toast button', 'Undo'));
    expect(latest.assets[0].history.map((h) => h.value)).toEqual([1000, 3000]);
    await click(host.querySelector('.scrim.drawer input[type="checkbox"]'));
    expect(latest.assets[0].cash).toBe(true);
  });

  it('sets APR and payment on a debt', async () => {
    await mount(withWorth(), (p) => <NetWorth {...p} />);
    await click(byText('button.li', 'Card'));
    expect(host.querySelector('.scrim.drawer').textContent).toContain('latest payment from Budget ($150.00');
    await type(host.querySelector('#wi-apr'), '22.9');
    await type(host.querySelector('#wi-pay'), '200');
    expect(latest.debts[0]).toMatchObject({ apr: 22.9, payment: 200 });
  });

  it('adds an asset with its value and opens it', async () => {
    await mount(withWorth(), (p) => <NetWorth {...p} />);
    await click(byText('.page-head button', 'Add asset'));
    await type(host.querySelector('#ni-name'), 'Brokerage');
    await type(host.querySelector('#ni-val'), '2500');
    await submit(host.querySelector('.scrim form'));
    expect(latest.assets.at(-1)).toMatchObject({ label: 'Brokerage', history: [{ value: 2500 }] });
    expect(host.querySelector('.scrim.drawer h2').textContent).toBe('Brokerage');
  });

  it('asks before deleting an item and can undo', async () => {
    await mount(withWorth(), (p) => <NetWorth {...p} />);
    await click(byText('button.li', 'Roth'));
    await click(byText('.scrim.drawer button', 'Delete asset'));
    await click(byText('.scrim:not(.drawer) button', 'Delete asset'));
    expect(latest.assets.map((a) => a.label)).toEqual(['Checking']);
    await click(byText('.toast button', 'Undo'));
    expect(latest.assets.map((a) => a.label)).toEqual(['Checking', 'Roth']);
  });
});

describe('goals page', () => {
  it('creates a goal linked to a bucket and counts what was saved there', async () => {
    await mount(withWorth(), (p) => <Goals {...p} />);
    await click(byText('.page-head button', 'New goal'));
    await type(host.querySelector('#g-name'), 'Retire');
    await type(host.querySelector('#g-target'), '1000');
    const sel = host.querySelector('#g-link');
    await act(async () => {
      sel.value = 'roth';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await submit(host.querySelector('.scrim form'));
    expect(latest.savingsGoals[0]).toMatchObject({ label: 'Retire', target: 1000, saved: 0, bucketId: 'roth' });
    expect(byText('.goal', 'Retire').textContent).toContain('$500'); // 500 saved into Roth this month
  });

  it('adds cash to a manual goal and undoes it', async () => {
    const d = withWorth();
    d.savingsGoals.push({ id: 5, label: 'Laptop', target: 1800, saved: 100 });
    await mount(d, (p) => <Goals {...p} />);
    await click(byText('.goal button', 'Add cash'));
    await type(host.querySelector('.goal input'), '40');
    await submit(host.querySelector('.goal form'));
    expect(latest.savingsGoals[0].saved).toBe(140);
    await click(byText('.toast button', 'Undo'));
    expect(latest.savingsGoals[0].saved).toBe(100);
  });

  it('plans the payoff, using the Budget payment when none is set', async () => {
    await mount(withWorth(), (p) => <Goals {...p} />);
    const planner = byText('.card', 'Debt payoff planner');
    expect(planner.textContent).toContain('latest from Budget');
    expect(planner.textContent).toContain('Debt-free by');
    expect(planner.textContent).toContain('8 months'); // 1200 / 150 at 0%
  });

  it('explains when there are no debts', async () => {
    await mount(sample(), (p) => <Goals {...p} />);
    expect(byText('.card', 'Debt payoff planner').textContent).toContain('No debts to plan for');
  });
});

describe('phone app tab', () => {
  it('explains how to install on iPhone and Android', async () => {
    window.location.hash = '#/settings/install';
    await mount(sample(), (p) => <Settings {...p} user={user} theme="light" onTheme={() => {}} replaceAll={async () => {}} writesEnabled={false} beforeSignOut={async () => {}} />);
    expect(host.textContent).toContain('Add to Home Screen');
    expect(host.textContent).toContain('Add transaction');
  });
});

describe('analytics page', () => {
  it('shows figures, breakdowns and filters by month', async () => {
    await mount(withWorth(), (p) => <Analytics {...p} />);
    expect(host.querySelector('h1').textContent).toBe(Y);
    expect(byText('.fig', 'Income').textContent).toContain('$2,450');
    const where = byText('.card', 'Where the money went');
    expect(where.textContent).toContain('Housing');
    expect(where.textContent).not.toContain('Roth');
    expect(byText('.card', 'Where savings went').textContent).toContain('Roth IRA');
    expect(byText('.fig', 'Cash runway').textContent).toContain('Mark your cash accounts');
    const month = host.querySelector('select[aria-label="Month"]');
    await act(async () => {
      month.value = String((M + 1) % 12);
      month.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.querySelector('h1').textContent).toBe(`${MONTHS[(M + 1) % 12]} ${Y}`);
    expect(byText('.fig', 'Income').textContent).toContain('$0');
  });

  it('works out cash runway from cash accounts', async () => {
    const d = withWorth();
    d.assets[0].cash = true;
    await mount(d, (p) => <Analytics {...p} />);
    expect(byText('.fig', 'Cash runway').textContent).toMatch(/\d+\.\d mo/);
  });
});

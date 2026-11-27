import { describe, expect, it } from 'vitest';
import * as B from './budget.js';
import { createDefaultData, normalizeData } from './model.js';

// Verbatim logic of calculateStats() from legacy/index.html (only `data` passed in explicitly).
function legacyCalculateStats(data, monthsArray) {
  const getCatSpent = (m, catId) => m.transactions?.[catId]?.reduce((s, t) => s + t.amount, 0) || 0;
  const getMonthIncome = (m) => m.income.reduce((s, i) => s + i.amount, 0);
  let s = { income: 0, budgeted: 0, spent: 0, saved: 0, debtPaid: 0 };
  monthsArray.forEach((m) => {
    s.income += getMonthIncome(m);
    data.categories.fixed.forEach((group) => group.items.forEach((c) => { s.budgeted += m.expenses[c.id] || 0; s.spent += m.spent[c.id] || 0; }));
    const varCats = m.variableCategories || [];
    varCats.forEach((c) => { s.budgeted += m.expenses[c.id] || 0; s.spent += getCatSpent(m, c.id); });
    data.categories.savings.forEach((group) => group.items.forEach((c) => { s.budgeted += m.expenses[c.id] || 0; s.saved += m.spent[c.id] || 0; }));
    data.debts.forEach((d) => { s.debtPaid += m.debts?.[d.id]?.payment || 0; s.spent += m.debts?.[d.id]?.payment || 0; });
  });
  s.remaining = s.income - (s.spent + s.saved);
  s.rate = s.income > 0 ? ((s.saved / s.income) * 100).toFixed(1) : '0.0';
  return s;
}

function sample() {
  const d = createDefaultData(2026);
  d.categories.fixed[0].items.push({ id: 'electric', label: 'Electric' });
  d.debts.push({ id: 'car', label: 'Car loan', history: [{ date: '2026-01-01', value: 9000 }, { date: '2026-06-01', value: 7000 }] });
  d.assets.push({ id: 1, label: 'Checking', history: [{ date: '2026-03-01', value: 3000 }, { date: '2026-01-01', value: 1000 }] });
  const m = d.years[2026][10];
  m.income.push({ label: 'Pay', amount: 2450 }, { label: 'Pay', amount: 2450 });
  Object.assign(m.expenses, { rent: 1450, electric: 95, car_ins: 128, roth: 500, groceries: 500, gas: 180 });
  Object.assign(m.spent, { rent: 1450, electric: 88.42, roth: 500 });
  m.transactions.groceries = [{ id: 1, desc: 'Costco', amount: 148.62 }, { id: 2, desc: 'Kroger', amount: 92.4, date: '2026-11-11' }];
  m.transactions.gas = [{ id: 3, desc: 'Shell', amount: 46.1 }];
  m.transactions.removed_cat = [{ id: 4, desc: 'Orphan', amount: 999 }]; // category deleted: must not count
  m.debts.car = { payment: 342.18 };
  d.years[2026][9].income.push({ label: 'Pay', amount: 1000 });
  return d;
}

describe('calcStats matches the original app', () => {
  it('for one month', () => {
    const d = sample();
    const mine = B.calcStats(d, [d.years[2026][10]]);
    const old = legacyCalculateStats(d, [d.years[2026][10]]);
    for (const k of ['income', 'budgeted', 'spent', 'saved', 'debtPaid', 'remaining']) expect(mine[k]).toBeCloseTo(old[k], 9);
    expect(mine.rate.toFixed(1)).toBe(old.rate);
  });
  it('for a whole year', () => {
    const d = sample();
    const months = Object.values(d.years[2026]);
    const mine = B.calcStats(d, months);
    const old = legacyCalculateStats(d, months);
    for (const k of ['income', 'budgeted', 'spent', 'saved', 'debtPaid', 'remaining']) expect(mine[k]).toBeCloseTo(old[k], 9);
  });
});

describe('net worth', () => {
  it('uses the latest logged value, like the original', () => {
    const d = sample();
    expect(B.totalAssets(d)).toBe(3000);
    expect(B.totalDebts(d)).toBe(7000);
    expect(B.netWorthSeries(d).map((p) => [p.date, p.net])).toEqual([
      ['2026-01-01', 1000 - 9000],
      ['2026-03-01', 3000 - 9000],
      ['2026-06-01', 3000 - 7000],
    ]);
  });
});

describe('month changes', () => {
  it('copy from previous month copies categories and merges budgets, like the original', () => {
    let d = sample();
    d.years[2026][10].transactions = {}; // nothing logged yet: same result as the original
    d.years[2026][9].variableCategories = [{ id: 'dining_1', label: 'Dining' }];
    d.years[2026][9].expenses = { dining_1: 150, rent: 1500 };
    d = B.copyFromPrevious(d, '2026', 10);
    expect(d.years[2026][10].variableCategories).toEqual([{ id: 'dining_1', label: 'Dining' }]);
    expect(d.years[2026][10].expenses).toMatchObject({ dining_1: 150, rent: 1500, electric: 95 });
  });
  it('copy from previous keeps categories that already have purchases', () => {
    let d = sample(); // November has purchases under groceries and gas
    d.years[2026][9].variableCategories = [{ id: 'dining_1', label: 'Dining' }, { id: 'gas', label: 'Gas' }];
    d.years[2026][9].expenses = { dining_1: 150, gas: 200 };
    d = B.copyFromPrevious(d, '2026', 10);
    expect(d.years[2026][10].variableCategories.map((c) => c.id)).toEqual(['dining_1', 'gas', 'groceries']);
    expect(d.years[2026][10].expenses).toMatchObject({ dining_1: 150, gas: 200, groceries: 500 });
    expect(B.hiddenPurchases(d)).toEqual([{ year: '2026', m: 10, catId: 'removed_cat', label: 'Removed cat', count: 1, total: 999 }]);
  });
  it('copy from previous uses this month’s category when the names match, with the copied budget', () => {
    let d = sample();
    d.years[2026][9].variableCategories = [{ id: 'groceries_99', label: 'groceries ' }];
    d.years[2026][9].expenses = { groceries_99: 650 };
    d = B.copyFromPrevious(d, '2026', 10);
    expect(d.years[2026][10].variableCategories.map((c) => c.id)).toEqual(['groceries', 'gas']);
    expect(d.years[2026][10].expenses.groceries).toBe(650);
  });
  it('finds purchases hidden in a dropped category and brings them back', () => {
    // "Copy from previous month" dropped a category, leaving its purchases uncounted.
    const d = sample();
    const july = d.years[2026][6];
    july.transactions.vacation_1700000000000 = [{ id: 5, desc: 'Flights', amount: 400 }, { id: 6, desc: 'Hotel', amount: 250.5 }];
    july.expenses.vacation_1700000000000 = 7000;
    const before = B.calcStats(d, [july]).spent;
    const found = B.hiddenPurchases(d).find((h) => h.m === 6);
    expect(found).toEqual({ year: '2026', m: 6, catId: 'vacation_1700000000000', label: 'Vacation', count: 2, total: 650.5 });

    const fixed = B.restoreHiddenCategory(d, '2026', 6, found.catId, found.label);
    expect(fixed.years[2026][6].variableCategories.at(-1)).toEqual({ id: 'vacation_1700000000000', label: 'Vacation' });
    expect(B.calcStats(fixed, [fixed.years[2026][6]]).spent).toBeCloseTo(before + 650.5, 9);
    expect(B.calcStats(fixed, [fixed.years[2026][6]]).budgeted).toBeGreaterThanOrEqual(7000);
    expect(B.hiddenPurchases(fixed).some((h) => h.m === 6)).toBe(false);
    expect(B.restoreHiddenCategory(fixed, '2026', 6, found.catId, found.label)).toBe(fixed); // already back: no change
  });
  it('names a hidden category from another month when it can', () => {
    const d = sample();
    d.years[2026][0].variableCategories.push({ id: 'apartmentitems_1', label: 'Apartment Items' });
    d.years[2026][1].transactions.apartmentitems_1 = [{ id: 7, desc: 'Lamp', amount: 30 }];
    expect(B.hiddenPurchases(d).find((h) => h.m === 1).label).toBe('Apartment Items');
  });
  it('copy from previous returns null when January has no previous year', () => {
    expect(B.copyFromPrevious(sample(), '2026', 0)).toBeNull();
  });
  it('mark paid as budgeted only touches bills and savings with a budget', () => {
    const d = B.fillPaidFromBudget(sample(), '2026', 10);
    expect(d.years[2026][10].spent).toEqual({ rent: 1450, electric: 95, car_ins: 128, roth: 500 });
  });
  it('apply budget to all months replaces the other months’ budget amounts', () => {
    const d = B.applyBudgetToYear(sample(), '2026', 10);
    expect(d.years[2026][0].expenses).toEqual(d.years[2026][10].expenses);
    expect(d.years[2026][0].expenses).not.toBe(d.years[2026][10].expenses);
    expect(d.years[2026][0].spent).toEqual({});
  });
  it('adds and removes transactions without touching anything else', () => {
    const d0 = sample();
    const { data: d1, tx } = B.addTransaction(d0, '2026', 10, 'gas', { desc: 'BP', amount: 40, date: '2026-11-21' });
    expect(d1.years[2026][10].transactions.gas.at(-1)).toEqual({ id: tx.id, desc: 'BP', amount: 40, date: '2026-11-21' });
    expect(d1.years[2026][9]).toBe(d0.years[2026][9]);
    const d2 = B.removeTransaction(d1, '2026', 10, 'gas', tx.id);
    expect(d2.years[2026][10].transactions.gas).toEqual(d0.years[2026][10].transactions.gas);
  });
  it('new ids never repeat, even in the same millisecond', () => {
    const ids = new Set(Array.from({ length: 50 }, () => B.stamp()));
    expect(ids.size).toBe(50);
  });
  it('adding a year uses the starting categories', () => {
    let d = B.setStartingCategories(sample(), [{ id: 'food_1', label: 'Food' }]);
    d = B.addYear(d, 2027);
    expect(d.years[2027][3].variableCategories).toEqual([{ id: 'food_1', label: 'Food' }]);
    expect(B.addYear(d, 2027)).toBe(d); // already exists: unchanged
    expect(B.addYear(d, 'abc')).toBe(d);
  });
});

describe('hidden bills', () => {
  it('stay visible in months where they have amounts and keep counting', () => {
    let d = sample();
    d = B.setItemHidden(d, 'fixed', 'housing', 'electric', true);
    const nov = d.years[2026][10];
    const dec = d.years[2026][11];
    expect(B.visibleGroups(d.categories.fixed, nov)[0].items.map((i) => i.id)).toContain('electric');
    expect(B.visibleGroups(d.categories.fixed, dec)[0].items.map((i) => i.id)).not.toContain('electric');
    expect(B.calcStats(d, [nov]).spent).toBe(B.calcStats(sample(), [nov]).spent);
    d = B.setItemHidden(d, 'fixed', 'housing', 'electric', false);
    expect(d.categories.fixed[0].items.find((i) => i.id === 'electric')).toEqual({ id: 'electric', label: 'Electric' });
  });
});

describe('quick add', () => {
  it('reads amount and store from one line', () => {
    expect(B.parseQuickLine('45.20 costco')).toEqual({ amount: 45.2, store: 'Costco' });
    expect(B.parseQuickLine('Trader Joe’s $12')).toEqual({ amount: 12, store: 'Trader Joe’s' });
    expect(B.parseQuickLine('7,5 coffee')).toEqual({ amount: 7.5, store: 'Coffee' });
    expect(B.parseQuickLine('shell')).toEqual({ amount: null, store: 'Shell' });
  });
  it('remembers the category each store was last used with', () => {
    const d = normalizeData(sample());
    d.years[2026][9].variableCategories = [{ id: 'g2', label: 'Groceries' }, { id: 'fun', label: 'Fun' }];
    d.years[2026][9].transactions = { fun: [{ id: 9, desc: 'costco', amount: 20 }] };
    const idx = B.storeIndex(d);
    expect(idx.get('costco')).toMatchObject({ desc: 'Costco', catLabel: 'Groceries', count: 2 }); // November (later) wins
    expect(idx.get('orphan')).toBeUndefined(); // purchases in deleted categories are ignored
    expect(B.recentStores(idx).map((s) => s.desc)[0]).toBe('Costco');
    expect(B.findCategoryByLabel(d.years[2026][10], 'groceries')).toEqual({ id: 'groceries', label: 'Groceries' });
  });
});

import { describe, expect, it } from 'vitest';
import * as W from './worth.js';
import { createDefaultData } from './model.js';
import { calcStats, currentValue } from './budget.js';

function sample() {
  const d = createDefaultData(2026);
  d.assets.push(
    { id: 1, label: 'Checking', type: 'Asset', history: [{ date: '2026-01-01', value: 1000 }, { date: '2026-03-01', value: 3000 }] },
    { id: 2, label: 'Car', history: [{ date: '2026-02-01', value: 9000 }] },
  );
  d.debts.push({ id: 'card_1', label: 'Card', history: [{ date: '2026-01-01', value: 1200 }] });
  const m = d.years[2026][2];
  m.income.push({ label: 'Pay', amount: 4000 });
  Object.assign(m.spent, { rent: 1400, roth: 300 });
  m.transactions.groceries = [{ id: 1, desc: 'Costco', amount: 200 }];
  m.debts.card_1 = { payment: 150 };
  d.years[2026][5].spent.roth = 200;
  return d;
}

describe('assets and debts', () => {
  it('adds an item with its first value and keeps the original shape', () => {
    const { item, data } = W.addWorthItem(sample(), 'debts', { label: 'Car loan', value: 9840, date: '2026-11-21', apr: 6.4, payment: 342.18 });
    expect(item).toMatchObject({ label: 'Car loan', apr: 6.4, payment: 342.18, history: [{ date: '2026-11-21', value: 9840 }] });
    expect(data.debts).toHaveLength(2);
    const { item: a } = W.addWorthItem(sample(), 'assets', { label: 'Savings', value: 500, date: '2026-11-21', cash: false });
    expect(a).not.toHaveProperty('cash');
  });

  it('logs and deletes history by stored position, and undo puts it back', () => {
    let d = W.addHistory(sample(), 'assets', 1, { date: '2026-02-01', value: 2000 });
    expect(W.historyRows(d.assets[0]).map((r) => r.entry.value)).toEqual([3000, 2000, 1000]);
    const row = W.historyRows(d.assets[0])[1]; // Feb, stored at index 2
    expect(row.index).toBe(2);
    const removed = W.removeHistory(d, 'assets', 1, row.index);
    expect(removed.assets[0].history.map((h) => h.value)).toEqual([1000, 3000]);
    expect(W.insertHistory(removed, 'assets', 1, row.index, row.entry).assets[0].history).toEqual(d.assets[0].history);
  });

  it('sets and clears optional fields without touching others', () => {
    let d = W.setWorthField(sample(), 'assets', 1, 'cash', true);
    expect(d.assets[0]).toMatchObject({ cash: true, type: 'Asset' });
    d = W.setWorthField(d, 'assets', 1, 'cash', false);
    expect(d.assets[0]).not.toHaveProperty('cash');
    expect(d.assets[0].type).toBe('Asset');
  });

  it('removes and re-inserts an item in the same place', () => {
    const d = sample();
    const r = W.removeWorthItem(d, 'assets', 1);
    expect(r.data.assets.map((a) => a.id)).toEqual([2]);
    expect(W.insertWorthItem(r.data, 'assets', r.index, r.item).assets).toEqual(d.assets);
  });

  it('cash total only counts cash accounts', () => {
    const d = W.setWorthField(sample(), 'assets', 1, 'cash', true);
    expect(W.cashTotal(d)).toBe(3000);
  });
});

describe('payoff planner', () => {
  const debts = [
    { id: 'car', label: 'Car', balance: 9840, apr: 6.4, payment: 342.18 },
    { id: 'cc', label: 'Card', balance: 1280, apr: 22.9, payment: 200 },
  ];

  it('pays everything off and extra money helps', () => {
    const base = W.simulatePayoff(debts, 0);
    const extra = W.simulatePayoff(debts, 150);
    expect(base.done && extra.done).toBe(true);
    expect(extra.months).toBeLessThan(base.months);
    expect(extra.interest).toBeLessThan(base.interest);
  });

  it('avalanche never costs more interest than snowball', () => {
    const a = W.simulatePayoff([{ ...debts[0], balance: 900, payment: 50 }, debts[1]], 100, 'avalanche');
    const s = W.simulatePayoff([{ ...debts[0], balance: 900, payment: 50 }, debts[1]], 100, 'snowball');
    expect(a.interest).toBeLessThanOrEqual(s.interest + 0.01);
    expect(a.order[0].id).toBe('cc');
    expect(s.order[0].id).toBe('car');
  });

  it('with no interest, months is balance over payment', () => {
    expect(W.simulatePayoff([{ id: 'x', label: 'X', balance: 1000, apr: 0, payment: 100 }], 0)).toMatchObject({ months: 10, interest: 0, done: true });
  });

  it('reports when payments never cover the interest', () => {
    const r = W.simulatePayoff([{ id: 'x', label: 'X', balance: 10000, apr: 24, payment: 100 }], 0);
    expect(r.done).toBe(false);
  });

  it('uses the payment you set, then your latest Budget payment, then an estimate', () => {
    const d = sample();
    expect(W.planPayment(d, d.debts[0])).toMatchObject({ amount: 150, source: 'budget' });
    expect(W.planPayment(d, { ...d.debts[0], payment: 300 })).toMatchObject({ amount: 300, source: 'set' });
    expect(W.planPayment(d, { id: 'other', history: [{ date: '2026-01-01', value: 500 }] })).toMatchObject({ amount: 25, source: 'estimate' });
  });

  it('reads an old-style rate from the first history entry', () => {
    expect(W.debtApr({ history: [{ date: '2026-01-01', value: 1, rate: 19.9 }] })).toBe(19.9);
    expect(W.debtApr({ apr: 5, history: [{ rate: 19.9 }] })).toBe(5);
  });
});

describe('goals', () => {
  it('adds a goal in the original shape and links it to a bucket', () => {
    const { goal, data } = W.addGoal(sample(), { label: 'Trip', target: 1000, bucketId: 'roth' });
    expect(goal).toMatchObject({ label: 'Trip', target: 1000, saved: 0, bucketId: 'roth' });
    expect(typeof goal.id).toBe('number');
    expect(W.goalProgress(data, goal)).toBe(500); // 300 + 200 saved into Roth
    const withCash = W.addGoalCash(data, goal.id, 50);
    expect(W.goalProgress(withCash, withCash.savingsGoals[0])).toBe(550);
  });

  it('manual goals only count added cash', () => {
    const { goal, data } = W.addGoal(sample(), { label: 'Laptop', target: 1800 });
    expect(goal).not.toHaveProperty('bucketId');
    expect(W.goalProgress(W.addGoalCash(data, goal.id, 640), { ...goal, saved: 640 })).toBe(640);
  });

  it('edits, removes and restores a goal', () => {
    const { goal, data } = W.addGoal(sample(), { label: 'Trip', target: 1000, bucketId: 'roth' });
    const edited = W.editGoal(data, goal.id, { label: 'Japan', target: 4000, bucketId: '' });
    expect(edited.savingsGoals[0]).toEqual({ id: goal.id, label: 'Japan', target: 4000, saved: 0 });
    const r = W.removeGoal(edited, goal.id);
    expect(r.data.savingsGoals).toEqual([]);
    expect(W.insertGoal(r.data, r.index, r.goal).savingsGoals).toEqual(edited.savingsGoals);
  });
});

describe('analytics', () => {
  it('filters months by year and month', () => {
    const d = sample();
    expect(W.filterMonths(d, 'all')).toHaveLength(12);
    expect(W.filterMonths(d, '2026', 2).map((e) => e.m)).toEqual([2]);
    expect(W.filterMonths(d, '2019')).toEqual([]);
  });

  it('matches the original totals and averages over months with entries', () => {
    const d = sample();
    const entries = W.filterMonths(d, '2026');
    const s = W.analyticsSummary(d, entries);
    expect(s.spent).toBe(calcStats(d, entries.map((e) => e.month)).spent);
    expect(s.activeMonths).toBe(2);
    expect(s.avgSpend).toBeCloseTo(s.spent / 2);
    expect(s.dti).toBeCloseTo((150 / 4000) * 100);
    expect(s.runway).toBe(0);
    expect(s.hasCashAccounts).toBe(false);
  });

  it('breaks spending down without savings', () => {
    const d = sample();
    const rows = W.spendingBreakdown(d, W.filterMonths(d, '2026'));
    expect(rows.map((r) => [r.label, r.value])).toEqual([['Housing', 1400], ['Groceries', 200], ['Card payment', 150]]);
    expect(W.savingsBreakdown(d, W.filterMonths(d, '2026')).map((r) => [r.label, r.value])).toEqual([['Roth IRA', 500]]);
  });

  it('net worth helpers still read the latest entry', () => {
    expect(currentValue(sample().assets[0])).toBe(3000);
  });
});

import { describe, expect, it } from 'vitest';
import { createDefaultData, normalizeData, summarize } from './model.js';

// A document shaped exactly like the original app saves it (months keyed "0".."11").
const legacyDoc = () => ({
  categories: {
    fixed: [{ id: 'housing', label: 'Housing', items: [{ id: 'rent', label: 'Rent' }] }],
    savings: [{ id: 'buckets', label: 'Buckets', items: [{ id: 'roth', label: 'Roth IRA' }] }],
  },
  assets: [{ id: 1700000000000, label: 'Checking', history: [{ date: '2025-01-01', value: 1200 }] }],
  debts: [{ id: 'carloan_1', label: 'Car loan', history: [{ date: '2025-01-01', value: 9000 }] }],
  savingsGoals: [{ id: 1, label: 'Laptop', target: 1500, saved: 200 }],
  years: {
    2025: {
      0: {
        income: [{ label: 'Paycheck', amount: 2400 }],
        expenses: { rent: 1400, groceries: 400 },
        spent: { rent: 1400 },
        transactions: { groceries: [{ id: 1, desc: 'Costco', amount: 120.5 }] },
        debts: { carloan_1: { payment: 300 } },
        variableCategories: [{ id: 'groceries', label: 'Groceries' }],
      },
      1: { income: [], expenses: {}, spent: {}, transactions: {}, debts: {} }, // missing variableCategories
    },
  },
  preferences: { darkMode: true },
  someFutureField: { keep: 'me' },
});

describe('normalizeData', () => {
  it('keeps every existing field and value untouched', () => {
    const raw = legacyDoc();
    const n = normalizeData(raw);
    expect(n.someFutureField).toEqual({ keep: 'me' });
    expect(n.assets).toEqual(raw.assets);
    expect(n.debts).toEqual(raw.debts);
    expect(n.savingsGoals).toEqual(raw.savingsGoals);
    expect(n.categories).toEqual(raw.categories);
    expect(n.preferences).toEqual({ darkMode: true });
    expect(n.years[2025][0]).toEqual(raw.years[2025][0]);
  });

  it('fills missing months and fields without inventing data', () => {
    const n = normalizeData(legacyDoc());
    expect(Object.keys(n.years[2025])).toHaveLength(12);
    expect(n.years[2025][1].variableCategories).toEqual([]);
    expect(n.years[2025][11]).toMatchObject({ income: [], expenses: {}, spent: {}, transactions: {}, debts: {} });
  });

  it('does not mutate its input', () => {
    const raw = legacyDoc();
    const copy = JSON.parse(JSON.stringify(raw));
    normalizeData(raw);
    expect(raw).toEqual(copy);
  });

  it('copes with an empty or missing document', () => {
    const n = normalizeData(undefined);
    expect(n).toMatchObject({ assets: [], debts: [], savingsGoals: [], years: {}, preferences: { darkMode: false } });
    expect(n.categories).toEqual({ fixed: [], savings: [] });
  });

  it('round-trips through JSON (what Firestore stores) unchanged', () => {
    const once = normalizeData(legacyDoc());
    const twice = normalizeData(JSON.parse(JSON.stringify(once)));
    expect(twice).toEqual(once);
  });
});

describe('createDefaultData', () => {
  it('matches the original app’s starting data', () => {
    const d = createDefaultData(2026);
    expect(d.categories.fixed.map((g) => g.id)).toEqual(['housing', 'insurance']);
    expect(d.categories.savings[0].items[0].id).toBe('roth');
    expect(Object.keys(d.years)).toEqual(['2026']);
    expect(d.years[2026][5].variableCategories.map((c) => c.id)).toEqual(['groceries', 'gas']);
  });
});

describe('summarize', () => {
  it('counts what is in the document', () => {
    expect(summarize(legacyDoc())).toEqual({
      years: ['2025'],
      monthsWithData: 1,
      transactions: 1,
      incomeEntries: 1,
      billGroups: 1,
      bills: 1,
      savingsBuckets: 1,
      assets: 1,
      debts: 1,
      goals: 1,
    });
  });
});

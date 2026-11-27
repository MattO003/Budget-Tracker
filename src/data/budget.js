// Budget math and changes. Every change function is pure: (data, ...) => newData.
// Calculations are ported exactly from the original app (legacy/index.html) so
// totals match what you saw before.
import { DEFAULT_STARTING_CATEGORIES, emptyYear } from './model.js';

const num = (v) => Number(v) || 0;
const sumBy = (list, f) => (list || []).reduce((s, x) => s + f(x), 0);

/* ---------------- ids ---------------- */

let lastStamp = 0;
/** Increasing timestamp, unique even when called twice in the same millisecond. */
export function stamp() {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return lastStamp;
}
/** Same id style as the original app: "groceries_1732190000000". */
export const makeId = (label) => `${String(label).toLowerCase().replace(/[^a-z0-9]/g, '')}_${stamp()}`;

/* ---------------- reading ---------------- */

export const yearsOf = (data) => Object.keys(data.years).sort();
export const getMonth = (data, year, m) => data.years[year]?.[m];
export const catSpent = (month, catId) => sumBy(month.transactions?.[catId], (t) => num(t.amount));
export const monthIncome = (month) => sumBy(month.income, (i) => num(i.amount));

/** Exact port of the original calculateStats(). */
export function calcStats(data, months) {
  const s = { income: 0, budgeted: 0, spent: 0, saved: 0, debtPaid: 0 };
  for (const m of months) {
    if (!m) continue;
    s.income += monthIncome(m);
    for (const g of data.categories.fixed) for (const c of g.items || []) {
      s.budgeted += num(m.expenses[c.id]);
      s.spent += num(m.spent[c.id]);
    }
    for (const c of m.variableCategories || []) {
      s.budgeted += num(m.expenses[c.id]);
      s.spent += catSpent(m, c.id);
    }
    for (const g of data.categories.savings) for (const c of g.items || []) {
      s.budgeted += num(m.expenses[c.id]);
      s.saved += num(m.spent[c.id]);
    }
    for (const d of data.debts) {
      const p = num(m.debts?.[d.id]?.payment);
      s.debtPaid += p;
      s.spent += p;
    }
  }
  s.remaining = s.income - (s.spent + s.saved);
  s.rate = s.income > 0 ? (s.saved / s.income) * 100 : 0;
  return s;
}

export const monthsOfYear = (data, year) => Array.from({ length: 12 }, (_, i) => data.years[year]?.[i]).filter(Boolean);

/** Per-section totals for one month (for the section headers). */
export function monthSections(data, m) {
  let billsBudget = 0, billsPaid = 0, saveBudget = 0, saved = 0;
  for (const g of data.categories.fixed) for (const c of g.items || []) { billsBudget += num(m.expenses[c.id]); billsPaid += num(m.spent[c.id]); }
  for (const g of data.categories.savings) for (const c of g.items || []) { saveBudget += num(m.expenses[c.id]); saved += num(m.spent[c.id]); }
  const varBudget = sumBy(m.variableCategories, (c) => num(m.expenses[c.id]));
  const varSpent = sumBy(m.variableCategories, (c) => catSpent(m, c.id));
  const debtPaid = sumBy(data.debts, (d) => num(m.debts?.[d.id]?.payment));
  return { billsBudget, billsPaid, saveBudget, saved, varBudget, varSpent, debtPaid };
}

/** Does this month have any amount for an item? Hidden items still show where they do. */
export const itemHasAmounts = (m, id) => num(m.expenses[id]) !== 0 || num(m.spent[id]) !== 0;

/** Groups/items to show in a given month: hidden ones only where they have amounts. */
export function visibleGroups(groups, m) {
  return groups
    .map((g) => ({ ...g, items: (g.items || []).filter((i) => !(i.archived || g.archived) || itemHasAmounts(m, i.id)) }))
    .filter((g) => g.items.length > 0 || !g.archived);
}

/** Latest value in an asset/debt history (same as the original getCurrentValue). */
export function currentValue(item) {
  const h = item.history || [];
  if (!h.length) return 0;
  return num([...h].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0].value);
}
export function valueAtDate(item, date) {
  const valid = (item.history || []).filter((h) => String(h.date) <= date);
  if (!valid.length) return 0;
  return num(valid.sort((a, b) => String(b.date).localeCompare(String(a.date)))[0].value);
}
/** [{date, assets, debts, net}] at every date anything was logged (as the original chart). */
export function netWorthSeries(data) {
  const dates = [...new Set([...data.assets, ...data.debts].flatMap((i) => (i.history || []).map((h) => h.date)))].filter(Boolean).sort();
  return dates.map((date) => {
    const assets = sumBy(data.assets, (a) => valueAtDate(a, date));
    const debts = sumBy(data.debts, (d) => valueAtDate(d, date));
    return { date, assets, debts, net: assets - debts };
  });
}
export const totalAssets = (data) => sumBy(data.assets, currentValue);
export const totalDebts = (data) => sumBy(data.debts, currentValue);

/* ---------------- month changes ---------------- */

export const updateMonth = (data, year, m, fn) => ({
  ...data,
  years: { ...data.years, [year]: { ...data.years[year], [m]: fn(data.years[year][m]) } },
});

export const setBudget = (data, year, m, id, value) =>
  updateMonth(data, year, m, (mo) => ({ ...mo, expenses: { ...mo.expenses, [id]: value } }));
export const setPaid = (data, year, m, id, value) =>
  updateMonth(data, year, m, (mo) => ({ ...mo, spent: { ...mo.spent, [id]: value } }));
export const setDebtPayment = (data, year, m, debtId, value) =>
  updateMonth(data, year, m, (mo) => ({ ...mo, debts: { ...mo.debts, [debtId]: { ...(mo.debts?.[debtId] || {}), payment: value } } }));

export const addIncome = (data, year, m, label, amount) =>
  updateMonth(data, year, m, (mo) => ({ ...mo, income: [...mo.income, { label, amount }] }));
export const removeIncome = (data, year, m, index) =>
  updateMonth(data, year, m, (mo) => ({ ...mo, income: mo.income.filter((_, i) => i !== index) }));
export const insertIncome = (data, year, m, index, entry) =>
  updateMonth(data, year, m, (mo) => { const income = [...mo.income]; income.splice(index, 0, entry); return { ...mo, income }; });

export function addTransaction(data, year, m, catId, { desc, amount, date }) {
  const tx = { id: stamp(), desc, amount, ...(date ? { date } : {}) };
  return { tx, data: updateMonth(data, year, m, (mo) => ({ ...mo, transactions: { ...mo.transactions, [catId]: [...(mo.transactions[catId] || []), tx] } })) };
}
export const removeTransaction = (data, year, m, catId, txId) =>
  updateMonth(data, year, m, (mo) => ({ ...mo, transactions: { ...mo.transactions, [catId]: (mo.transactions[catId] || []).filter((t) => t.id !== txId) } }));
export const insertTransaction = (data, year, m, catId, index, tx) =>
  updateMonth(data, year, m, (mo) => { const list = [...(mo.transactions[catId] || [])]; list.splice(index, 0, tx); return { ...mo, transactions: { ...mo.transactions, [catId]: list } }; });

export function addSpendingCategory(data, year, m, label) {
  const cat = { id: makeId(label), label };
  return { cat, data: updateMonth(data, year, m, (mo) => ({ ...mo, variableCategories: [...mo.variableCategories, cat] })) };
}
/** Same as the original: removes the category from this month only; its purchases stay stored but stop counting. */
export const removeSpendingCategory = (data, year, m, catId) =>
  updateMonth(data, year, m, (mo) => ({ ...mo, variableCategories: mo.variableCategories.filter((c) => c.id !== catId) }));
export const insertSpendingCategory = (data, year, m, index, cat) =>
  updateMonth(data, year, m, (mo) => { const list = [...mo.variableCategories]; list.splice(index, 0, cat); return { ...mo, variableCategories: list }; });

export const previousMonth = (year, m) => (m === 0 ? { year: String(Number(year) - 1), m: 11 } : { year: String(year), m: m - 1 });
export const nextMonth = (year, m) => (m === 11 ? { year: String(Number(year) + 1), m: 0 } : { year: String(year), m: m + 1 });

const hasPurchases = (month, catId) => (month.transactions?.[catId] || []).length > 0;
const labelKey = (label) => String(label ?? '').trim().toLowerCase();

/**
 * "Copy from previous month": copies spending categories and budget amounts.
 * Returns null if there's no previous month.
 *
 * The original replaced this month's category list outright, so a category
 * that already had purchases dropped out and its purchases stopped counting.
 * Now a category with purchases is kept:
 * if the previous month has one with the same name, this month's takes its
 * place and gets its budget; otherwise it's added after the copied ones.
 */
export function copyFromPrevious(data, year, m) {
  const p = previousMonth(year, m);
  const prev = data.years[p.year]?.[p.m];
  if (!prev) return null;
  return updateMonth(data, year, m, (mo) => {
    const expenses = { ...mo.expenses, ...prev.expenses };
    const keep = mo.variableCategories.filter((c) => hasPurchases(mo, c.id));
    const list = (prev.variableCategories || []).map((pc) => {
      const mine = keep.find((c) => c.id === pc.id) || keep.find((c) => labelKey(c.label) === labelKey(pc.label));
      if (!mine || mine.id === pc.id) return pc;
      if (prev.expenses?.[pc.id] !== undefined) expenses[mine.id] = prev.expenses[pc.id];
      return mine;
    });
    for (const c of keep) if (!list.some((x) => x.id === c.id)) list.push(c);
    return { ...mo, variableCategories: list, expenses };
  });
}

/** Best name for a category id that's no longer listed: its name in any other month, else from the id ("vacation_123" → "Vacation"). */
function labelForCategoryId(data, catId) {
  const lists = [
    ...Object.values(data.years).flatMap((y) => Object.values(y).map((mo) => mo?.variableCategories || [])),
    data.categories.startingVariable || [],
    Array.isArray(data.categories.variable) ? data.categories.variable : [],
  ];
  for (const list of lists) {
    const found = list.find((c) => c?.id === catId && String(c.label ?? '').trim());
    if (found) return String(found.label).trim();
  }
  const base = String(catId).replace(/_\d+$/, '').replace(/_/g, ' ').trim() || String(catId);
  return base[0].toUpperCase() + base.slice(1);
}

/**
 * Purchases filed under a category that is no longer in that month's list.
 * Neither this app nor the original counts or shows them.
 * Returns [{year, m, catId, label, count, total}].
 */
export function hiddenPurchases(data) {
  const out = [];
  for (const y of yearsOf(data)) {
    for (let m = 0; m < 12; m++) {
      const mo = data.years[y][m];
      if (!mo) continue;
      const listed = new Set((mo.variableCategories || []).map((c) => c.id));
      for (const [catId, list] of Object.entries(mo.transactions || {})) {
        if (listed.has(catId) || !Array.isArray(list) || list.length === 0) continue;
        out.push({ year: y, m, catId, label: labelForCategoryId(data, catId), count: list.length, total: sumBy(list, (t) => num(t.amount)) });
      }
    }
  }
  return out;
}

/** Put a dropped category back in its month (same id), so its purchases and budget count again. */
export function restoreHiddenCategory(data, year, m, catId, label) {
  const mo = data.years[year]?.[m];
  if (!mo || mo.variableCategories.some((c) => c.id === catId)) return data;
  return updateMonth(data, year, m, (x) => ({ ...x, variableCategories: [...x.variableCategories, { id: catId, label }] }));
}

/** Original "Match Spent to Budget": paid = budget for every bill and savings bucket with a budget. */
export function fillPaidFromBudget(data, year, m) {
  return updateMonth(data, year, m, (mo) => {
    const spent = { ...mo.spent };
    for (const type of ['fixed', 'savings'])
      for (const g of data.categories[type]) for (const i of g.items || []) if (mo.expenses[i.id]) spent[i.id] = mo.expenses[i.id];
    return { ...mo, spent };
  });
}

/** Original "Apply Budget to All Months": every other month of the year gets this month's budget amounts. */
export function applyBudgetToYear(data, year, sourceM) {
  const src = data.years[year][sourceM].expenses;
  const y = { ...data.years[year] };
  for (let i = 0; i < 12; i++) if (i !== sourceM) y[i] = { ...y[i], expenses: { ...src } };
  return { ...data, years: { ...data.years, [year]: y } };
}

export const startingCategories = (data) => data.categories.startingVariable ?? DEFAULT_STARTING_CATEGORIES;

export function addYear(data, year) {
  const key = String(year);
  if (!/^\d{4}$/.test(key) || data.years[key]) return data;
  return { ...data, years: { ...data.years, [key]: emptyYear(startingCategories(data)) } };
}
export function deleteYear(data, year) {
  const years = { ...data.years };
  delete years[year];
  return { ...data, years };
}

/* ---------------- bills & savings buckets (shared by every month) ---------------- */

const mapGroups = (data, type, fn) => ({ ...data, categories: { ...data.categories, [type]: fn(data.categories[type]) } });

export const addGroup = (data, type, label) => mapGroups(data, type, (gs) => [...gs, { id: makeId(label), label, items: [] }]);
export const renameGroup = (data, type, groupId, label) => mapGroups(data, type, (gs) => gs.map((g) => (g.id === groupId ? { ...g, label } : g)));
export const setGroupHidden = (data, type, groupId, hidden) =>
  mapGroups(data, type, (gs) => gs.map((g) => (g.id === groupId ? withFlag(g, 'archived', hidden) : g)));
export const deleteGroup = (data, type, groupId) => mapGroups(data, type, (gs) => gs.filter((g) => g.id !== groupId));

export const addItem = (data, type, groupId, label) =>
  mapGroups(data, type, (gs) => gs.map((g) => (g.id === groupId ? { ...g, items: [...(g.items || []), { id: makeId(label), label }] } : g)));
const mapItem = (data, type, groupId, itemId, fn) =>
  mapGroups(data, type, (gs) => gs.map((g) => (g.id === groupId ? { ...g, items: g.items.map((i) => (i.id === itemId ? fn(i) : i)) } : g)));
export const renameItem = (data, type, groupId, itemId, label) => mapItem(data, type, groupId, itemId, (i) => ({ ...i, label }));
export const setItemHidden = (data, type, groupId, itemId, hidden) => mapItem(data, type, groupId, itemId, (i) => withFlag(i, 'archived', hidden));
export const deleteItem = (data, type, groupId, itemId) =>
  mapGroups(data, type, (gs) => gs.map((g) => (g.id === groupId ? { ...g, items: g.items.filter((i) => i.id !== itemId) } : g)));

/** Set a boolean flag, removing the field entirely when false (keeps documents tidy). */
function withFlag(obj, key, on) {
  const next = { ...obj };
  if (on) next[key] = true;
  else delete next[key];
  return next;
}

export const setStartingCategories = (data, list) => ({ ...data, categories: { ...data.categories, startingVariable: list } });

/* ---------------- quick add: store memory ---------------- */

/**
 * Every store you've logged, newest last: Map(lowercase name → {desc, catLabel, count, order}).
 * The category remembered is the one used most recently.
 */
export function storeIndex(data) {
  const map = new Map();
  let order = 0;
  for (const y of yearsOf(data)) {
    for (let i = 0; i < 12; i++) {
      const m = data.years[y][i];
      if (!m) continue;
      const labels = Object.fromEntries((m.variableCategories || []).map((c) => [c.id, c.label]));
      const all = Object.entries(m.transactions || {}).flatMap(([catId, list]) =>
        labels[catId] ? (list || []).map((t) => ({ t, catLabel: labels[catId] })) : [],
      );
      all.sort((a, b) => String(a.t.date || '').localeCompare(String(b.t.date || '')) || num(a.t.id) - num(b.t.id));
      for (const { t, catLabel } of all) {
        const desc = String(t.desc ?? '').trim();
        const key = desc.toLowerCase();
        if (!key) continue;
        const prev = map.get(key);
        map.set(key, { desc, catLabel, count: (prev?.count || 0) + 1, order: ++order });
      }
    }
  }
  return map;
}

/** Most-used stores among recent purchases. */
export function recentStores(index, limit = 8, window = 200) {
  const all = [...index.values()];
  const cutoff = Math.max(0, all.reduce((mx, e) => Math.max(mx, e.order), 0) - window);
  return all
    .filter((e) => e.order > cutoff)
    .sort((a, b) => b.count - a.count || b.order - a.order)
    .slice(0, limit);
}

/** "45.20 costco" → {amount: 45.2, store: "Costco"}. Amount can be anywhere in the line. */
export function parseQuickLine(text) {
  const s = String(text ?? '');
  const match = s.match(/\$?\s*(\d+(?:[.,]\d{1,2})?)/);
  let amount = null;
  let rest = s;
  if (match) {
    amount = parseFloat(match[1].replace(',', '.'));
    rest = s.slice(0, match.index) + ' ' + s.slice(match.index + match[0].length);
  }
  rest = rest.replace(/\s+/g, ' ').trim();
  return { amount, store: rest ? rest[0].toUpperCase() + rest.slice(1) : '' };
}

/** Find a month's spending category by label (case-insensitive). */
export const findCategoryByLabel = (month, label) =>
  (month?.variableCategories || []).find((c) => c.label.trim().toLowerCase() === String(label).trim().toLowerCase()) || null;

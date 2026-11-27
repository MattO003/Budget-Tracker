// Net worth, goals, the debt payoff planner and analytics.
// Every change function is pure: (data, ...) => newData.
import { calcStats, catSpent, currentValue, stamp, makeId, yearsOf } from './budget.js';

const num = (v) => Number(v) || 0;
const sumBy = (list, f) => (list || []).reduce((s, x) => s + f(x), 0);
/** Set a field, or remove it when the value is empty/false/0 (keeps old documents tidy). */
const withField = (obj, key, value) => {
  const next = { ...obj };
  if (value === null || value === undefined || value === false || value === '' || value === 0) delete next[key];
  else next[key] = value;
  return next;
};

/* ---------------- assets & debts ---------------- */
// kind is 'assets' or 'debts' (the arrays in the document).

const mapWorth = (data, kind, id, fn) => ({ ...data, [kind]: data[kind].map((x) => (x.id === id ? fn(x) : x)) });

/** A new asset or debt, optionally with its first logged value. */
export function newWorthItem(kind, { label, value, date, apr, payment, cash }) {
  let item = { id: makeId(label), label, history: value === null || value === undefined ? [] : [{ date, value: num(value) }] };
  if (kind === 'debts') {
    item = withField(item, 'apr', num(apr));
    item = withField(item, 'payment', num(payment));
  } else item = withField(item, 'cash', Boolean(cash));
  return item;
}
/** Add an asset or debt. Returns {item, data}. */
export function addWorthItem(data, kind, fields) {
  const item = newWorthItem(kind, fields);
  return { item, data: { ...data, [kind]: [...data[kind], item] } };
}
export const renameWorthItem = (data, kind, id, label) => mapWorth(data, kind, id, (x) => ({ ...x, label }));
/** Set apr / payment / cash on an item (empty value removes the field). */
export const setWorthField = (data, kind, id, field, value) => mapWorth(data, kind, id, (x) => withField(x, field, value));

export function removeWorthItem(data, kind, id) {
  const index = data[kind].findIndex((x) => x.id === id);
  return { index, item: data[kind][index], data: { ...data, [kind]: data[kind].filter((x) => x.id !== id) } };
}
export function insertWorthItem(data, kind, index, item) {
  const list = [...data[kind]];
  list.splice(Math.min(index, list.length), 0, item);
  return { ...data, [kind]: list };
}

export const addHistory = (data, kind, id, entry) =>
  mapWorth(data, kind, id, (x) => ({ ...x, history: [...(x.history || []), { date: entry.date, value: num(entry.value) }] }));
/** Remove by position in the stored history array (not the sorted view). */
export const removeHistory = (data, kind, id, index) =>
  mapWorth(data, kind, id, (x) => ({ ...x, history: (x.history || []).filter((_, i) => i !== index) }));
export const insertHistory = (data, kind, id, index, entry) =>
  mapWorth(data, kind, id, (x) => {
    const h = [...(x.history || [])];
    h.splice(Math.min(index, h.length), 0, entry);
    return { ...x, history: h };
  });

/** History newest first, each with its index in the stored array. */
export const historyRows = (item) =>
  (item.history || [])
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => String(b.entry.date).localeCompare(String(a.entry.date)) || b.index - a.index);

export const lastUpdated = (item) => historyRows(item)[0]?.entry.date || null;

/** Total of assets marked "counts as cash". */
export const cashTotal = (data) => sumBy(data.assets.filter((a) => a.cash), currentValue);

/* ---------------- debts for the planner ---------------- */

/** APR as a number. Older data may have a rate on the first history entry (read by the original planner). */
export const debtApr = (d) => num(d.apr ?? d.history?.[0]?.rate);

/** Most recent payment entered for this debt on the Budget page. */
export function lastBudgetPayment(data, debtId) {
  const years = yearsOf(data).reverse();
  for (const y of years) {
    for (let m = 11; m >= 0; m--) {
      const p = num(data.years[y][m]?.debts?.[debtId]?.payment);
      if (p > 0) return { amount: p, year: y, m };
    }
  }
  return null;
}

/** Monthly payment the planner uses: the one you set, else your latest from Budget, else an estimated minimum. */
export function planPayment(data, d) {
  if (num(d.payment) > 0) return { amount: num(d.payment), source: 'set' };
  const last = lastBudgetPayment(data, d.id);
  if (last) return { amount: last.amount, source: 'budget', ...last };
  return { amount: Math.max(currentValue(d) * 0.02, 25), source: 'estimate' };
}

/** Debts with a balance, in the shape simulatePayoff wants. */
export const planDebts = (data) =>
  data.debts
    .map((d) => ({ id: d.id, label: d.label, balance: currentValue(d), apr: debtApr(d), payment: planPayment(data, d) }))
    .filter((d) => d.balance > 0);

const MAX_MONTHS = 600;
/**
 * Month-by-month payoff. Each debt gets its payment; the extra plus any payment
 * freed up by a finished debt goes to the target debt (highest APR for
 * "avalanche", smallest balance for "snowball").
 * Returns {months, interest, order:[{id,label,month}], done}.
 */
export function simulatePayoff(debts, extra = 0, strategy = 'avalanche') {
  const ds = debts.map((d) => ({ id: d.id, label: d.label, bal: num(d.balance), apr: num(d.apr), pay: num(d.payment?.amount ?? d.payment) }));
  let month = 0;
  let interest = 0;
  const order = [];
  const finished = new Set();
  const markDone = () => ds.forEach((d) => {
    if (d.bal <= 0.005 && !finished.has(d.id)) {
      finished.add(d.id);
      d.bal = 0;
      order.push({ id: d.id, label: d.label, month });
    }
  });
  markDone();
  while (ds.some((d) => d.bal > 0.005) && month < MAX_MONTHS) {
    month++;
    let pool = num(extra);
    for (const d of ds) {
      if (d.bal <= 0.005) { pool += d.pay; continue; }
      const i = (d.bal * d.apr) / 100 / 12;
      d.bal += i;
      interest += i;
      const p = Math.min(d.pay, d.bal);
      d.bal -= p;
      pool += d.pay - p;
    }
    const targets = ds
      .filter((d) => d.bal > 0.005)
      .sort(strategy === 'snowball' ? (a, b) => a.bal - b.bal || b.apr - a.apr : (a, b) => b.apr - a.apr || a.bal - b.bal);
    for (const t of targets) {
      if (pool <= 0) break;
      const p = Math.min(pool, t.bal);
      t.bal -= p;
      pool -= p;
    }
    markDone();
  }
  return { months: month, interest, order, done: ds.every((d) => d.bal <= 0.005) };
}

/* ---------------- savings goals ---------------- */

/** Every savings bucket, with its group label. */
export const allBuckets = (data) =>
  data.categories.savings.flatMap((g) => (g.items || []).map((i) => ({ id: i.id, label: i.label, group: g.label, archived: Boolean(i.archived || g.archived) })));

/** Everything ever saved into a bucket (its "Saved" amounts on the Budget page, all months). */
export function bucketTotal(data, bucketId) {
  let total = 0;
  for (const y of Object.values(data.years)) for (const m of Object.values(y)) total += num(m?.spent?.[bucketId]);
  return total;
}

/** Saved so far: money added by hand plus, when linked, everything saved into the bucket. */
export const goalProgress = (data, g) => num(g.saved) + (g.bucketId ? bucketTotal(data, g.bucketId) : 0);

const mapGoal = (data, id, fn) => ({ ...data, savingsGoals: data.savingsGoals.map((g) => (g.id === id ? fn(g) : g)) });

/** Same shape as the original app: {id, label, target, saved}; bucketId is new and optional. */
export function addGoal(data, { label, target, bucketId }) {
  const goal = withField({ id: stamp(), label, target: num(target), saved: 0 }, 'bucketId', bucketId || null);
  return { goal, data: { ...data, savingsGoals: [...data.savingsGoals, goal] } };
}
export const editGoal = (data, id, { label, target, bucketId }) =>
  mapGoal(data, id, (g) => withField({ ...g, label, target: num(target) }, 'bucketId', bucketId || null));
export const addGoalCash = (data, id, amount) => mapGoal(data, id, (g) => ({ ...g, saved: num(g.saved) + num(amount) }));
export function removeGoal(data, id) {
  const index = data.savingsGoals.findIndex((g) => g.id === id);
  return { index, goal: data.savingsGoals[index], data: { ...data, savingsGoals: data.savingsGoals.filter((g) => g.id !== id) } };
}
export function insertGoal(data, index, goal) {
  const list = [...data.savingsGoals];
  list.splice(Math.min(index, list.length), 0, goal);
  return { ...data, savingsGoals: list };
}

/* ---------------- analytics ---------------- */

/** Has anything been entered this month? */
export function monthHasEntries(m) {
  if (!m) return false;
  return (
    (m.income || []).length > 0 ||
    Object.values(m.transactions || {}).some((l) => (l || []).length > 0) ||
    Object.values(m.expenses || {}).some((v) => num(v) !== 0) ||
    Object.values(m.spent || {}).some((v) => num(v) !== 0) ||
    Object.values(m.debts || {}).some((v) => num(v?.payment) !== 0)
  );
}

/**
 * The months a filter covers, as [{year, m, month}].
 * year 'all' = every month of every year; monthIdx null = the whole year.
 */
export function filterMonths(data, year, monthIdx = null) {
  const years = year === 'all' ? yearsOf(data) : data.years[year] ? [String(year)] : [];
  const out = [];
  for (const y of years) {
    for (let m = 0; m < 12; m++) {
      if (monthIdx !== null && m !== monthIdx) continue;
      const month = data.years[y][m];
      if (month) out.push({ year: y, m, month });
    }
  }
  return out;
}

/**
 * Figures for a set of months. Totals are the original calculateStats; the
 * average spend divides by months that have entries (the original divided by
 * every month, so empty future months pulled the average down).
 */
export function analyticsSummary(data, entries) {
  const stats = calcStats(data, entries.map((e) => e.month));
  const active = entries.filter((e) => monthHasEntries(e.month)).length;
  const avgSpend = active > 0 ? stats.spent / active : 0;
  const cash = cashTotal(data);
  return {
    ...stats,
    activeMonths: active,
    avgSpend,
    dti: stats.income > 0 ? (stats.debtPaid / stats.income) * 100 : 0,
    cash,
    hasCashAccounts: data.assets.some((a) => a.cash),
    runway: avgSpend > 0 ? cash / avgSpend : null,
  };
}

/**
 * Where the money went: bills by group, spending by category name, and debt
 * payments, biggest first. Savings are left out (see savingsBreakdown).
 */
export function spendingBreakdown(data, entries) {
  const map = new Map();
  const add = (key, label, kind, v) => {
    if (!(v > 0)) return;
    const row = map.get(key) || { key, label, kind, value: 0 };
    row.value += v;
    map.set(key, row);
  };
  for (const { month: m } of entries) {
    for (const g of data.categories.fixed) add(`bill:${g.id}`, g.label, 'bills', sumBy(g.items, (c) => num(m.spent[c.id])));
    for (const c of m.variableCategories || []) add(`cat:${c.label.trim().toLowerCase()}`, c.label.trim(), 'spending', catSpent(m, c.id));
    for (const d of data.debts) add(`debt:${d.id}`, `${d.label} payment`, 'debt', num(m.debts?.[d.id]?.payment));
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

/** Saved into each bucket over these months, biggest first. */
export function savingsBreakdown(data, entries) {
  return allBuckets(data)
    .map((b) => ({ ...b, value: sumBy(entries, (e) => num(e.month.spent[b.id])) }))
    .filter((b) => b.value > 0)
    .sort((a, b) => b.value - a.value);
}

/** Income, spent and saved per month, for the bar chart. */
export const monthlyTotals = (data, entries) =>
  entries.map(({ year, m, month }) => {
    const s = calcStats(data, [month]);
    return { year, m, income: s.income, spent: s.spent, saved: s.saved, hasEntries: monthHasEntries(month) };
  });

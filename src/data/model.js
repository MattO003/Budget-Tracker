// Shape of the single Firestore document at users/{uid}.
//
// This MUST stay compatible with the original app (legacy/index.html):
//   - never rename or remove existing fields
//   - only add new optional fields
// The original app loads the whole document and saves it back whole, so it
// carries any new fields along untouched.
//
// Fields left in real data by older versions. Keep them, don't reuse their names:
//   preferences.theme        colour-scheme name from Update_21 (e.g. "ocean")
//   preferences.compactMode  boolean from Update_21
//   assets[].type            "Asset" on some assets (unused label)
//
// Fields added by this version (all optional):
//   preferences.appearance            'light' | 'dark' | 'system' (falls back to darkMode)
//   categories.startingVariable       [{id,label}] spending categories a newly added year starts with
//   categories.{fixed,savings}[].archived and .items[].archived
//                                     hidden from months where they have no amounts
//   years[y][m].transactions[c][].date  'YYYY-MM-DD' (older purchases have no date)

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export const DEFAULT_STARTING_CATEGORIES = [
  { id: 'groceries', label: 'Groceries' },
  { id: 'gas', label: 'Gas' },
];

export const emptyMonth = (starting = DEFAULT_STARTING_CATEGORIES) => ({
  income: [],
  expenses: {},
  spent: {},
  transactions: {},
  debts: {},
  variableCategories: starting.map((c) => ({ id: c.id, label: c.label })),
});

export const emptyYear = (starting = DEFAULT_STARTING_CATEGORIES) => {
  const y = {};
  for (let i = 0; i < 12; i++) y[i] = emptyMonth(starting);
  return y;
};

/** Same starting document the original app created for brand-new users. */
export const createDefaultData = (year = new Date().getFullYear()) => ({
  categories: {
    fixed: [
      { id: 'housing', label: 'Housing', items: [{ id: 'rent', label: 'Rent' }, { id: 'trash', label: 'Trash' }] },
      { id: 'insurance', label: 'Insurance', items: [{ id: 'car_ins', label: 'Car Insurance' }] },
    ],
    savings: [{ id: 'buckets', label: 'Buckets', items: [{ id: 'roth', label: 'Roth IRA' }] }],
  },
  assets: [],
  debts: [],
  savingsGoals: [],
  years: { [year]: emptyYear() },
  preferences: { darkMode: false },
});

function normalizeMonth(m) {
  const src = isObj(m) ? m : {};
  return {
    ...src,
    income: Array.isArray(src.income) ? src.income : [],
    expenses: isObj(src.expenses) ? src.expenses : {},
    spent: isObj(src.spent) ? src.spent : {},
    transactions: isObj(src.transactions) ? src.transactions : {},
    debts: isObj(src.debts) ? src.debts : {},
    variableCategories: Array.isArray(src.variableCategories) ? src.variableCategories : [],
  };
}

/**
 * Fill in anything missing so the UI can rely on the shape, without dropping or
 * renaming any field that is already there (unknown fields are kept as-is).
 * Pure: returns a new object, never mutates the input.
 */
export function normalizeData(raw) {
  const src = isObj(raw) ? raw : {};
  const categories = isObj(src.categories) ? src.categories : {};
  const years = {};
  if (isObj(src.years)) {
    for (const [year, y] of Object.entries(src.years)) {
      const yy = isObj(y) ? { ...y } : {};
      for (let i = 0; i < 12; i++) yy[i] = normalizeMonth(yy[i] ?? yy[String(i)]);
      years[year] = yy;
    }
  }
  return {
    ...src,
    categories: {
      ...categories,
      fixed: Array.isArray(categories.fixed) ? categories.fixed : [],
      savings: Array.isArray(categories.savings) ? categories.savings : [],
    },
    assets: Array.isArray(src.assets) ? src.assets : [],
    debts: Array.isArray(src.debts) ? src.debts : [],
    savingsGoals: Array.isArray(src.savingsGoals) ? src.savingsGoals : [],
    years,
    preferences: isObj(src.preferences) ? { darkMode: false, ...src.preferences } : { darkMode: false },
  };
}

/** Counts used to describe a dataset (data check panel, restore preview). */
export function summarize(data) {
  const d = normalizeData(data);
  const yearKeys = Object.keys(d.years).sort();
  let monthsWithData = 0;
  let transactions = 0;
  let incomeEntries = 0;
  for (const y of yearKeys) {
    for (let i = 0; i < 12; i++) {
      const m = d.years[y][i];
      const tx = Object.values(m.transactions).reduce((s, list) => s + (Array.isArray(list) ? list.length : 0), 0);
      const hasData =
        m.income.length > 0 || tx > 0 ||
        Object.values(m.expenses).some((v) => Number(v) > 0) ||
        Object.values(m.spent).some((v) => Number(v) > 0);
      if (hasData) monthsWithData++;
      transactions += tx;
      incomeEntries += m.income.length;
    }
  }
  return {
    years: yearKeys,
    monthsWithData,
    transactions,
    incomeEntries,
    billGroups: d.categories.fixed.length,
    bills: d.categories.fixed.reduce((s, g) => s + (g.items?.length || 0), 0),
    savingsBuckets: d.categories.savings.reduce((s, g) => s + (g.items?.length || 0), 0),
    assets: d.assets.length,
    debts: d.debts.length,
    goals: d.savingsGoals.length,
  };
}

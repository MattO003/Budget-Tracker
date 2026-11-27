export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** $1,234.56 (minus sign for negatives). */
export function money(n, decimals = 2) {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${v < -0.0049 ? '−' : ''}$${s}`;
}
export const money0 = (n) => money(n, 0);

/** "1,234.50", "$12", " 7 " → number (0 if not a number). */
export function parseAmount(text) {
  const v = parseFloat(String(text ?? '').replace(/[$,\s]/g, '').replace(/^−/, '-'));
  return Number.isFinite(v) ? v : 0;
}

export const pad2 = (n) => String(n).padStart(2, '0');
export const isoDate = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
export const todayISO = () => isoDate(new Date());

/** "2026-11-05" → "Nov 5" */
export function shortDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [, m, d] = iso.split('-');
  return `${MONTHS_SHORT[Number(m) - 1]} ${Number(d)}`;
}

/** Default date for something logged in a given month: today if it's this month, else the same day-of-month (clamped). */
export function defaultDateIn(year, monthIdx, now = new Date()) {
  const y = Number(year);
  if (y === now.getFullYear() && monthIdx === now.getMonth()) return isoDate(now);
  const last = new Date(y, monthIdx + 1, 0).getDate();
  return `${y}-${pad2(monthIdx + 1)}-${pad2(Math.min(now.getDate(), last))}`;
}

export const percent = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

/** Short axis label: $950, $12k, $1.2M (minus sign for negatives). */
export function moneyShort(n) {
  const v = Number(n) || 0;
  const a = Math.abs(v);
  const sign = v < 0 ? '−' : '';
  if (a >= 1e6) return `${sign}$${+(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e3) return `${sign}$${+(a / 1e3).toFixed(a >= 1e4 ? 0 : 1)}k`;
  return `${sign}$${Math.round(a)}`;
}

/** "2026-11-05" → "Nov 5, 2026" */
export function longDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-');
  return `${MONTHS_SHORT[Number(m) - 1]} ${Number(d)}, ${y}`;
}

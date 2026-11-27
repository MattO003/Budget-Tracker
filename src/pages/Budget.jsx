import { useEffect, useState } from 'react';
import Icon from '../components/Icon.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { Money } from '../components/Money.jsx';
import { useToast } from '../components/Toasts.jsx';
import { MONTHS, pad2 } from '../lib/format.js';
import { href, subPage } from '../lib/router.js';
import * as B from '../data/budget.js';
import BudgetMonth from './BudgetMonth.jsx';

const monthKey = (y, m) => `${y}-${pad2(m + 1)}`;
const go = (sub) => {
  window.location.hash = href('budget', sub);
};

/** Which month/year to show: from the address (#/budget/2026-11 or #/budget/2026), else this month. */
function useBudgetView(data) {
  const [sub, setSub] = useState(subPage);
  useEffect(() => {
    const onHash = () => setSub(subPage());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const years = B.yearsOf(data);
  let mm = sub?.match(/^(\d{4})-(\d{2})$/);
  if (mm && data.years[mm[1]] && Number(mm[2]) >= 1 && Number(mm[2]) <= 12) return { mode: 'month', year: mm[1], m: Number(mm[2]) - 1 };
  mm = sub?.match(/^(\d{4})$/);
  if (mm && data.years[mm[1]]) return { mode: 'year', year: mm[1], m: 0 };
  const now = new Date();
  const thisYear = String(now.getFullYear());
  if (data.years[thisYear]) return { mode: 'month', year: thisYear, m: now.getMonth() };
  const last = years.at(-1);
  return last ? { mode: 'month', year: last, m: Number(last) < now.getFullYear() ? 11 : 0 } : { mode: 'none' };
}

function AddYearForm({ data, update, compact }) {
  const [value, setValue] = useState(() => {
    const ys = B.yearsOf(data).map(Number);
    return String(ys.length ? Math.max(...ys) + 1 : new Date().getFullYear());
  });
  const exists = Boolean(data.years[value]);
  return (
    <form
      className="inline-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^\d{4}$/.test(value) || exists) return;
        update((d) => B.addYear(d, value));
        go(`${value}-01`);
      }}
    >
      <input className="input" style={{ width: 100, flex: 'none' }} inputMode="numeric" maxLength={4} aria-label="Year to add" value={value} onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))} />
      <button className={`btn ${compact ? 'sm' : 'primary'}`} type="submit" disabled={!/^\d{4}$/.test(value) || exists}>
        <Icon name="plus" size={15} /> {exists ? `${value} exists` : `Add ${value}`}
      </button>
    </form>
  );
}

function YearView({ data, update, year }) {
  const toast = useToast();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rows = Array.from({ length: 12 }, (_, i) => ({ m: i, s: B.calcStats(data, [data.years[year][i]]) }));
  const total = B.calcStats(data, B.monthsOfYear(data, year));
  const rate = (s) => (s.income > 0 ? `${s.rate.toFixed(1)}%` : '—');
  return (
    <section className="card">
      <div className="card-head">
        <div><h2>{year} by month</h2><p className="sub">Select a month to open it</p></div>
        <div className="row">
          <AddYearForm data={data} update={update} compact />
          <button className="btn sm danger" type="button" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={14} /> Delete {year}</button>
        </div>
      </div>
      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr><th>Month</th><th className="r">Income</th><th className="r">Budgeted</th><th className="r">Spent</th><th className="r">Saved</th><th className="r">Left over</th><th className="r">Savings rate</th></tr>
          </thead>
          <tbody>
            {rows.map(({ m, s }) => (
              <tr key={m} className="click" tabIndex={0} onClick={() => go(monthKey(year, m))} onKeyDown={(e) => e.key === 'Enter' && go(monthKey(year, m))}>
                <td><b style={{ fontWeight: 550 }}>{MONTHS[m]}</b></td>
                <td className="r t-income"><Money value={s.income} decimals={0} /></td>
                <td className="r"><Money value={s.budgeted} decimals={0} /></td>
                <td className="r t-spend"><Money value={s.spent} decimals={0} /></td>
                <td className="r t-save"><Money value={s.saved} decimals={0} /></td>
                <td className={`r ${s.remaining < 0 ? 't-spend' : ''}`} style={{ fontWeight: 600 }}><Money value={s.remaining} decimals={0} /></td>
                <td className="r muted num">{rate(s)}</td>
              </tr>
            ))}
            <tr className="total">
              <td>Total</td>
              <td className="r t-income"><Money value={total.income} decimals={0} /></td>
              <td className="r"><Money value={total.budgeted} decimals={0} /></td>
              <td className="r t-spend"><Money value={total.spent} decimals={0} /></td>
              <td className="r t-save"><Money value={total.saved} decimals={0} /></td>
              <td className="r"><Money value={total.remaining} decimals={0} /></td>
              <td className="r num">{rate(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {confirmDelete && (
        <ConfirmDialog
          title={`Delete ${year}?`}
          danger
          confirmLabel={`Delete ${year}`}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => {
            const removed = data.years[year];
            update((d) => B.deleteYear(d, year));
            go('');
            toast(`Deleted ${year}`, { onUndo: () => update((d) => ({ ...d, years: { ...d.years, [year]: removed } })), duration: 10000 });
          }}
        >
          <p>This deletes every month of {year}: income, bills paid, purchases and savings. Your bills, buckets, assets and goals are kept.</p>
          <p className="muted small">You can undo for a few seconds afterwards, or restore from a backup.</p>
        </ConfirmDialog>
      )}
    </section>
  );
}

export default function Budget({ data, update }) {
  const view = useBudgetView(data);

  if (view.mode === 'none') {
    return (
      <div className="wrap">
        <div className="page-head"><div><p className="eyebrow">Budget</p><h1>Budget</h1></div></div>
        <section className="card pad stack tight measure">
          <h2>Add your first year</h2>
          <p className="muted">Each year has 12 months to budget. It starts with your usual spending categories.</p>
          <AddYearForm data={data} update={update} />
        </section>
      </div>
    );
  }

  const { mode, year, m } = view;
  let prev;
  let next;
  if (mode === 'month') {
    const p = B.previousMonth(year, m);
    const nx = B.nextMonth(year, m);
    prev = data.years[p.year] ? monthKey(p.year, p.m) : null;
    next = data.years[nx.year] ? monthKey(nx.year, nx.m) : null;
  } else {
    prev = data.years[String(Number(year) - 1)] ? String(Number(year) - 1) : null;
    next = data.years[String(Number(year) + 1)] ? String(Number(year) + 1) : null;
  }
  const title = mode === 'month' ? `${MONTHS[m]} ${year}` : `${year} overview`;

  return (
    <div className="wrap">
      <div className="page-head">
        <div className="monthnav">
          <button className="iconbtn" type="button" aria-label={mode === 'month' ? 'Previous month' : 'Previous year'} disabled={!prev} onClick={() => go(prev)}><Icon name="left" size={20} /></button>
          <h1>{title}</h1>
          <button className="iconbtn" type="button" aria-label={mode === 'month' ? 'Next month' : 'Next year'} disabled={!next} onClick={() => go(next)}><Icon name="right" size={20} /></button>
        </div>
        <div className="row">
          {B.yearsOf(data).length > 1 && (
            <select className="select" style={{ width: 'auto' }} aria-label="Go to year" value={year} onChange={(e) => go(mode === 'month' ? monthKey(e.target.value, m) : e.target.value)}>
              {B.yearsOf(data).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          )}
          <div className="seg" role="group" aria-label="Budget view">
            <button type="button" aria-pressed={mode === 'month'} onClick={() => go(monthKey(year, mode === 'month' ? m : new Date().getFullYear() === Number(year) ? new Date().getMonth() : 0))}>Month</button>
            <button type="button" aria-pressed={mode === 'year'} onClick={() => go(year)}>Year overview</button>
          </div>
        </div>
      </div>
      {mode === 'month' && !next && m === 11 && (
        <div className="banner info">
          <Icon name="calendar" size={16} />
          <span className="row between" style={{ flex: 1 }}>
            This is the last month in your budget.
            <button className="btn sm" type="button" onClick={() => { update((d) => B.addYear(d, Number(year) + 1)); go(`${Number(year) + 1}-01`); }}>Add {Number(year) + 1}</button>
          </span>
        </div>
      )}
      {mode === 'month' ? (
        <BudgetMonth key={`${year}-${m}`} data={data} update={update} year={year} m={m} />
      ) : (
        <YearView key={year} data={data} update={update} year={year} />
      )}
    </div>
  );
}

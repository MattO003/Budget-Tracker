import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { Bar, Money } from '../components/Money.jsx';
import { Donut, MonthBars } from '../components/Charts.jsx';
import { MONTHS, pad2 } from '../lib/format.js';
import { href } from '../lib/router.js';
import { totalAssets, totalDebts, yearsOf } from '../data/budget.js';
import * as W from '../data/worth.js';

const pct = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);

export default function Analytics({ data }) {
  const years = yearsOf(data);
  const thisYear = String(new Date().getFullYear());
  const [year, setYear] = useState(years.includes(thisYear) ? thisYear : 'all');
  const [month, setMonth] = useState('all');
  const monthIdx = year === 'all' || month === 'all' ? null : Number(month);

  const entries = useMemo(() => W.filterMonths(data, year, monthIdx), [data, year, monthIdx]);
  const s = useMemo(() => W.analyticsSummary(data, entries), [data, entries]);
  const spending = useMemo(() => W.spendingBreakdown(data, entries), [data, entries]);
  const savings = useMemo(() => W.savingsBreakdown(data, entries), [data, entries]);
  const bars = useMemo(() => {
    // A single year: its 12 months. All time: every month that has entries.
    const list = W.monthlyTotals(data, year === 'all' ? W.filterMonths(data, 'all') : W.filterMonths(data, year));
    return year === 'all' ? list.filter((r) => r.hasEntries) : list;
  }, [data, year]);

  const title = year === 'all' ? 'All time' : monthIdx !== null ? `${MONTHS[monthIdx]} ${year}` : year;
  const spentPct = Math.min(pct(s.spent, s.income), 100);
  const savedPct = Math.min(pct(s.saved, s.income), 100 - spentPct);
  const leftPct = Math.max(0, 100 - spentPct - savedPct);
  const savingsTotal = savings.reduce((t, b) => t + b.value, 0);

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <p className="eyebrow">Analytics</p>
          <h1>{title}</h1>
        </div>
        <div className="row">
          <select className="select" style={{ width: 'auto' }} aria-label="Year" value={year} onChange={(e) => { setYear(e.target.value); setMonth('all'); }}>
            <option value="all">All time</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="select" style={{ width: 'auto' }} aria-label="Month" value={month} disabled={year === 'all'} onChange={(e) => setMonth(e.target.value)}>
            <option value="all">Whole year</option>
            {MONTHS.map((n, i) => <option key={n} value={i}>{n}</option>)}
          </select>
        </div>
      </div>

      <div className="figs six">
        <div className="fig"><p className="eyebrow">Income</p><p className="v t-income"><Money value={s.income} decimals={0} /></p></div>
        <div className="fig"><p className="eyebrow">Spent</p><p className="v t-spend"><Money value={s.spent} decimals={0} /></p><p className="s">bills, spending and debt</p></div>
        <div className="fig"><p className="eyebrow">Saved</p><p className="v t-save"><Money value={s.saved} decimals={0} /></p></div>
        <div className="fig"><p className="eyebrow">Left over</p><p className={`v ${s.remaining < 0 ? 't-spend' : ''}`}><Money value={s.remaining} decimals={0} /></p></div>
        <div className="fig"><p className="eyebrow">Savings rate</p><p className="v t-save">{s.rate.toFixed(1)}%</p></div>
        <div className="fig"><p className="eyebrow">Debt paid</p><p className="v t-debt"><Money value={s.debtPaid} decimals={0} /></p></div>
      </div>

      <div className="grid-2 top">
        <section className="card">
          <div className="card-head">
            <div>
              <h2>Where the money went</h2>
              <p className="sub">Bills by group, spending by category, and debt payments. Savings are below.</p>
            </div>
          </div>
          <div className="pad">
            {spending.length === 0 ? <p className="muted">Nothing spent in {title}.</p> : <Donut rows={spending} label={`Spending by category, ${title}`} />}
          </div>
        </section>

        <div className="stack">
          <section className="card pad stack tight">
            <h2>How income was used</h2>
            {s.income > 0 ? (
              <>
                <div className="split" role="img" aria-label={`Spent ${spentPct.toFixed(0)}%, saved ${savedPct.toFixed(0)}%, left over ${leftPct.toFixed(0)}%`}>
                  <i style={{ width: `${spentPct}%`, background: 'var(--spend)' }} />
                  <i style={{ width: `${savedPct}%`, background: 'var(--save)' }} />
                  <i style={{ width: `${leftPct}%`, background: 'var(--income)' }} />
                </div>
                <div className="legend">
                  <span><i className="dot" style={{ background: 'var(--spend)' }} />Spent {spentPct.toFixed(0)}%</span>
                  <span><i className="dot" style={{ background: 'var(--save)' }} />Saved {savedPct.toFixed(0)}%</span>
                  <span><i className="dot" style={{ background: 'var(--income)' }} />Left over {leftPct.toFixed(0)}%</span>
                </div>
                {s.remaining < 0 && <p className="small t-spend">You spent and saved <Money value={-s.remaining} decimals={0} /> more than you earned.</p>}
              </>
            ) : (
              <p className="muted small">No income logged for {title}.</p>
            )}
          </section>

          <div className="figs two">
            <div className="fig">
              <p className="eyebrow">Avg monthly spend</p>
              <p className="v"><Money value={s.avgSpend} decimals={0} /></p>
              <p className="s">over {s.activeMonths} {s.activeMonths === 1 ? 'month' : 'months'} with entries</p>
            </div>
            <div className="fig">
              <p className="eyebrow">Debt-to-income</p>
              <p className="v">{s.dti.toFixed(1)}%</p>
              <p className="s">debt payments ÷ income</p>
            </div>
            <div className="fig">
              <p className="eyebrow">Net worth</p>
              <p className="v"><Money value={totalAssets(data) - totalDebts(data)} decimals={0} /></p>
              <p className="s">assets − debts, today</p>
            </div>
            <div className="fig">
              <p className="eyebrow">Cash runway</p>
              {s.hasCashAccounts ? (
                <>
                  <p className="v">{s.runway === null ? '—' : `${s.runway.toFixed(1)} mo`}</p>
                  <p className="s">cash accounts ÷ avg spend</p>
                </>
              ) : (
                <>
                  <p className="v faint">—</p>
                  <p className="s"><a className="link" href={href('net-worth')}>Mark your cash accounts</a> to see this</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div><h2>Where savings went</h2><p className="sub"><Money value={savingsTotal} decimals={0} /> saved in {title}</p></div>
        </div>
        <div className="list">
          {savings.length === 0 && <p className="empty">Nothing saved in {title}.</p>}
          {savings.map((b) => (
            <div className="li col" key={b.id}>
              <div className="row between" style={{ flexWrap: 'nowrap' }}>
                <span className="name">{b.label} <span className="faint small">{b.group}</span></span>
                <span className="amt"><Money value={b.value} decimals={0} /> <span className="faint small">{pct(b.value, savingsTotal).toFixed(0)}%</span></span>
              </div>
              <Bar value={b.value} max={savings[0].value} kind="save" overIsBad={false} />
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div><h2>Income vs. spending by month</h2><p className="sub">{year === 'all' ? 'Every month with entries' : year}. Click a month to open it.</p></div>
        </div>
        <div className="pad">
          {bars.length === 0 ? (
            <p className="muted">No months with entries yet.</p>
          ) : (
            <MonthBars
              rows={bars}
              multiYear={year === 'all'}
              label={`Income and spending by month, ${year === 'all' ? 'all time' : year}`}
              onOpen={(r) => { window.location.hash = href('budget', `${r.year}-${pad2(r.m + 1)}`); }}
            />
          )}
        </div>
        <p className="hint"><Icon name="info" size={15} /><span>The same numbers as a table: <a href={href('budget', year === 'all' ? undefined : year)}>Budget → Year overview</a>.</span></p>
      </section>
    </div>
  );
}

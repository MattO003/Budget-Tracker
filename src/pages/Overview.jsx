import { useMemo } from 'react';
import Icon from '../components/Icon.jsx';
import Sparkline from '../components/Sparkline.jsx';
import { Bar, Money } from '../components/Money.jsx';
import { MONTHS, shortDate } from '../lib/format.js';
import { href } from '../lib/router.js';
import { addYear, calcStats, catSpent, netWorthSeries, previousMonth, totalAssets, totalDebts, visibleGroups } from '../data/budget.js';

const monthKey = (y, m) => `${y}-${String(m + 1).padStart(2, '0')}`;

function recentPurchases(data, year, m, limit = 6) {
  const out = [];
  let cur = { year: String(year), m };
  for (let step = 0; step < 2 && out.length < limit; step++) {
    const mo = data.years[cur.year]?.[cur.m];
    if (mo) {
      const items = (mo.variableCategories || []).flatMap((c) =>
        (mo.transactions[c.id] || []).map((t) => ({ ...t, cat: c.label, monthName: MONTHS[cur.m] })),
      );
      // dated newest first, then undated newest-added first
      items.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (Number(b.id) || 0) - (Number(a.id) || 0));
      out.push(...items);
    }
    cur = previousMonth(cur.year, cur.m);
  }
  return out.slice(0, limit);
}

export default function Overview({ data, update, onQuickAdd }) {
  const now = new Date();
  const year = String(now.getFullYear());
  const m = now.getMonth();
  const month = data.years[year]?.[m];

  const stats = useMemo(() => (month ? calcStats(data, [month]) : null), [data, month]);
  const recent = useMemo(() => recentPurchases(data, year, m), [data, year, m]);
  const series = useMemo(() => netWorthSeries(data), [data]);
  const net = totalAssets(data) - totalDebts(data);
  const recentSeries = series.slice(-24);
  const change = recentSeries.length > 1 ? recentSeries.at(-1).net - recentSeries[0].net : null;

  if (!month) {
    return (
      <div className="wrap">
        <div className="page-head"><div><p className="eyebrow">Overview</p><h1>{MONTHS[m]} {year}</h1></div></div>
        <section className="card pad stack tight measure">
          <h2>{year} isn’t set up yet</h2>
          <p className="muted">Add {year} to start budgeting this month. It starts with your usual spending categories.</p>
          <div><button className="btn primary" type="button" onClick={() => update((d) => addYear(d, year))}><Icon name="plus" size={16} /> Add {year}</button></div>
        </section>
      </div>
    );
  }

  const bills = visibleGroups(data.categories.fixed, month).flatMap((g) => g.items);
  const budgetedBills = bills.filter((i) => Number(month.expenses[i.id]) > 0);
  const paidBills = budgetedBills.filter((i) => Number(month.spent[i.id]) >= Number(month.expenses[i.id]));
  const unpaid = budgetedBills.filter((i) => Number(month.spent[i.id] || 0) < Number(month.expenses[i.id]));

  return (
    <div className="wrap">
      <div className="page-head">
        <div><p className="eyebrow">Overview</p><h1>{MONTHS[m]} {year}</h1></div>
        <div className="row">
          <a className="btn" href={href('budget', monthKey(year, m))}><Icon name="wallet" size={16} /> Open budget</a>
          <button className="btn primary" type="button" onClick={onQuickAdd}><Icon name="plus" size={16} /> Add transaction</button>
        </div>
      </div>

      <div className="figs">
        <div className="fig"><p className="eyebrow">Income</p><p className="v t-income"><Money value={stats.income} decimals={0} /></p><p className="s">{month.income.length} {month.income.length === 1 ? 'source' : 'sources'}</p></div>
        <div className="fig"><p className="eyebrow">Spent</p><p className="v t-spend"><Money value={stats.spent} decimals={0} /></p><p className="s">bills, spending &amp; debt</p></div>
        <div className="fig"><p className="eyebrow">Saved</p><p className="v t-save"><Money value={stats.saved} decimals={0} /></p><p className="s">{stats.rate.toFixed(1)}% of income</p></div>
        <div className="fig"><p className="eyebrow">Left over</p><p className={`v ${stats.remaining >= 0 ? 't-income' : 't-spend'}`}><Money value={stats.remaining} decimals={0} /></p><p className="s">after spending &amp; saving</p></div>
      </div>

      <div className="grid-main">
        <div className="stack">
          <section className="card">
            <div className="card-head">
              <div><h2>Spending this month</h2><p className="sub">Open Budget to see each category’s purchases</p></div>
              <a className="btn sm ghost" href={href('budget', monthKey(year, m))}>View all <Icon name="right" size={14} /></a>
            </div>
            <div className="list">
              {month.variableCategories.length === 0 && <p className="empty">No spending categories this month yet.</p>}
              {month.variableCategories.map((c) => {
                const spent = catSpent(month, c.id);
                const bud = Number(month.expenses[c.id]) || 0;
                const over = spent > bud + 0.004;
                return (
                  <div className="li col" key={c.id}>
                    <div className="row between" style={{ flexWrap: 'nowrap' }}>
                      <span className="name">{c.label}</span>
                      <span className="num small"><b><Money value={spent} /></b> <span className="muted">of <Money value={bud} decimals={0} /></span></span>
                    </div>
                    <Bar value={spent} max={bud} />
                    <p className="meta">{over ? <span className="t-spend"><Money value={spent - bud} /> over budget</span> : <><Money value={bud - spent} /> left</>}</p>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <div className="card-head"><h2>Recent purchases</h2><button className="btn sm ghost" type="button" onClick={onQuickAdd}><Icon name="plus" size={14} /> Add</button></div>
            <div className="list">
              {recent.length === 0 && <p className="empty">Nothing logged yet this month.</p>}
              {recent.map((t) => (
                <div className="li" key={`${t.id}-${t.cat}`}>
                  <div className="grow"><p className="name">{t.desc}</p><p className="meta">{t.cat} · {shortDate(t.date) || t.monthName}</p></div>
                  <span className="amt"><Money value={t.amount} /></span>
                </div>
              ))}
            </div>
          </section>
        </div>

        <div className="stack">
          <section className="card pad stack tight">
            <div className="row between"><p className="eyebrow">Net worth</p><a className="link small" href={href('net-worth')}>Details</a></div>
            <p className="num" style={{ fontFamily: 'var(--font-display)', fontSize: 30, fontWeight: 800, letterSpacing: '-.02em' }}><Money value={net} decimals={0} /></p>
            {change !== null && (
              <p className={change >= 0 ? 't-income small' : 't-spend small'} style={{ fontWeight: 600 }}>
                {change >= 0 ? '+' : ''}<Money value={change} decimals={0} /> since {shortDate(recentSeries[0].date) || recentSeries[0].date}
              </p>
            )}
            <Sparkline values={recentSeries.map((p) => p.net)} label="Net worth over time" />
            {series.length === 0 && <p className="muted small">Add your accounts on the Net worth page to track this.</p>}
          </section>

          <section className="card">
            <div className="card-head">
              <h2>Bills</h2>
              {budgetedBills.length > 0 && <span className={`chip ${unpaid.length ? 'warn' : 'ok'}`}>{paidBills.length} of {budgetedBills.length} paid</span>}
            </div>
            <div className="list">
              {budgetedBills.length === 0 && <p className="empty">No bills budgeted this month.</p>}
              {budgetedBills.length > 0 && unpaid.length === 0 && <p className="empty">Everything is paid.</p>}
              {unpaid.map((i) => (
                <div className="li" key={i.id}>
                  <div className="grow"><p className="name">{i.label}</p><p className="meta">{Number(month.spent[i.id]) > 0 ? 'Partly paid' : 'Not paid yet'}</p></div>
                  <span className="amt"><Money value={Number(month.expenses[i.id]) - (Number(month.spent[i.id]) || 0)} /></span>
                </div>
              ))}
            </div>
          </section>

          {data.savingsGoals.length > 0 && (
            <section className="card">
              <div className="card-head"><h2>Goals</h2><a className="link small" href={href('goals')}>All goals</a></div>
              <div className="list">
                {data.savingsGoals.map((g) => {
                  const pct = g.target > 0 ? (Number(g.saved) || 0) / g.target : 0;
                  return (
                    <div className="li col" key={g.id}>
                      <div className="row between" style={{ flexWrap: 'nowrap' }}><span className="name">{g.label}</span><span className="num muted small">{Math.round(pct * 100)}%</span></div>
                      <Bar value={Number(g.saved) || 0} max={g.target} kind="save" overIsBad={false} />
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

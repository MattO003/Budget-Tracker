import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { AmountField, Bar, Money, MoneyInput } from '../components/Money.jsx';
import { useToast } from '../components/Toasts.jsx';
import { MONTHS, defaultDateIn, parseAmount, shortDate } from '../lib/format.js';
import { href } from '../lib/router.js';
import * as B from '../data/budget.js';

const n = (v) => Number(v) || 0;

/** Undo for whole-month actions: put this year back exactly as it was. */
const restoreYear = (year, before) => (d) => ({ ...d, years: { ...d.years, [year]: before } });

function MonthActions({ data, update, year, m }) {
  const toast = useToast();
  const [ask, setAsk] = useState(null);
  const prev = B.previousMonth(year, m);
  const hasPrev = Boolean(data.years[prev.year]?.[prev.m]);
  const prevName = `${MONTHS[prev.m]}${prev.year !== String(year) ? ` ${prev.year}` : ''}`;

  const run = (fn, message) => {
    const before = data.years[year];
    update(fn);
    toast(message, { onUndo: () => update(restoreYear(year, before)) });
  };

  const dialogs = {
    copy: {
      title: `Copy from ${prevName}?`,
      body: `Copies ${prevName}’s spending categories and budget amounts into ${MONTHS[m]}. Amounts you’ve paid and purchases you’ve logged stay as they are, and categories that already have purchases are kept.`,
      label: 'Copy budget',
      go: () => run((d) => B.copyFromPrevious(d, year, m) ?? d, `Copied ${prevName}’s budget`),
    },
    fill: {
      title: 'Mark bills paid as budgeted?',
      body: `Sets “Paid” to the budgeted amount for every bill and savings bucket in ${MONTHS[m]} that has a budget. You can still change any of them afterwards.`,
      label: 'Fill in paid amounts',
      go: () => run((d) => B.fillPaidFromBudget(d, year, m), 'Paid amounts filled in'),
    },
    all: {
      title: `Use this budget for all of ${year}?`,
      body: `Replaces the budget amounts in the other 11 months of ${year} with ${MONTHS[m]}’s. Paid amounts, savings and purchases are not touched.`,
      label: 'Replace 11 months',
      go: () => run((d) => B.applyBudgetToYear(d, year, m), `${MONTHS[m]}’s budget applied to all of ${year}`),
    },
  };
  const dlg = ask && dialogs[ask];

  return (
    <div className="row">
      <button className="btn" type="button" onClick={() => setAsk('copy')} disabled={!hasPrev} title={hasPrev ? undefined : `There’s no ${prevName} to copy from`}>
        <Icon name="copy" size={16} /> Copy from {prevName}
      </button>
      <button className="btn" type="button" onClick={() => setAsk('fill')}><Icon name="check" size={16} /> Mark bills paid as budgeted</button>
      <button className="btn" type="button" onClick={() => setAsk('all')}><Icon name="bolt" size={16} /> Use this budget for all of {year}</button>
      {dlg && (
        <ConfirmDialog title={dlg.title} confirmLabel={dlg.label} onConfirm={dlg.go} onClose={() => setAsk(null)}>
          <p>{dlg.body}</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

function IncomeCard({ month, update, year, m }) {
  const toast = useToast();
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const total = B.monthIncome(month);
  return (
    <section className="card">
      <div className="card-head"><div><h2>Income</h2><p className="sub"><Money value={total} /> this month</p></div></div>
      <div className="list">
        {month.income.map((inc, i) => (
          <div className="li" key={i}>
            <div className="grow name">{inc.label}</div>
            <span className="amt t-income"><Money value={inc.amount} /></span>
            <button
              className="iconbtn del"
              type="button"
              aria-label={`Delete ${inc.label}`}
              onClick={() => {
                update((d) => B.removeIncome(d, year, m, i));
                toast(`Deleted ${inc.label}`, { onUndo: () => update((d) => B.insertIncome(d, year, m, i, inc)) });
              }}
            >
              <Icon name="trash" size={15} />
            </button>
          </div>
        ))}
        <form
          className="li inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            const v = parseAmount(amount);
            if (!label.trim() || !v) return;
            update((d) => B.addIncome(d, year, m, label.trim(), v));
            setLabel('');
            setAmount('');
          }}
        >
          <input className="input" placeholder="Source, e.g. Paycheck" aria-label="Income source" value={label} onChange={(e) => setLabel(e.target.value)} />
          <AmountField value={amount} onChange={setAmount} label="Income amount" className="" />
          <button className="btn" type="submit"><Icon name="plus" size={15} /> Add</button>
        </form>
      </div>
    </section>
  );
}

function statusChip(bud, paid) {
  if (bud > 0 && paid >= bud - 0.004) return <span className="chip ok">Paid</span>;
  if (paid > 0) return <span className="chip warn">Partly</span>;
  if (bud > 0) return <span className="chip">Due</span>;
  return null;
}

/** Bills (fixed) and savings buckets share one layout: budget + paid/saved per item. */
function ItemsTable({ data, update, month, year, m, type }) {
  const groups = B.visibleGroups(data.categories[type], month);
  const isBills = type === 'fixed';
  if (groups.length === 0) {
    return <p className="empty">None yet. <a className="link" href={href('settings', 'categories')}>Add {isBills ? 'bills' : 'savings buckets'} in Settings</a>.</p>;
  }
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead><tr><th>{isBills ? 'Bill' : 'Bucket'}</th><th className="r">{isBills ? 'Budget' : 'Goal'}</th><th className="r">{isBills ? 'Paid' : 'Saved'}</th></tr></thead>
        <tbody>
          {groups.map((g) => [
            <tr className="grp" key={g.id}><td colSpan={3}>{g.label}</td></tr>,
            ...g.items.map((i) => (
              <tr key={i.id}>
                <td>
                  <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
                    <span>{i.label}</span>
                    {isBills && statusChip(n(month.expenses[i.id]), n(month.spent[i.id]))}
                  </div>
                </td>
                <td className="r"><MoneyInput value={month.expenses[i.id]} label={`${i.label} ${isBills ? 'budget' : 'goal'}`} onChange={(v) => update((d) => B.setBudget(d, year, m, i.id, v))} /></td>
                <td className="r"><MoneyInput value={month.spent[i.id]} label={`${i.label} ${isBills ? 'paid' : 'saved'}`} onChange={(v) => update((d) => B.setPaid(d, year, m, i.id, v))} /></td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}

function SpendingCategory({ cat, month, update, year, m, open, onToggle, index }) {
  const toast = useToast();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [date, setDate] = useState(() => defaultDateIn(year, m));
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const spent = B.catSpent(month, cat.id);
  const bud = n(month.expenses[cat.id]);
  const over = spent > bud + 0.004;
  const txs = (month.transactions[cat.id] || []).map((t, i) => ({ t, i }));
  txs.sort((a, b) => String(a.t.date || '').localeCompare(String(b.t.date || '')) || a.i - b.i);
  const remove = () => {
    update((d) => B.removeSpendingCategory(d, year, m, cat.id));
    toast(`Removed ${cat.label} from ${MONTHS[m]}`, { onUndo: () => update((d) => B.insertSpendingCategory(d, year, m, index, cat)) });
  };

  return (
    <div className="cat">
      <button className="cat-head" type="button" aria-expanded={open} onClick={onToggle}>
        <span><b>{cat.label}</b> <span className="muted small">· {txs.length} {txs.length === 1 ? 'purchase' : 'purchases'}</span></span>
        <span className="num small"><b><Money value={spent} /></b> <span className="muted">/ <Money value={bud} decimals={0} /></span></span>
        <span className="chev"><Icon name="right" size={16} /></span>
        <Bar value={spent} max={bud} />
      </button>
      {open && (
        <div className="cat-body">
          <div className="row between" style={{ padding: '8px 0 6px' }}>
            <span className={over ? 't-spend' : 't-income'} style={{ fontWeight: 600, fontSize: 13 }}>
              {over ? <><Money value={spent - bud} /> over budget</> : <><Money value={bud - spent} /> left</>}
            </span>
            <div className="row" style={{ gap: 6 }}>
              <span className="muted small">Monthly budget</span>
              <MoneyInput value={month.expenses[cat.id]} label={`${cat.label} budget`} onChange={(v) => update((d) => B.setBudget(d, year, m, cat.id, v))} />
            </div>
          </div>
          {txs.length === 0 && <p className="muted" style={{ padding: '8px 0' }}>No purchases yet.</p>}
          {txs.map(({ t, i }) => (
            <div className="tx" key={t.id ?? i}>
              <span className="muted num small">{shortDate(t.date) || '—'}</span>
              <span className="desc">{t.desc}</span>
              <span className="amt"><Money value={t.amount} /></span>
              <button
                className="iconbtn del"
                type="button"
                aria-label={`Delete ${t.desc}`}
                onClick={() => {
                  update((d) => B.removeTransaction(d, year, m, cat.id, t.id));
                  toast(`Deleted ${t.desc}`, { onUndo: () => update((d) => B.insertTransaction(d, year, m, cat.id, i, t)) });
                }}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))}
          <form
            className="tx-add"
            onSubmit={(e) => {
              e.preventDefault();
              const v = parseAmount(amount);
              if (!desc.trim() || !v) return;
              update((d) => B.addTransaction(d, year, m, cat.id, { desc: desc.trim(), amount: v, date }).data);
              setDesc('');
              setAmount('');
              e.currentTarget.querySelector('.desc')?.focus();
            }}
          >
            <input className="input" type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input className="input desc" placeholder="What was it?" aria-label="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
            <AmountField value={amount} onChange={setAmount} label="Amount" />
            <button className="btn primary" type="submit">Add</button>
          </form>
          <div className="row between" style={{ marginTop: 12 }}>
            <span className="faint small">Purchases without a date were logged before dates were added.</span>
            <button className="btn sm danger" type="button" onClick={() => (txs.length ? setConfirmRemove(true) : remove())}>
              <Icon name="trash" size={14} /> Remove category
            </button>
          </div>
        </div>
      )}
      {confirmRemove && (
        <ConfirmDialog title={`Remove ${cat.label} from ${MONTHS[m]}?`} confirmLabel="Remove category" danger onConfirm={remove} onClose={() => setConfirmRemove(false)}>
          <p>
            {cat.label} has {txs.length} {txs.length === 1 ? 'purchase' : 'purchases'} (<Money value={spent} />) in {MONTHS[m]}. If you remove it, they stop
            counting in this month’s totals and disappear from view.
          </p>
          <p className="muted small">They aren’t deleted: you can undo right after, or bring them back later from the notice at the top of this month.</p>
        </ConfirmDialog>
      )}
    </div>
  );
}

/** Notice for purchases hidden in a category that was dropped from this month, with a button to bring it back. */
function HiddenPurchases({ data, update, year, m }) {
  const toast = useToast();
  const hidden = B.hiddenPurchases(data).filter((h) => h.year === String(year) && h.m === m);
  if (hidden.length === 0) return null;
  return hidden.map((h) => (
    <div className="banner warn" role="status" key={h.catId}>
      <Icon name="alert" size={16} />
      <span className="row between" style={{ flex: 1 }}>
        <span>
          <b>{h.count} {h.count === 1 ? 'purchase' : 'purchases'} (<Money value={h.total} />) {h.count === 1 ? 'isn’t' : 'aren’t'} counted.</b>{' '}
          {h.count === 1 ? 'It was' : 'They were'} logged under “{h.label}”, which is no longer one of {MONTHS[m]}’s categories.
        </span>
        <button
          className="btn sm"
          type="button"
          onClick={() => {
            const before = data.years[year];
            update((d) => B.restoreHiddenCategory(d, year, m, h.catId, h.label));
            toast(`Brought back ${h.label}`, { onUndo: () => update(restoreYear(year, before)) });
          }}
        >
          Bring back {h.label}
        </button>
      </span>
    </div>
  ));
}

function SpendingCard({ month, update, year, m }) {
  const [open, setOpen] = useState(null);
  const [label, setLabel] = useState('');
  const spent = month.variableCategories.reduce((sum, c) => sum + B.catSpent(month, c.id), 0);
  const budget = month.variableCategories.reduce((sum, c) => sum + n(month.expenses[c.id]), 0);
  return (
    <section className="card">
      <div className="card-head"><div><h2>Spending</h2><p className="sub"><Money value={spent} /> of <Money value={budget} /> · tap a category to log purchases</p></div></div>
      <div>
        {month.variableCategories.map((c, i) => (
          <SpendingCategory key={c.id} cat={c} index={i} month={month} update={update} year={year} m={m} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} />
        ))}
        <form
          className="li inline-form"
          style={{ borderTop: month.variableCategories.length ? '1px solid var(--line)' : 0 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!label.trim()) return;
            let added;
            update((d) => {
              const r = B.addSpendingCategory(d, year, m, label.trim());
              added = r.cat;
              return r.data;
            });
            setOpen(added?.id ?? null);
            setLabel('');
          }}
        >
          <input className="input" placeholder={`New category for ${MONTHS[m]}`} aria-label="New spending category" value={label} onChange={(e) => setLabel(e.target.value)} />
          <button className="btn" type="submit"><Icon name="plus" size={15} /> Add</button>
        </form>
      </div>
    </section>
  );
}

function DebtsCard({ data, month, update, year, m }) {
  const total = data.debts.reduce((s, d) => s + n(month.debts?.[d.id]?.payment), 0);
  return (
    <section className="card">
      <div className="card-head"><div><h2>Debt payments</h2><p className="sub"><Money value={total} /> this month</p></div><a className="btn sm ghost" href={href('net-worth')}>Manage debts</a></div>
      {data.debts.length === 0 ? (
        <p className="empty">No debts. If you have any, add them on the <a className="link" href={href('net-worth')}>Net worth</a> page.</p>
      ) : (
        <div className="tbl-wrap">
          <table className="tbl">
            <tbody>
              {data.debts.map((d) => (
                <tr key={d.id}>
                  <td><b style={{ fontWeight: 550 }}>{d.label}</b><div className="muted small"><Money value={B.currentValue(d)} decimals={0} /> left</div></td>
                  <td className="r"><MoneyInput value={month.debts?.[d.id]?.payment} label={`${d.label} payment`} onChange={(v) => update((dd) => B.setDebtPayment(dd, year, m, d.id, v))} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function BudgetMonth({ data, update, year, m }) {
  const month = data.years[year][m];
  const stats = B.calcStats(data, [month]);
  const s = B.monthSections(data, month);
  return (
    <>
      <MonthActions data={data} update={update} year={year} m={m} />
      <HiddenPurchases data={data} update={update} year={year} m={m} />
      <div className="figs six">
        <div className="fig"><p className="eyebrow">Income</p><p className="v t-income"><Money value={stats.income} /></p></div>
        <div className="fig"><p className="eyebrow">Budgeted</p><p className="v"><Money value={stats.budgeted} /></p></div>
        <div className="fig"><p className="eyebrow">Spent</p><p className="v t-spend"><Money value={stats.spent} /></p></div>
        <div className="fig"><p className="eyebrow">Saved</p><p className="v t-save"><Money value={stats.saved} /></p></div>
        <div className="fig"><p className="eyebrow">Left over</p><p className={`v ${stats.remaining >= 0 ? 't-income' : 't-spend'}`}><Money value={stats.remaining} /></p></div>
        <div className="fig"><p className="eyebrow">Savings rate</p><p className="v t-save">{stats.rate.toFixed(1)}%</p></div>
      </div>
      <div className="grid-2 top">
        <div className="stack">
          <IncomeCard month={month} update={update} year={year} m={m} />
          <section className="card">
            <div className="card-head">
              <div><h2>Bills</h2><p className="sub"><Money value={s.billsPaid} /> paid of <Money value={s.billsBudget} /></p></div>
              <a className="btn sm ghost" href={href('settings', 'categories')}><Icon name="edit" size={14} /> Edit bills</a>
            </div>
            <ItemsTable data={data} update={update} month={month} year={year} m={m} type="fixed" />
            <p className="hint"><Icon name="info" size={15} /><span>Bills are the same list every month. Add, rename or remove them in <a className="link" href={href('settings', 'categories')}>Settings</a>.</span></p>
          </section>
        </div>
        <div className="stack">
          <SpendingCard month={month} update={update} year={year} m={m} />
          <section className="card">
            <div className="card-head">
              <div><h2>Savings</h2><p className="sub"><Money value={s.saved} /> saved of <Money value={s.saveBudget} /> goal</p></div>
              <a className="btn sm ghost" href={href('settings', 'categories')}><Icon name="edit" size={14} /> Edit buckets</a>
            </div>
            <ItemsTable data={data} update={update} month={month} year={year} m={m} type="savings" />
          </section>
          <DebtsCard data={data} month={month} update={update} year={year} m={m} />
        </div>
      </div>
    </>
  );
}

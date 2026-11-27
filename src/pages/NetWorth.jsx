import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { AmountField, Money, MoneyInput } from '../components/Money.jsx';
import { NetWorthChart } from '../components/Charts.jsx';
import { useToast } from '../components/Toasts.jsx';
import { longDate, money, MONTHS_SHORT, parseAmount, todayISO } from '../lib/format.js';
import { href } from '../lib/router.js';
import { currentValue, netWorthSeries, totalAssets, totalDebts, valueAtDate } from '../data/budget.js';
import * as W from '../data/worth.js';

const WORD = { assets: 'asset', debts: 'debt' };
const RANGES = [
  ['1y', '1 year', 12],
  ['2y', '2 years', 24],
  ['all', 'All', null],
];

/** Points on or after the range start, with the value at the start filled in so the line doesn't jump. */
function inRange(data, series, months) {
  if (!months || series.length < 2) return series;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  const start = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const at = (date) => {
    const assets = data.assets.reduce((s, a) => s + valueAtDate(a, date), 0);
    const debts = data.debts.reduce((s, x) => s + valueAtDate(x, date), 0);
    return { date, assets, debts, net: assets - debts };
  };
  const out = series.filter((p) => p.date >= start);
  if (series.some((p) => p.date < start) && out[0]?.date !== start) out.unshift(at(start));
  // Carry the latest values to today so the range always ends now.
  const today = todayISO();
  if (out.length && out[out.length - 1].date < today) out.push(at(today));
  return out;
}

/** Interest rate field: keeps what you type while focused. */
function PercentInput({ value, onChange, id }) {
  const [draft, setDraft] = useState(null);
  const stored = Number(value) ? String(Number(value)) : '';
  return (
    <label className="money pct">
      <input
        className="input"
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0"
        value={draft ?? stored}
        onFocus={(e) => { setDraft(stored); e.target.select(); }}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          const t = e.target.value.replace(/[%\s]/g, '');
          if (!/^\d{0,3}(?:\.\d{0,3})?$/.test(t)) return;
          setDraft(t);
          onChange(parseFloat(t) || 0);
        }}
      />
      <span aria-hidden="true">%</span>
    </label>
  );
}

function NameField({ value, onSave, id }) {
  const [text, setText] = useState(value);
  const save = () => (text.trim() && text.trim() !== value ? onSave(text.trim()) : setText(value));
  return (
    <input
      className="input"
      id={id}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
        if (e.key === 'Escape') { setText(value); }
      }}
    />
  );
}

function paymentNote(p) {
  if (p.source === 'budget') return `Until you set one, the planner uses your latest payment from Budget (${money(p.amount)}, ${MONTHS_SHORT[p.m]} ${p.year}).`;
  if (p.source === 'estimate') return `Until you set one, the planner estimates a minimum of ${money(p.amount)} (2% of the balance, at least $25).`;
  return null;
}

/** Side panel for one asset or debt: settings, log a value, history. Always shows the latest data. */
function ItemDrawer({ data, update, kind, id, onClose }) {
  const toast = useToast();
  const [date, setDate] = useState(todayISO);
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const item = data[kind].find((x) => x.id === id);
  if (!item) return null;
  const isDebt = kind === 'debts';
  const rows = W.historyRows(item);
  const plan = isDebt ? W.planPayment(data, item) : null;

  const addEntry = (e) => {
    e.preventDefault();
    if (!amount.trim() || !date) return setErr(!date ? 'Pick a date.' : 'Enter an amount.');
    setErr(null);
    update((d) => W.addHistory(d, kind, id, { date, value: parseAmount(amount) }));
    toast(`Logged ${money(parseAmount(amount))} for ${longDate(date)}`);
    setAmount('');
  };
  const deleteEntry = ({ entry, index }) => {
    update((d) => W.removeHistory(d, kind, id, index));
    toast(`Deleted the ${longDate(entry.date) || 'undated'} entry`, { onUndo: () => update((d) => W.insertHistory(d, kind, id, index, entry)) });
  };
  const deleteItem = () => {
    const index = data[kind].findIndex((x) => x.id === id);
    update((d) => W.removeWorthItem(d, kind, id).data);
    onClose();
    toast(`Deleted ${item.label}`, { duration: 10000, onUndo: () => update((d) => W.insertWorthItem(d, kind, index, item)) });
  };

  return (
    <Modal
      drawer
      focusFirst={false}
      title={item.label}
      onClose={onClose}
      footer={
        <div className="row between" style={{ width: '100%' }}>
          <button className="btn danger" type="button" onClick={() => setConfirmDelete(true)}>
            <Icon name="trash" size={15} /> Delete {WORD[kind]}
          </button>
          <button className="btn" type="button" onClick={onClose}>Done</button>
        </div>
      }
    >
      <div className="row between" style={{ alignItems: 'flex-end' }}>
        <div>
          <p className="eyebrow">{isDebt ? 'Balance' : 'Value'}</p>
          <p className="big-num"><Money value={currentValue(item)} /></p>
          <p className="faint small">{rows.length ? `Updated ${longDate(rows[0].entry.date) || '—'} · ${rows.length} ${rows.length === 1 ? 'entry' : 'entries'}` : 'No values logged yet'}</p>
        </div>
      </div>

      <div className="field">
        <label htmlFor="wi-name">Name</label>
        <NameField id="wi-name" value={item.label} onSave={(label) => update((d) => W.renameWorthItem(d, kind, id, label))} />
      </div>

      {isDebt ? (
        <>
          <div className="fields-2">
            <div className="field">
              <label htmlFor="wi-apr">Interest rate (APR)</label>
              <PercentInput id="wi-apr" value={item.apr ?? W.debtApr(item)} onChange={(v) => update((d) => W.setWorthField(d, kind, id, 'apr', v))} />
            </div>
            <div className="field">
              <label htmlFor="wi-pay">Usual monthly payment</label>
              <MoneyInput id="wi-pay" size="" value={item.payment} onChange={(v) => update((d) => W.setWorthField(d, kind, id, 'payment', v))} />
            </div>
          </div>
          {paymentNote(plan) && <p className="faint small">{paymentNote(plan)} Used by the <a className="link" href={href('goals')}>payoff planner</a>.</p>}
        </>
      ) : (
        <label className="check">
          <input type="checkbox" checked={Boolean(item.cash)} onChange={(e) => update((d) => W.setWorthField(d, kind, id, 'cash', e.target.checked))} />
          <span>
            <b>Counts as cash</b>
            <br />
            <span className="muted">Checking, savings and similar. Used for “cash runway” in Analytics. Leave off for a car, house or retirement account.</span>
          </span>
        </label>
      )}

      <form className="log-box" onSubmit={addEntry} noValidate>
        <b className="small">Log a new {isDebt ? 'balance' : 'value'}</b>
        <div className="fields-2">
          <input className="input" type="date" aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
          <AmountField value={amount} onChange={setAmount} label="Amount" allowNegative={!isDebt} />
        </div>
        {err && <p className="small t-spend">{err}</p>}
        <button className="btn primary" type="submit">Add entry</button>
      </form>

      <div>
        <p className="eyebrow" style={{ marginBottom: 4 }}>History</p>
        {rows.length === 0 && <p className="muted small">Nothing logged yet.</p>}
        {rows.map((r, i) => {
          const prev = rows[i + 1];
          const change = prev ? Number(r.entry.value) - Number(prev.entry.value) : null;
          return (
            <div className="hist" key={`${r.index}-${r.entry.date}`}>
              <span className="num">{longDate(r.entry.date) || r.entry.date || '—'}</span>
              <span className={`num small ${change === null || Math.abs(change) < 0.005 ? 'faint' : (change > 0) !== isDebt ? 't-income' : 't-spend'}`}>
                {change === null || Math.abs(change) < 0.005 ? '' : <>{change > 0 ? '+' : ''}<Money value={change} decimals={0} /></>}
              </span>
              <span className="amt"><Money value={r.entry.value} /></span>
              <button className="iconbtn del" type="button" aria-label={`Delete entry from ${longDate(r.entry.date) || 'no date'}`} onClick={() => deleteEntry(r)}>
                <Icon name="trash" size={15} />
              </button>
            </div>
          );
        })}
      </div>

      {confirmDelete && (
        <ConfirmDialog title={`Delete ${item.label}?`} confirmLabel={`Delete ${WORD[kind]}`} danger onConfirm={deleteItem} onClose={() => setConfirmDelete(false)}>
          <p>
            Removes {item.label} and its {rows.length} logged {rows.length === 1 ? 'value' : 'values'} from your net worth.
            {isDebt ? ' Payments you entered for it on the Budget page will stop counting in your totals.' : ''} You can undo right after.
          </p>
        </ConfirmDialog>
      )}
    </Modal>
  );
}

function AddItemModal({ kind, update, onClose, onAdded }) {
  const isDebt = kind === 'debts';
  const [f, setF] = useState({ label: '', value: '', date: todayISO(), apr: '', payment: '', cash: false });
  const [err, setErr] = useState(null);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const submit = () => {
    if (!f.label.trim()) return setErr('Give it a name.');
    const item = W.newWorthItem(kind, {
      label: f.label.trim(),
      value: f.value.trim() ? parseAmount(f.value) : null,
      date: f.date || todayISO(),
      apr: parseFloat(f.apr) || 0,
      payment: parseAmount(f.payment),
      cash: f.cash,
    });
    update((d) => W.insertWorthItem(d, kind, d[kind].length, item));
    onAdded(item);
  };
  return (
    <Modal
      title={isDebt ? 'Add a debt' : 'Add an asset'}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit">Add {WORD[kind]}</button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="ni-name">Name</label>
        <input className="input" id="ni-name" placeholder={isDebt ? 'e.g. Car loan' : 'e.g. Checking'} value={f.label} onChange={(e) => set('label')(e.target.value)} />
      </div>
      <div className="fields-2">
        <div className="field">
          <label htmlFor="ni-val">{isDebt ? 'Current balance' : 'Current value'}</label>
          <AmountField id="ni-val" value={f.value} onChange={set('value')} allowNegative={!isDebt} />
        </div>
        <div className="field">
          <label htmlFor="ni-date">As of</label>
          <input className="input" id="ni-date" type="date" value={f.date} onChange={(e) => set('date')(e.target.value)} />
        </div>
      </div>
      {isDebt ? (
        <div className="fields-2">
          <div className="field">
            <label htmlFor="ni-apr">Interest rate (APR %)</label>
            <input className="input" id="ni-apr" inputMode="decimal" placeholder="0" value={f.apr} onChange={(e) => /^\d{0,3}(?:\.\d{0,3})?$/.test(e.target.value) && set('apr')(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ni-pay">Usual monthly payment</label>
            <AmountField id="ni-pay" value={f.payment} onChange={set('payment')} allowNegative={false} />
          </div>
        </div>
      ) : (
        <label className="check">
          <input type="checkbox" checked={f.cash} onChange={(e) => set('cash')(e.target.checked)} />
          <span>Counts as cash (checking, savings)</span>
        </label>
      )}
      <p className="faint small">You can leave the amount empty and log it later.</p>
      {err && <p className="small t-spend" role="alert">{err}</p>}
    </Modal>
  );
}

function ItemList({ data, kind, onOpen, onAdd }) {
  const isDebt = kind === 'debts';
  const items = data[kind];
  const total = isDebt ? totalDebts(data) : totalAssets(data);
  return (
    <section className="card">
      <div className="card-head">
        <h2>{isDebt ? 'Debts' : 'Assets'}</h2>
        <span className={`amt ${isDebt ? 't-spend' : 't-income'}`} style={{ fontSize: 16 }}><Money value={total} decimals={0} /></span>
      </div>
      <div className="list">
        {items.length === 0 && (
          <p className="empty">
            {isDebt ? 'No debts. If you have a loan or a card balance, add it to track it and plan the payoff.' : 'No assets yet. Add accounts like checking, savings or retirement.'}
          </p>
        )}
        {items.map((x) => {
          const updated = W.lastUpdated(x);
          const n = (x.history || []).length;
          const apr = W.debtApr(x);
          return (
            <button key={x.id} type="button" className="li click" onClick={() => onOpen(x.id)}>
              <div className="grow">
                <p className="name">{x.label}</p>
                <p className="meta">
                  {isDebt
                    ? <>{apr ? `${apr}% APR` : 'No APR set'}{Number(x.payment) > 0 ? <> · <Money value={x.payment} />/mo</> : ''}</>
                    : <>{updated ? `Updated ${longDate(updated)}` : 'No value yet'} · {n} {n === 1 ? 'entry' : 'entries'}</>}
                  {x.cash && <> · <span className="chip ok">Cash</span></>}
                </p>
              </div>
              <span className="amt"><Money value={currentValue(x)} decimals={0} /></span>
              <span className="faint"><Icon name="right" size={16} /></span>
            </button>
          );
        })}
        <button type="button" className="li click add-row" onClick={onAdd}>
          <Icon name="plus" size={15} /> Add {isDebt ? 'a debt' : 'an asset'}
        </button>
      </div>
    </section>
  );
}

export default function NetWorth({ data, update }) {
  const [open, setOpen] = useState(null); // {kind, id}
  const [adding, setAdding] = useState(null); // kind
  const [range, setRange] = useState('all');
  const series = useMemo(() => netWorthSeries(data), [data]);
  const shown = useMemo(() => inRange(data, series, RANGES.find((r) => r[0] === range)[2]), [data, series, range]);
  const net = totalAssets(data) - totalDebts(data);
  const change = shown.length > 1 ? shown[shown.length - 1].net - shown[0].net : null;

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <p className="eyebrow">Net worth</p>
          <h1 className="num"><Money value={net} decimals={0} /></h1>
          <p className="muted small">
            <Money value={totalAssets(data)} decimals={0} /> in assets − <Money value={totalDebts(data)} decimals={0} /> in debts
          </p>
        </div>
        <div className="row">
          <button className="btn" type="button" onClick={() => setAdding('assets')}><Icon name="plus" size={15} /> Add asset</button>
          <button className="btn" type="button" onClick={() => setAdding('debts')}><Icon name="plus" size={15} /> Add debt</button>
        </div>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Over time</h2>
            {change !== null && (
              <p className="sub">
                <span className={change >= 0 ? 't-income' : 't-spend'}>{change >= 0 ? '+' : ''}<Money value={change} decimals={0} /></span>{' '}
                since {longDate(shown[0].date)}
              </p>
            )}
          </div>
          {series.length > 1 && (
            <div className="seg" role="group" aria-label="Time range">
              {RANGES.map(([id, label]) => (
                <button key={id} type="button" aria-pressed={range === id} onClick={() => setRange(id)}>{label}</button>
              ))}
            </div>
          )}
        </div>
        <div className="pad">
          <NetWorthChart series={shown} />
        </div>
        <p className="hint"><Icon name="info" size={15} /><span>Each point is a date you logged a value. Open an account below to log today’s value.</span></p>
      </section>

      <div className="grid-2 top">
        <ItemList data={data} kind="assets" onOpen={(id) => setOpen({ kind: 'assets', id })} onAdd={() => setAdding('assets')} />
        <ItemList data={data} kind="debts" onOpen={(id) => setOpen({ kind: 'debts', id })} onAdd={() => setAdding('debts')} />
      </div>

      {open && <ItemDrawer key={`${open.kind}-${open.id}`} data={data} update={update} kind={open.kind} id={open.id} onClose={() => setOpen(null)} />}
      {adding && (
        <AddItemModal
          kind={adding}
          update={update}
          onClose={() => setAdding(null)}
          onAdded={(item) => {
            setAdding(null);
            setOpen({ kind: adding, id: item.id });
          }}
        />
      )}
    </div>
  );
}

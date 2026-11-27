import { useMemo, useRef, useState } from 'react';
import Modal from './Modal.jsx';
import Icon from './Icon.jsx';
import { AmountField } from './Money.jsx';
import { useToast } from './Toasts.jsx';
import { MONTHS, money, parseAmount, todayISO } from '../lib/format.js';
import { addTransaction, addYear, findCategoryByLabel, parseQuickLine, recentStores, removeTransaction, storeIndex } from '../data/budget.js';

const IDLE = { kind: 'idle', text: 'Type a store you’ve used before and its category fills in.' };
const isPhone = () => window.matchMedia?.('(max-width: 899px)').matches ?? false;

/**
 * Add a purchase from anywhere. Desktop: one line ("45.20 costco").
 * Phone: amount first with the number pad, then tap a recent store.
 */
export default function QuickAdd({ data, update, onClose }) {
  const toast = useToast();
  const [phone] = useState(isPhone);
  const [line, setLine] = useState('');
  const [amount, setAmount] = useState('');
  const [store, setStore] = useState('');
  const [date, setDate] = useState(todayISO());
  const [catId, setCatId] = useState(null);
  const [memo, setMemo] = useState(IDLE);
  const lineRef = useRef(null);
  const amountRef = useRef(null);

  const index = useMemo(() => storeIndex(data), [data]);
  const recent = useMemo(() => recentStores(index), [index]);

  const year = date.slice(0, 4);
  const m = Number(date.slice(5, 7)) - 1;
  const month = data.years[year]?.[m];
  const cats = month?.variableCategories || [];
  const selected = cats.find((c) => c.id === catId) || cats[0] || null;

  function remember(name, inMonth = month) {
    const key = name.trim().toLowerCase();
    if (!key) return setMemo(IDLE);
    const hit = index.get(key);
    if (!hit) return setMemo({ kind: 'idle', text: 'New store. Pick a category and it’ll be remembered next time.' });
    const cat = findCategoryByLabel(inMonth, hit.catLabel);
    if (cat) {
      setCatId(cat.id);
      setMemo({ kind: 'ok', text: `${hit.desc} goes to ${cat.label}, same as last time.` });
    } else {
      setMemo({ kind: 'idle', text: `Last time ${hit.desc} was ${hit.catLabel}, which isn’t a category in ${MONTHS[m]}. Pick one.` });
    }
  }

  function onLine(text) {
    setLine(text);
    const p = parseQuickLine(text);
    setAmount(p.amount == null ? '' : String(p.amount));
    setStore(p.store);
    remember(p.store);
  }

  function onDate(next) {
    setDate(next);
    const nm = data.years[next.slice(0, 4)]?.[Number(next.slice(5, 7)) - 1];
    // keep the same category by name when switching months
    if (selected && nm) {
      const same = findCategoryByLabel(nm, selected.label);
      setCatId(same ? same.id : null);
    }
  }

  function pickStore(s) {
    setStore(s.desc);
    remember(s.desc);
    if (!phone) {
      setLine(`${amount ? amount + ' ' : ''}${s.desc}`);
      lineRef.current?.focus();
    } else if (!amount) amountRef.current?.focus();
  }

  function submit(e) {
    const another = e?.nativeEvent?.submitter?.dataset?.another === '1';
    const value = parseAmount(amount);
    const name = store.trim();
    if (!value || !name) {
      setMemo({ kind: 'err', text: !value && !name ? 'Add an amount and a store.' : !value ? 'Add an amount.' : 'Add a store.' });
      return;
    }
    if (!month) return setMemo({ kind: 'err', text: `${year} isn’t set up yet. Add it first.` });
    if (!selected) return setMemo({ kind: 'err', text: `${MONTHS[m]} has no spending categories yet. Add one on the Budget page.` });

    const desc = index.get(name.toLowerCase())?.desc || name;
    const catIdUsed = selected.id;
    let tx;
    update((d) => {
      const r = addTransaction(d, year, m, catIdUsed, { desc, amount: value, date });
      tx = r.tx;
      return r.data;
    });
    toast(`Added ${money(value)} at ${desc} to ${selected.label}`, {
      onUndo: () => update((d) => removeTransaction(d, year, m, catIdUsed, tx.id)),
    });
    if (another) {
      setLine('');
      setAmount('');
      setStore('');
      setMemo(IDLE);
      (phone ? amountRef : lineRef).current?.focus();
    } else onClose();
  }

  const memoEl = (
    <p className={`memo ${memo.kind === 'ok' ? 't-income' : memo.kind === 'err' ? 'err' : 'muted'}`} aria-live="polite">
      <Icon name={memo.kind === 'ok' ? 'check' : 'info'} size={14} />
      <span>{memo.text}</span>
    </p>
  );

  const missingYear = !data.years[year];
  const yearBanner = missingYear && (
    <div className="banner warn">
      <Icon name="info" size={16} />
      <span className="row between" style={{ flex: 1 }}>
        {year} isn’t set up in your budget yet.
        <button type="button" className="btn sm" onClick={() => update((d) => addYear(d, year))}>Add {year}</button>
      </span>
    </div>
  );

  const catField = (
    <div className="field">
      <label htmlFor="qa-cat">Category</label>
      <select className="select" id="qa-cat" value={selected?.id || ''} onChange={(e) => setCatId(e.target.value)} disabled={!cats.length}>
        {cats.length ? cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>) : <option value="">No categories</option>}
      </select>
    </div>
  );
  const dateField = (
    <div className="field">
      <label htmlFor="qa-date">Date</label>
      <input className="input" type="date" id="qa-date" value={date} onChange={(e) => e.target.value && onDate(e.target.value)} />
    </div>
  );
  const chips = recent.length > 0 && (
    <div className="field">
      <span className="label">Recent stores</span>
      <div className="chips">
        {recent.map((s) => (
          <button key={s.desc} type="button" className="storechip" onClick={() => pickStore(s)}>
            <b>{s.desc}</b>
            <span>{s.catLabel}</span>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <Modal
      title="Add transaction"
      onClose={onClose}
      size={phone ? '' : 'wide'}
      onSubmit={submit}
      footer={
        <>
          <button className="btn primary" type="submit" style={{ order: 3 }}>Add</button>
          <button className="btn" type="submit" data-another="1" style={{ order: 2 }}>Add &amp; add another</button>
          <button className="btn ghost" type="button" onClick={onClose} style={{ order: 1 }}>Cancel</button>
        </>
      }
    >
      {phone ? (
        <>
          <div className="field">
            <label htmlFor="qa-amt">Amount</label>
            <AmountField id="qa-amt" value={amount} onChange={setAmount} inputClassName="qa-amount" prefixStyle={{ fontSize: 22, left: 16 }} autoFocus />
          </div>
          {chips}
          <div className="field">
            <label htmlFor="qa-store">Store</label>
            <input className="input" id="qa-store" placeholder="Or type a store" autoComplete="off" value={store} onChange={(e) => { setStore(e.target.value); remember(e.target.value); }} />
          </div>
          {memoEl}
          <div className="fields-2">{catField}{dateField}</div>
        </>
      ) : (
        <>
          <div className="field">
            <label htmlFor="qa-line">Amount and store</label>
            <input ref={lineRef} className="input qa-line" id="qa-line" placeholder="45.20 costco" autoComplete="off" spellCheck="false" value={line} onChange={(e) => onLine(e.target.value)} />
            <p className="faint small">Type it on one line and press Enter. Press <kbd>N</kbd> on any page to open this.</p>
          </div>
          <div className="parsed">
            <div className="field">
              <label htmlFor="qa-amt">Amount</label>
              <AmountField id="qa-amt" value={amount} onChange={setAmount} />
            </div>
            <div className="field">
              <label htmlFor="qa-store">Store</label>
              <input className="input" id="qa-store" autoComplete="off" value={store} onChange={(e) => { setStore(e.target.value); remember(e.target.value); }} />
            </div>
            {catField}
            {dateField}
          </div>
          {memoEl}
          {chips}
        </>
      )}
      {yearBanner}
      <p className="faint small">Adds to {MONTHS[m]} {year}, based on the date.</p>
    </Modal>
  );
}

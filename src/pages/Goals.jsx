import { useMemo, useState } from 'react';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { AmountField, Bar, Money } from '../components/Money.jsx';
import { useToast } from '../components/Toasts.jsx';
import { money, MONTHS_SHORT, parseAmount } from '../lib/format.js';
import { href } from '../lib/router.js';
import * as W from '../data/worth.js';

/** "Mar 2027" for n months after this month. */
function monthsFromNow(n) {
  const d = new Date();
  const t = d.getMonth() + n;
  return `${MONTHS_SHORT[((t % 12) + 12) % 12]} ${d.getFullYear() + Math.floor(t / 12)}`;
}
const duration = (n) => {
  const y = Math.floor(n / 12), m = n % 12;
  return [y && `${y} ${y === 1 ? 'year' : 'years'}`, m && `${m} ${m === 1 ? 'month' : 'months'}`].filter(Boolean).join(' ') || 'now';
};

function GoalModal({ data, goal, onSave, onClose }) {
  const [label, setLabel] = useState(goal?.label || '');
  const [target, setTarget] = useState(goal ? String(goal.target || '') : '');
  const [bucketId, setBucketId] = useState(goal?.bucketId || '');
  const [err, setErr] = useState(null);
  const buckets = W.allBuckets(data).filter((b) => !b.archived || b.id === goal?.bucketId);
  const groups = [...new Set(buckets.map((b) => b.group))];
  const linkedTotal = bucketId ? W.bucketTotal(data, bucketId) : 0;
  const submit = () => {
    if (!label.trim()) return setErr('Give the goal a name.');
    if (!(parseAmount(target) > 0)) return setErr('Enter a target amount.');
    onSave({ label: label.trim(), target: parseAmount(target), bucketId });
  };
  return (
    <Modal
      title={goal ? 'Edit goal' : 'New goal'}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
          <button className="btn primary" type="submit">{goal ? 'Save' : 'Create goal'}</button>
        </>
      }
    >
      <div className="field">
        <label htmlFor="g-name">Goal name</label>
        <input className="input" id="g-name" placeholder="e.g. House down payment" value={label} onChange={(e) => setLabel(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="g-target">Target amount</label>
        <AmountField id="g-target" value={target} onChange={setTarget} allowNegative={false} />
      </div>
      <div className="field">
        <label htmlFor="g-link">Fill it from a savings bucket</label>
        <select className="select" id="g-link" value={bucketId} onChange={(e) => setBucketId(e.target.value)}>
          <option value="">No, I’ll add money by hand</option>
          {groups.map((grp) => (
            <optgroup key={grp} label={grp}>
              {buckets.filter((b) => b.group === grp).map((b) => (
                <option key={b.id} value={b.id}>{b.label}{b.archived ? ' (hidden)' : ''}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="faint small">
          {bucketId
            ? <>Everything you mark as saved in this bucket on the Budget page counts, past months included (<Money value={linkedTotal} /> so far). You can still add money by hand too.</>
            : 'Add money to it yourself with “Add cash” as you set it aside.'}
        </p>
      </div>
      {err && <p className="small t-spend" role="alert">{err}</p>}
    </Modal>
  );
}

function GoalCard({ data, update, goal, onEdit }) {
  const toast = useToast();
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState('');
  const progress = W.goalProgress(data, goal);
  const target = Number(goal.target) || 0;
  const pct = target > 0 ? progress / target : 0;
  const bucket = goal.bucketId ? W.allBuckets(data).find((b) => b.id === goal.bucketId) : null;
  const byHand = Number(goal.saved) || 0;

  const addCash = (e) => {
    e.preventDefault();
    const v = parseAmount(amount);
    if (!v) return;
    update((d) => W.addGoalCash(d, goal.id, v));
    toast(`${v > 0 ? 'Added' : 'Took out'} ${money(Math.abs(v))} ${v > 0 ? 'to' : 'from'} ${goal.label}`, { onUndo: () => update((d) => W.addGoalCash(d, goal.id, -v)) });
    setAmount('');
    setAdding(false);
  };
  const remove = () => {
    const index = data.savingsGoals.findIndex((g) => g.id === goal.id);
    update((d) => W.removeGoal(d, goal.id).data);
    toast(`Removed goal ${goal.label}`, { duration: 10000, onUndo: () => update((d) => W.insertGoal(d, index, goal)) });
  };

  return (
    <section className="card goal">
      <div className="row between" style={{ flexWrap: 'nowrap' }}>
        <h2 className="ellipsis">{goal.label}</h2>
        <span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
          <button className="iconbtn" type="button" aria-label={`Edit ${goal.label}`} onClick={onEdit}><Icon name="edit" size={15} /></button>
          <button className="iconbtn del" type="button" aria-label={`Remove ${goal.label}`} onClick={remove}><Icon name="trash" size={15} /></button>
        </span>
      </div>
      <p><span className="big"><Money value={progress} decimals={0} /></span> <span className="muted">of <Money value={target} decimals={0} /></span></p>
      <Bar value={progress} max={target} kind="save" overIsBad={false} />
      <p className="muted small">
        {pct >= 1 ? <span className="chip ok"><Icon name="check" size={12} /> Reached</span> : <>{Math.round(pct * 100)}% · <Money value={Math.max(target - progress, 0)} decimals={0} /> to go</>}
      </p>
      {goal.bucketId ? (
        <p className="small row" style={{ gap: 6 }}>
          {bucket ? <span className="chip save">{bucket.label} bucket</span> : <span className="chip warn">Linked bucket was deleted</span>}
          <span className="muted">{byHand ? <>plus <Money value={byHand} decimals={0} /> added by hand</> : 'Fills from what you save each month'}</span>
        </p>
      ) : (
        <p className="small muted">Manual goal: add money as you set it aside.</p>
      )}
      {adding ? (
        <form className="row" style={{ flexWrap: 'nowrap' }} onSubmit={addCash} noValidate>
          <AmountField value={amount} onChange={setAmount} label={`Amount to add to ${goal.label}`} autoFocus className="grow" />
          <button className="btn primary" type="submit">Add</button>
          <button className="btn ghost" type="button" onClick={() => { setAdding(false); setAmount(''); }}>Cancel</button>
        </form>
      ) : (
        <button className="btn sm" type="button" style={{ alignSelf: 'flex-start' }} onClick={() => setAdding(true)}>
          <Icon name="plus" size={14} /> Add cash
        </button>
      )}
    </section>
  );
}

const SOURCE = { set: 'your usual payment', budget: 'latest from Budget', estimate: 'estimated minimum' };

function PayoffPlanner({ data }) {
  const [strategy, setStrategy] = useState('avalanche');
  const [extra, setExtra] = useState(0);
  const debts = useMemo(() => W.planDebts(data), [data]);
  const result = useMemo(() => W.simulatePayoff(debts, extra, strategy), [debts, extra, strategy]);
  const base = useMemo(() => W.simulatePayoff(debts, 0, strategy), [debts, strategy]);
  const monthly = debts.reduce((s, d) => s + d.payment.amount, 0);
  const noApr = debts.filter((d) => !d.apr);
  const stuck = debts.filter((d) => !result.order.some((o) => o.id === d.id));

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2>Debt payoff planner</h2>
          <p className="sub">Uses each debt’s balance, APR and monthly payment from Net worth</p>
        </div>
        {debts.length > 0 && (
          <div className="seg" role="group" aria-label="Strategy">
            <button type="button" aria-pressed={strategy === 'avalanche'} onClick={() => setStrategy('avalanche')}>Avalanche</button>
            <button type="button" aria-pressed={strategy === 'snowball'} onClick={() => setStrategy('snowball')}>Snowball</button>
          </div>
        )}
      </div>
      {debts.length === 0 ? (
        <p className="empty">
          No debts to plan for. If you have a loan or a card balance, <a className="link" href={href('net-worth')}>add it on Net worth</a> with its APR and monthly payment.
        </p>
      ) : (
        <div className="pad stack" style={{ gap: 18 }}>
          <div className="row between" style={{ alignItems: 'flex-end', gap: 16 }}>
            <p className="muted small" style={{ maxWidth: '52ch' }}>
              {strategy === 'avalanche' ? 'Pays the highest interest rate first. Costs the least overall.' : 'Pays the smallest balance first. Quicker early wins.'}{' '}
              When a debt is paid off, its payment rolls into the next one.
            </p>
            <div className="field" style={{ flex: '0 1 320px' }}>
              <label htmlFor="extra">Extra each month: <b className="num" style={{ color: 'var(--fg)' }}><Money value={extra} decimals={0} /></b></label>
              <input id="extra" type="range" min="0" max={Math.max(1000, Math.ceil(monthly / 100) * 100)} step="25" value={extra} onChange={(e) => setExtra(Number(e.target.value))} className="range" />
            </div>
          </div>

          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Debt</th><th className="r">Balance</th><th className="r">APR</th><th className="r">Monthly payment</th></tr></thead>
              <tbody>
                {debts.map((d) => (
                  <tr key={d.id}>
                    <td>{d.label}</td>
                    <td className="r num"><Money value={d.balance} decimals={0} /></td>
                    <td className={`r num ${d.apr ? '' : 'faint'}`}>{d.apr ? `${d.apr}%` : 'not set'}</td>
                    <td className="r num"><Money value={d.payment.amount} /> <span className="faint small">({SOURCE[d.payment.source]})</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {noApr.length > 0 && (
            <p className="banner warn small">
              <Icon name="info" size={15} />
              <span>No APR set for {noApr.map((d) => d.label).join(', ')}, so it’s treated as 0% interest. Set it on <a className="link" href={href('net-worth')}>Net worth</a> for a real date.</span>
            </p>
          )}

          <div className="grid-2 top">
            <div className="card flat">
              <p className="eyebrow" style={{ padding: '12px 20px 4px' }}>Payoff order</p>
              <div className="list">
                {result.order.map((o, i) => (
                  <div className="li" key={o.id}>
                    <span className="chip">{i + 1}</span>
                    <div className="grow name">{o.label}</div>
                    <span className="muted num small">paid off {monthsFromNow(o.month)}</span>
                  </div>
                ))}
                {stuck.map((d) => (
                  <div className="li" key={d.id}>
                    <span className="chip bad">!</span>
                    <div className="grow name">{d.label}</div>
                    <span className="t-spend small">not within 50 years</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="plan-result">
              {result.done ? (
                <>
                  <p className="eyebrow">Debt-free by</p>
                  <p className="plan-date">{monthsFromNow(result.months)}</p>
                  <p className="muted num">{duration(result.months)} · <Money value={result.interest} /> interest</p>
                  {extra > 0 && base.done && (
                    <>
                      <hr />
                      <p className="small">Without the extra: <b className="num">{duration(base.months)}</b>, <Money value={base.interest} /> interest.</p>
                      {base.months > result.months && (
                        <p className="t-income small" style={{ fontWeight: 600 }}>
                          The extra saves {duration(base.months - result.months)} and <Money value={base.interest - result.interest} />.
                        </p>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <p className="eyebrow">Not paid off</p>
                  <p className="small">At these payments, {stuck.map((d) => d.label).join(' and ')} {stuck.length === 1 ? 'isn’t' : 'aren’t'} paid off within 50 years: the payment barely covers the interest. Try a bigger extra payment.</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function Goals({ data, update }) {
  const toast = useToast();
  const [editing, setEditing] = useState(null); // 'new' or a goal

  const save = (fields) => {
    if (editing === 'new') {
      update((d) => W.addGoal(d, fields).data);
      toast(`Created goal ${fields.label}`);
    } else {
      update((d) => W.editGoal(d, editing.id, fields));
      toast('Goal saved');
    }
    setEditing(null);
  };

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <p className="eyebrow">Plan ahead</p>
          <h1>Goals &amp; debt</h1>
        </div>
        <button className="btn primary" type="button" onClick={() => setEditing('new')}><Icon name="plus" size={15} /> New goal</button>
      </div>

      {data.savingsGoals.length === 0 ? (
        <section className="card pad stack tight">
          <h2>No savings goals yet</h2>
          <p className="muted">Set a target, like an emergency fund or a trip, and track it. Link it to a savings bucket and it fills up from what you save each month.</p>
          <div><button className="btn" type="button" onClick={() => setEditing('new')}><Icon name="plus" size={15} /> New goal</button></div>
        </section>
      ) : (
        <div className="goals">
          {data.savingsGoals.map((g) => (
            <GoalCard key={g.id} data={data} update={update} goal={g} onEdit={() => setEditing(g)} />
          ))}
        </div>
      )}

      <PayoffPlanner data={data} />

      {editing && <GoalModal data={data} goal={editing === 'new' ? null : editing} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}

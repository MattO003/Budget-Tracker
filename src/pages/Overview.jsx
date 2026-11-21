import { useMemo } from 'react';
import { summarize } from '../data/model.js';
import { href } from '../lib/router.js';

const Stat = ({ label, value }) => (
  <div className="stat">
    <p className="eyebrow">{label}</p>
    <p className="v">{value}</p>
  </div>
);

/**
 * Temporary Overview for steps 1–3: proves your real data loaded intact.
 * The full Overview from the mockup replaces this in step 4.
 */
export default function Overview({ data, user }) {
  const s = useMemo(() => summarize(data), [data]);
  const first = (user.displayName || '').split(' ')[0];
  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <p className="eyebrow">Overview</p>
          <h1>{first ? `Welcome back, ${first}` : 'Welcome back'}</h1>
        </div>
        <a className="btn primary" href={href('settings', 'backup')}>Download a backup</a>
      </div>

      <section className="card">
        <div className="card-head">
          <div>
            <h2>Your data loaded</h2>
            <p className="sub">A quick count of what’s in your account, so you can check nothing is missing.</p>
          </div>
          <span className="chip ok">Connected</span>
        </div>
        <div className="pad stack tight">
          <div className="stats">
            <Stat label="Years" value={s.years.length ? s.years.join(', ') : 'None'} />
            <Stat label="Months with entries" value={s.monthsWithData} />
            <Stat label="Purchases logged" value={s.transactions} />
            <Stat label="Income entries" value={s.incomeEntries} />
            <Stat label="Bills" value={`${s.bills} in ${s.billGroups} groups`} />
            <Stat label="Savings buckets" value={s.savingsBuckets} />
            <Stat label="Assets" value={s.assets} />
            <Stat label="Debts" value={s.debts} />
            <Stat label="Savings goals" value={s.goals} />
          </div>
          <p className="muted small">The full Overview page from the mockup arrives with the other pages in the next step.</p>
        </div>
      </section>
    </div>
  );
}

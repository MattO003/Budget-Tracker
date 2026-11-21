import Icon from '../components/Icon.jsx';
import { PAGES } from '../lib/router.js';

/** Placeholder for pages that are still being rebuilt (step 4 of the plan). */
export default function ComingSoon({ page }) {
  const p = PAGES.find((x) => x.id === page);
  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <p className="eyebrow">{p?.label}</p>
          <h1>{p?.label}</h1>
        </div>
      </div>
      <section className="card pad row" style={{ gap: 14, alignItems: 'flex-start', flexWrap: 'nowrap' }}>
        <span className="muted"><Icon name="tools" size={22} /></span>
        <div className="stack tight">
          <h2>Being rebuilt</h2>
          <p className="muted">
            This page is next on the list. Until it’s ready, keep using the current app for {p?.label.toLowerCase()}. Your data is the
            same in both.
          </p>
        </div>
      </section>
    </div>
  );
}

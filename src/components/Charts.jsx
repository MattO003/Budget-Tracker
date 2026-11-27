import { useMemo, useRef, useState } from 'react';
import { Money } from './Money.jsx';
import { MONTHS_SHORT, moneyShort } from '../lib/format.js';

/** 4–6 round tick values covering [lo, hi]. */
export function niceTicks(lo, hi, count = 4) {
  if (hi === lo) hi = lo + 1;
  const raw = (hi - lo) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((f) => f * mag).find((s) => s >= raw) || raw;
  const start = Math.floor(lo / step) * step;
  const ticks = [];
  for (let v = start; v <= hi + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  if (ticks[ticks.length - 1] < hi) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

const toTime = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
};
const fmtDay = (iso) => {
  const [y, m, d] = String(iso).split('-').map(Number);
  return `${MONTHS_SHORT[(m || 1) - 1]} ${d || 1}, ${y}`;
};

/** Floating readout next to the pointer; amounts blur in privacy mode. */
function Tip({ x, y, children }) {
  return (
    <div className="chart-tip" style={{ left: `${x}%`, top: y, transform: `translate(${x > 60 ? 'calc(-100% - 12px)' : '12px'}, -50%)` }}>
      {children}
    </div>
  );
}

const W = 640;

/**
 * Net worth over time. Points are placed by date, so uneven logging still
 * reads true. Assets and debts are drawn only when you have debts (otherwise
 * assets equal net worth and the lines would sit on top of each other).
 */
export function NetWorthChart({ series, height = 240 }) {
  const [hover, setHover] = useState(null);
  const svg = useRef(null);
  const showParts = series.some((p) => p.debts > 0);
  const H = height, pl = 52, pr = 14, pt = 12, pb = 28;

  const g = useMemo(() => {
    if (series.length < 2) return null;
    const times = series.map((p) => toTime(p.date));
    const t0 = times[0], t1 = times[times.length - 1];
    const vals = series.flatMap((p) => (showParts ? [p.net, p.assets, p.debts] : [p.net]));
    const ticks = niceTicks(Math.min(0, ...vals), Math.max(...vals));
    const lo = ticks[0], hi = ticks[ticks.length - 1];
    const x = (t) => pl + ((t - t0) / (t1 - t0 || 1)) * (W - pl - pr);
    const y = (v) => pt + (1 - (v - lo) / (hi - lo || 1)) * (H - pt - pb);
    const xs = times.map(x);
    const line = (key) => series.map((p, i) => `${xs[i].toFixed(1)},${y(p[key]).toFixed(1)}`).join(' ');
    // ~5 date labels, evenly spaced in time
    const span = t1 - t0;
    const n = Math.min(5, series.length);
    const xTicks = Array.from({ length: n }, (_, i) => t0 + (span * i) / (n - 1 || 1)).map((t) => {
      const d = new Date(t);
      const label = span > 400 * 864e5 ? `${MONTHS_SHORT[d.getUTCMonth()]} ’${String(d.getUTCFullYear()).slice(2)}` : `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
      return { x: x(t), label };
    });
    return { xs, y, ticks, line, xTicks, zero: y(0) };
  }, [series, showParts, H]);

  if (series.length === 0) return <p className="empty">Add an asset or debt with its value to start the chart.</p>;
  if (!g) return <p className="empty">Log a second value (on a different date) to see a trend line.</p>;

  const last = series.length - 1;
  const onMove = (e) => {
    const r = svg.current.getBoundingClientRect();
    const vx = ((e.clientX - r.left) / r.width) * W;
    let best = 0;
    g.xs.forEach((x, i) => { if (Math.abs(x - vx) < Math.abs(g.xs[best] - vx)) best = i; });
    setHover(best);
  };
  const onKey = (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setHover((h) => Math.max(0, Math.min(last, (h ?? last) + (e.key === 'ArrowLeft' ? -1 : 1))));
  };
  const h = hover !== null ? series[hover] : null;

  return (
    <div className="chart-box">
      <svg
        ref={svg}
        className="chart"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={`Net worth from ${fmtDay(series[0].date)} to ${fmtDay(series[last].date)}. Use the arrow keys to read values.`}
        tabIndex={0}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        onKeyDown={onKey}
        onBlur={() => setHover(null)}
      >
        {g.ticks.map((t) => (
          <g key={t}>
            <line className={t === 0 ? 'base' : 'grid'} x1={pl} x2={W - pr} y1={g.y(t)} y2={g.y(t)} />
            <text className="ylab" x={pl - 8} y={g.y(t) + 4} textAnchor="end">{moneyShort(t)}</text>
          </g>
        ))}
        {g.xTicks.map((t, i) => (
          <text key={i} x={t.x} y={H - 8} textAnchor={i === 0 ? 'start' : i === g.xTicks.length - 1 ? 'end' : 'middle'}>{t.label}</text>
        ))}
        <polygon points={`${g.xs[0]},${g.zero} ${g.line('net')} ${g.xs[last]},${g.zero}`} fill="var(--accent)" opacity=".10" />
        {showParts && <polyline points={g.line('assets')} fill="none" stroke="var(--income)" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />}
        {showParts && <polyline points={g.line('debts')} fill="none" stroke="var(--spend)" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />}
        <polyline points={g.line('net')} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {h && <line className="cross" x1={g.xs[hover]} x2={g.xs[hover]} y1={12} y2={H - 28} />}
        {(h ? [hover] : [last]).map((i) => (
          <g key={i}>
            {showParts && <circle cx={g.xs[i]} cy={g.y(series[i].assets)} r="4" fill="var(--income)" stroke="var(--surface)" strokeWidth="2" />}
            {showParts && <circle cx={g.xs[i]} cy={g.y(series[i].debts)} r="4" fill="var(--spend)" stroke="var(--surface)" strokeWidth="2" />}
            <circle cx={g.xs[i]} cy={g.y(series[i].net)} r="5" fill="var(--accent)" stroke="var(--surface)" strokeWidth="2" />
          </g>
        ))}
      </svg>
      {h && (
        <Tip x={(g.xs[hover] / W) * 100} y={g.y(h.net) * (svg.current ? svg.current.getBoundingClientRect().height / H : 1)}>
          <b>{fmtDay(h.date)}</b>
          <span className="row between"><span><i className="dot" style={{ background: 'var(--accent)' }} /> Net worth</span><Money value={h.net} decimals={0} /></span>
          {showParts && <span className="row between"><span><i className="dot" style={{ background: 'var(--income)' }} /> Assets</span><Money value={h.assets} decimals={0} /></span>}
          {showParts && <span className="row between"><span><i className="dot" style={{ background: 'var(--spend)' }} /> Debts</span><Money value={h.debts} decimals={0} /></span>}
        </Tip>
      )}
      {showParts && (
        <div className="legend">
          <span><i className="dot" style={{ background: 'var(--accent)' }} />Net worth</span>
          <span><i className="dash" style={{ borderColor: 'var(--income)' }} />Assets</span>
          <span><i className="dash" style={{ borderColor: 'var(--spend)' }} />Debts</span>
        </div>
      )}
    </div>
  );
}

const SLOTS = ['--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7'];
const OTHER = '--c8';

/**
 * Share of a total. Shows the 7 biggest slices plus "Everything else", each
 * with its name, amount and percent next to it.
 */
export function Donut({ rows, label, centerLabel = 'Total' }) {
  const [hover, setHover] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const total = rows.reduce((s, r) => s + r.value, 0);
  const top = rows.slice(0, SLOTS.length);
  const rest = rows.slice(SLOTS.length);
  const slices = top.map((r, i) => ({ ...r, color: `var(${SLOTS[i]})` }));
  if (rest.length) slices.push({ key: 'other', label: `Everything else (${rest.length})`, value: rest.reduce((s, r) => s + r.value, 0), color: `var(${OTHER})`, other: true });

  const R = 44, C = 2 * Math.PI * R, GAP = slices.length > 1 ? 2 : 0;
  let acc = 0;
  const arcs = slices.map((s) => {
    const len = (s.value / total) * C;
    const arc = { ...s, dash: `${Math.max(len - GAP, 0.01)} ${C}`, offset: -acc };
    acc += len;
    return arc;
  });
  const active = hover !== null ? slices[hover] : null;

  return (
    <div className="donut-wrap">
      <div className="donut">
        <svg viewBox="0 0 120 120" width="160" height="160" role="img" aria-label={label}>
          <g transform="rotate(-90 60 60)">
            {arcs.map((a, i) => (
              <circle
                key={a.key}
                cx="60" cy="60" r={R} fill="none"
                stroke={a.color}
                strokeWidth={hover === i ? 20 : 16}
                strokeDasharray={a.dash}
                strokeDashoffset={a.offset}
                opacity={hover === null || hover === i ? 1 : 0.35}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              />
            ))}
          </g>
        </svg>
        <div className="donut-center">
          <p className="eyebrow">{active ? (active.other ? 'Everything else' : active.label) : centerLabel}</p>
          <p className="num" style={{ fontWeight: 700 }}><Money value={active ? active.value : total} decimals={0} /></p>
          {active && <p className="faint small num">{((active.value / total) * 100).toFixed(1)}%</p>}
        </div>
      </div>
      <div className="donut-list">
        {slices.map((s, i) => (
          <div key={s.key} className={`donut-row ${hover === i ? 'on' : ''}`} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <span className="row" style={{ gap: 8, flexWrap: 'nowrap', minWidth: 0 }}>
              <i className="dot" style={{ background: s.color }} />
              <span className="ellipsis">{s.label}</span>
            </span>
            <span className="num muted nowrap"><Money value={s.value} decimals={0} /> · {((s.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
        {rest.length > 0 && (
          <>
            <button className="link small" type="button" onClick={() => setShowAll((v) => !v)} style={{ alignSelf: 'flex-start', marginTop: 6 }}>
              {showAll ? 'Hide the rest' : `Show all ${rows.length}`}
            </button>
            {showAll && rest.map((s) => (
              <div key={s.key} className="donut-row sub">
                <span className="ellipsis">{s.label}</span>
                <span className="num muted nowrap"><Money value={s.value} decimals={0} /> · {((s.value / total) * 100).toFixed(1)}%</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/** Income vs. spending per month: two bars per month, hover a month for the details. */
export function MonthBars({ rows, height = 220, label, multiYear = false, onOpen }) {
  const [hover, setHover] = useState(null);
  const H = height, pl = 50, pr = 8, pt = 10, pb = 26;
  const max = Math.max(1, ...rows.flatMap((r) => [r.income, r.spent]));
  const ticks = niceTicks(0, max, 4);
  const top = ticks[ticks.length - 1];
  const w = Math.max(W, pl + pr + rows.length * 34);
  const gw = (w - pl - pr) / rows.length;
  const y = (v) => pt + (1 - v / top) * (H - pt - pb);
  const bw = Math.min(16, gw * 0.32);
  const bar = (x, v, color) => {
    if (!(v > 0)) return null;
    const h = y(0) - y(v), r = Math.min(4, h);
    // rounded top, square bottom (anchored to the baseline)
    return <path d={`M${x},${y(0)} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + bw - r} Q${x + bw},${y(v)} ${x + bw},${y(v) + r} V${y(0)} Z`} fill={color} />;
  };
  const h = hover !== null ? rows[hover] : null;

  return (
    <div className="chart-box">
      <div style={{ overflowX: 'auto' }}>
        <svg className="chart" viewBox={`0 0 ${w} ${H}`} width="100%" style={{ minWidth: Math.min(w, 460), display: 'block' }} role="img" aria-label={label}>
          {ticks.map((t) => (
            <g key={t}>
              <line className={t === 0 ? 'base' : 'grid'} x1={pl} x2={w - pr} y1={y(t)} y2={y(t)} />
              <text className="ylab" x={pl - 8} y={y(t) + 4} textAnchor="end">{moneyShort(t)}</text>
            </g>
          ))}
          {rows.map((r, i) => {
            const x0 = pl + i * gw + (gw - (bw * 2 + 2)) / 2;
            return (
              <g key={`${r.year}-${r.m}`} opacity={hover === null || hover === i ? 1 : 0.45}>
                {bar(x0, r.income, 'var(--income)')}
                {bar(x0 + bw + 2, r.spent, 'var(--spend)')}
                <text x={x0 + bw + 1} y={H - 8} textAnchor="middle">
                  {multiYear ? `${MONTHS_SHORT[r.m]} ’${String(r.year).slice(2)}` : MONTHS_SHORT[r.m]}
                </text>
                <rect
                  x={pl + i * gw} y={pt} width={gw} height={H - pt - pb + 18} fill="transparent"
                  style={{ cursor: onOpen ? 'pointer' : 'default' }}
                  onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}
                  onClick={() => onOpen?.(r)}
                />
              </g>
            );
          })}
        </svg>
      </div>
      {h && (
        <Tip x={Math.min(90, ((pl + (hover + 0.5) * gw) / w) * 100)} y={40}>
          <b>{MONTHS_SHORT[h.m]} {h.year}</b>
          <span className="row between"><span><i className="dot" style={{ background: 'var(--income)' }} /> Income</span><Money value={h.income} decimals={0} /></span>
          <span className="row between"><span><i className="dot" style={{ background: 'var(--spend)' }} /> Spent</span><Money value={h.spent} decimals={0} /></span>
          <span className="row between faint"><span>Saved</span><Money value={h.saved} decimals={0} /></span>
          {onOpen && <span className="faint small">Click to open this month</span>}
        </Tip>
      )}
      <div className="legend">
        <span><i className="dot" style={{ background: 'var(--income)' }} />Income</span>
        <span><i className="dot" style={{ background: 'var(--spend)' }} />Spent</span>
      </div>
    </div>
  );
}

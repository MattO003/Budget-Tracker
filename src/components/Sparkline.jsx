/** Small trend line (net worth over time). `values` oldest → newest. */
export default function Sparkline({ values, height = 64, label }) {
  if (values.length < 2) return null;
  const w = 300;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - 6 - ((v - min) / (max - min || 1)) * (height - 14)]);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = pts[pts.length - 1];
  const up = values[values.length - 1] >= values[0];
  const color = up ? 'var(--income)' : 'var(--spend)';
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={label}>
      <polygon points={`0,${height} ${line} ${w},${height}`} fill={color} opacity=".12" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={lx - 3} cy={ly} r="3.5" fill={color} />
    </svg>
  );
}

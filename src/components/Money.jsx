import { useState } from 'react';
import { money, parseAmount } from '../lib/format.js';

/** A dollar amount. Blurred when privacy mode is on (class "m"). */
export function Money({ value, decimals = 2, className = '' }) {
  return <span className={`m num ${className}`}>{money(value, decimals)}</span>;
}

const AMOUNT = /^-?\d*(?:[.,]\d{0,2})?$/;
const clean = (t) => t.replace(/[$\s,]/g, '');

/**
 * Amount field bound to stored data. Saves as you type, but keeps exactly what
 * you typed (e.g. "12.") while the field is focused.
 */
export function MoneyInput({ value, onChange, size = 'sm', label, id, placeholder = '0.00', allowNegative = false }) {
  const [draft, setDraft] = useState(null);
  const stored = Number(value) ? String(Number(value)) : '';
  return (
    <label className={`money ${size}`}>
      <span aria-hidden="true">$</span>
      <input
        className="input"
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        placeholder={placeholder}
        value={draft ?? stored}
        onFocus={(e) => {
          setDraft(stored);
          e.target.select();
        }}
        onBlur={() => setDraft(null)}
        onChange={(e) => {
          const t = clean(e.target.value);
          if (!AMOUNT.test(t) || (!allowNegative && t.startsWith('-'))) return;
          setDraft(t);
          onChange(parseAmount(t));
        }}
      />
    </label>
  );
}

/** Amount field for forms (holds text; parse with parseAmount on submit). */
export function AmountField({ value, onChange, id, label, placeholder = '0.00', className = '', inputClassName = '', allowNegative = true, autoFocus, prefixStyle }) {
  return (
    <label className={`money ${className}`}>
      <span aria-hidden="true" style={prefixStyle}>$</span>
      <input
        className={`input ${inputClassName}`}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => {
          const t = clean(e.target.value);
          if (!AMOUNT.test(t) || (!allowNegative && t.startsWith('-'))) return;
          onChange(t);
        }}
      />
    </label>
  );
}

/** Progress bar; turns red past 100% when `overIsBad`. */
export function Bar({ value, max, kind = '', overIsBad = true }) {
  const pct = max > 0 ? Math.min(value / max, 1) * 100 : value > 0 ? 100 : 0;
  const over = overIsBad && value > max + 0.004;
  return (
    <div className={`bar ${kind} ${over ? 'over' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <i style={{ width: `${pct}%` }} />
    </div>
  );
}

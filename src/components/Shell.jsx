import { useEffect, useState } from 'react';
import Icon from './Icon.jsx';
import { PAGES, href } from '../lib/router.js';

const THEMES = [
  ['light', 'sun', 'Light'],
  ['dark', 'moon', 'Dark'],
  ['system', 'monitor', 'System'],
];

function useTick(ms) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

function savedAgo(date) {
  if (!date) return 'All changes saved';
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 10) return 'Saved just now';
  if (s < 60) return `Saved ${s}s ago`;
  const m = Math.round(s / 60);
  return m < 60 ? `Saved ${m} min ago` : `Saved at ${date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export function SaveStatus({ status, lastSavedAt }) {
  useTick(15000);
  const text = {
    loading: 'Loading…',
    saved: savedAgo(lastSavedAt),
    pending: 'Unsaved changes…',
    saving: 'Saving…',
    readonly: 'Test mode: saving is off',
    error: "Couldn't save",
  }[status];
  return (
    <small>
      <span className={`save-dot ${status}`} aria-hidden="true" />
      {text}
    </small>
  );
}

function Avatar({ user }) {
  const initial = (user.displayName || user.email || '?').trim()[0]?.toUpperCase();
  return (
    <div className="avatar" aria-hidden="true">
      {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : initial}
    </div>
  );
}

export default function Shell({ user, page, theme, onTheme, status, lastSavedAt, onQuickAdd, privacy, onTogglePrivacy, children }) {
  const privacyLabel = privacy ? 'Show amounts' : 'Hide amounts';
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  return (
    <div className="app">
      <aside className="side" aria-label="Main navigation">
        <div className="brand">
          <div className="brand-mark">F</div>
          <b>Financial OS</b>
        </div>
        <button className="btn primary" type="button" onClick={onQuickAdd}>
          <Icon name="plus" size={16} /> Add transaction <kbd title="Keyboard shortcut">N</kbd>
        </button>
        <nav className="nav">
          {PAGES.map((p) => (
            <a key={p.id} href={href(p.id)} aria-current={page === p.id ? 'page' : undefined}>
              <Icon name={p.icon} />
              {p.label}
            </a>
          ))}
        </nav>
        <div className="side-foot">
          <button className="btn ghost" type="button" onClick={onTogglePrivacy} aria-pressed={privacy} style={{ justifyContent: 'flex-start' }}>
            <Icon name={privacy ? 'eyeOff' : 'eye'} size={16} /> {privacyLabel}
          </button>
          <div className="seg" role="group" aria-label="Theme">
            {THEMES.map(([t, icon, label]) => (
              <button key={t} type="button" onClick={() => onTheme(t)} aria-pressed={theme === t} aria-label={`${label} theme`} title={label} style={{ flex: 1, display: 'grid', placeItems: 'center' }}>
                <Icon name={icon} size={16} />
              </button>
            ))}
          </div>
          <div className="who">
            <Avatar user={user} />
            <div style={{ minWidth: 0 }}>
              <b>{user.displayName || user.email}</b>
              <SaveStatus status={status} lastSavedAt={lastSavedAt} />
            </div>
          </div>
        </div>
      </aside>

      <div style={{ minWidth: 0 }}>
        <header className="topbar">
          <div className="brand" style={{ padding: 0 }}>
            <div className="brand-mark">F</div>
            <b>Financial OS</b>
          </div>
          <div className="row" style={{ gap: 2 }}>
            <button className="iconbtn" type="button" onClick={onTogglePrivacy} aria-pressed={privacy} aria-label={privacyLabel}>
              <Icon name={privacy ? 'eyeOff' : 'eye'} />
            </button>
            <button className="iconbtn" type="button" onClick={() => onTheme(isDark ? 'light' : 'dark')} aria-label="Switch theme">
              <Icon name={isDark ? 'sun' : 'moon'} />
            </button>
            <a className="iconbtn" href={href('settings')} aria-label="Settings">
              <Icon name="gear" />
            </a>
          </div>
        </header>
        <main>{children}</main>
      </div>

      <nav className="bottomnav" aria-label="Main navigation">
        {PAGES.slice(0, 5).map((p) => (
          <a key={p.id} href={href(p.id)} aria-current={page === p.id ? 'page' : undefined}>
            <Icon name={p.icon} size={20} />
            <span>{p.short}</span>
          </a>
        ))}
      </nav>
      <button className="fab" type="button" onClick={onQuickAdd} aria-label="Add transaction">
        <Icon name="plus" size={22} />
      </button>
    </div>
  );
}

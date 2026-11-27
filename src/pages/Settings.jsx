import { useEffect, useRef, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase.js';
import { href, subPage } from '../lib/router.js';
import { MONTHS, money, pad2 } from '../lib/format.js';
import { summarize } from '../data/model.js';
import { hiddenPurchases } from '../data/budget.js';
import { BackupError, downloadBackup, parseBackup } from '../data/backup.js';
import Icon from '../components/Icon.jsx';
import Modal from '../components/Modal.jsx';
import { useToast } from '../components/Toasts.jsx';
import SettingsCategories from './SettingsCategories.jsx';
import { devicePlatform, useInstall } from '../lib/install.js';

const TABS = [
  ['categories', 'Categories'],
  ['backup', 'Backup'],
  ['appearance', 'Appearance'],
  ['install', 'Phone app'],
  ['account', 'Account'],
];

const LAST_BACKUP_KEY = 'fos.lastBackupAt';
const readLastBackup = () => {
  try {
    return localStorage.getItem(LAST_BACKUP_KEY);
  } catch {
    return null;
  }
};
const fmtDate = (iso) =>
  new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });

const COMPARE_ROWS = [
  ['Years', (s) => (s.years.length ? s.years.join(', ') : 'None')],
  ['Months with entries', (s) => s.monthsWithData],
  ['Purchases logged', (s) => s.transactions],
  ['Income entries', (s) => s.incomeEntries],
  ['Bills', (s) => s.bills],
  ['Savings buckets', (s) => s.savingsBuckets],
  ['Assets', (s) => s.assets],
  ['Debts', (s) => s.debts],
  ['Savings goals', (s) => s.goals],
];

function BackupTab({ data, replaceAll, writesEnabled }) {
  const toast = useToast();
  const fileInput = useRef(null);
  const [lastBackup, setLastBackup] = useState(readLastBackup);
  const [pending, setPending] = useState(null); // parsed backup awaiting confirmation
  const [error, setError] = useState(null);
  const [restoring, setRestoring] = useState(false);

  const download = () => {
    const now = new Date();
    downloadBackup(data, now);
    try {
      localStorage.setItem(LAST_BACKUP_KEY, now.toISOString());
    } catch {
      /* storage unavailable: fine */
    }
    setLastBackup(now.toISOString());
    toast('Backup downloaded');
  };

  const pickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    try {
      setPending({ ...parseBackup(await file.text()), fileName: file.name });
    } catch (err) {
      setError(err instanceof BackupError ? err.message : 'That file couldn’t be read.');
    }
  };

  const confirmRestore = async () => {
    setRestoring(true);
    try {
      downloadBackup(data); // safety copy of what's about to be replaced
      await replaceAll(pending.data);
      toast(`Restored backup${pending.exportedAt ? ` from ${fmtDate(pending.exportedAt)}` : ''}`);
      setPending(null);
    } catch {
      setError('The restore didn’t finish. Your data was not changed. Try again.');
    } finally {
      setRestoring(false);
    }
  };

  const current = summarize(data);
  const hidden = hiddenPurchases(data);

  return (
    <div className="stack measure">
      <section className="card pad stack tight">
        <h2>What’s in your account</h2>
        <table className="compare">
          <tbody>
            {COMPARE_ROWS.map(([label, get]) => (
              <tr key={label}><td>{label}</td><td>{get(current)}</td></tr>
            ))}
          </tbody>
        </table>
        {hidden.length > 0 && (
          <div className="banner warn" role="status">
            <Icon name="alert" size={16} />
            <div className="stack tight" style={{ gap: 4 }}>
              <b>Some purchases aren’t counted</b>
              <span>They’re filed under a category that’s no longer in their month. Open the month to bring it back.</span>
              {hidden.map((h) => (
                <a key={`${h.year}-${h.m}-${h.catId}`} className="link" href={href('budget', `${h.year}-${pad2(h.m + 1)}`)}>
                  {MONTHS[h.m]} {h.year}: {h.label}, {h.count} {h.count === 1 ? 'purchase' : 'purchases'} ({money(h.total)})
                </a>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="card pad stack tight">
        <h2>Download a backup</h2>
        <p className="muted">
          Saves everything in your account (every year and month, assets, debts and goals) as one file on this device. Keep a copy
          before big changes. You can restore it below.
        </p>
        <div className="row">
          <button className="btn primary" type="button" onClick={download}>
            <Icon name="download" size={16} /> Download backup
          </button>
          <span className="faint small">Last backup on this device: {lastBackup ? fmtDate(lastBackup) : 'never'}</span>
        </div>
      </section>

      <section className="card pad stack tight">
        <h2>Restore from a backup</h2>
        <p className="muted">
          Replaces everything in your account with what’s in the file. You’ll see what the file contains before anything changes, and
          a copy of your current data downloads first.
        </p>
        {!writesEnabled && (
          <div className="banner warn">
            <Icon name="info" size={16} />
            <span>Restoring is off in test mode, because it would change your real data.</span>
          </div>
        )}
        <div className="row">
          <button className="btn" type="button" onClick={() => fileInput.current?.click()} disabled={!writesEnabled}>
            <Icon name="upload" size={16} /> Choose backup file
          </button>
          <input ref={fileInput} type="file" accept=".json,application/json" onChange={pickFile} hidden />
        </div>
        {error && (
          <div className="banner error" role="alert">
            <Icon name="alert" size={16} />
            <span>{error}</span>
          </div>
        )}
      </section>

      {pending && (
        <Modal
          title="Replace your data with this backup?"
          onClose={() => !restoring && setPending(null)}
          footer={
            <>
              <button className="btn ghost" type="button" onClick={() => setPending(null)} disabled={restoring}>
                Cancel
              </button>
              <button className="btn danger solid" type="button" onClick={confirmRestore} disabled={restoring}>
                {restoring ? 'Restoring…' : 'Replace my data'}
              </button>
            </>
          }
        >
          <p className="muted small">
            {pending.fileName}
            {pending.exportedAt ? ` · made ${fmtDate(pending.exportedAt)}` : ''}
          </p>
          <table className="compare">
            <thead>
              <tr>
                <th />
                <th>Now</th>
                <th>In backup</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_ROWS.map(([label, get]) => (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{get(current)}</td>
                  <td>{get(pending.summary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small">
            A copy of your current data downloads first, so you can undo this by restoring that file.
          </p>
        </Modal>
      )}
    </div>
  );
}

function AppearanceTab({ theme, onTheme }) {
  return (
    <section className="card pad stack tight measure">
      <h2>Theme</h2>
      <p className="muted">Saved to your account, so it follows you to other devices. “System” matches your phone or computer.</p>
      <div className="seg" role="group" aria-label="Theme">
        {[
          ['light', 'Light'],
          ['dark', 'Dark'],
          ['system', 'System'],
        ].map(([t, label]) => (
          <button key={t} type="button" aria-pressed={theme === t} onClick={() => onTheme(t)}>
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function InstallTab() {
  const { installed, canInstall, install } = useInstall();
  const platform = devicePlatform();
  const toast = useToast();
  return (
    <section className="card pad stack tight measure">
      <h2>Put Financial OS on your home screen</h2>
      <p className="muted">
        It installs like a regular app: its own icon, full screen with no browser bars, and it opens straight to your budget. Nothing
        to download from the App Store, and it uses the same account and data.
      </p>
      {installed ? (
        <div className="banner info"><Icon name="check" size={16} /><span>You’re using the installed app.</span></div>
      ) : canInstall ? (
        <div>
          <button className="btn primary" type="button" onClick={async () => (await install()) && toast('Installed. Look for Financial OS on your home screen.')}>
            <Icon name="download" size={16} /> Install the app
          </button>
        </div>
      ) : null}
      <div className="grid-2">
        <div className={`card flat pad ${platform === 'ios' ? 'on' : ''}`}>
          <h3>iPhone or iPad</h3>
          <ol className="steps">
            <li>Open the site in Safari</li>
            <li>Tap the Share button</li>
            <li>Tap <b>Add to Home Screen</b></li>
          </ol>
        </div>
        <div className={`card flat pad ${platform === 'android' ? 'on' : ''}`}>
          <h3>Android</h3>
          <ol className="steps">
            <li>Open the site in Chrome</li>
            <li>Tap the ⋮ menu</li>
            <li>Tap <b>Install app</b> (or <b>Add to Home screen</b>)</li>
          </ol>
          <p className="muted small" style={{ marginTop: 8 }}>Long-press the icon for an <b>Add transaction</b> shortcut.</p>
        </div>
      </div>
      <p className="faint small">On a computer, Chrome and Edge show an install icon at the right end of the address bar.</p>
    </section>
  );
}

function AccountTab({ user, beforeSignOut }) {
  return (
    <section className="card pad stack tight measure">
      <div className="row">
        <div className="avatar" style={{ width: 44, height: 44, fontSize: 16 }}>
          {user.photoURL ? <img src={user.photoURL} alt="" referrerPolicy="no-referrer" /> : (user.displayName || '?')[0]}
        </div>
        <div>
          <b>{user.displayName || 'Signed in with Google'}</b>
          <p className="muted small">{user.email}</p>
        </div>
      </div>
      <p className="muted">Your data syncs to this Google account automatically.</p>
      <div className="row">
        <button
          className="btn danger"
          type="button"
          onClick={async () => {
            await beforeSignOut();
            await signOut(auth);
          }}
        >
          <Icon name="out" size={16} /> Sign out
        </button>
      </div>
    </section>
  );
}

export default function Settings({ data, update, user, theme, onTheme, replaceAll, writesEnabled, beforeSignOut }) {
  const initial = TABS.some(([t]) => t === subPage()) ? subPage() : 'categories';
  const [tab, setTab] = useState(initial);

  useEffect(() => {
    const onHash = () => TABS.some(([t]) => t === subPage()) && setTab(subPage());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  return (
    <div className="wrap">
      <div className="page-head">
        <div>
          <p className="eyebrow">Settings</p>
          <h1>Settings</h1>
        </div>
      </div>
      <div className="seg" role="tablist" aria-label="Settings sections">
        {TABS.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'categories' && <SettingsCategories data={data} update={update} />}
      {tab === 'backup' && <BackupTab data={data} replaceAll={replaceAll} writesEnabled={writesEnabled} />}
      {tab === 'appearance' && <AppearanceTab theme={theme} onTheme={onTheme} />}
      {tab === 'install' && <InstallTab />}
      {tab === 'account' && <AccountTab user={user} beforeSignOut={beforeSignOut} />}
    </div>
  );
}

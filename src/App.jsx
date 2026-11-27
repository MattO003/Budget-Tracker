import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase.js';
import { usePage } from './lib/router.js';
import { themeFrom, useApplyTheme, withTheme } from './lib/theme.js';
import { usePrivacy } from './lib/privacy.js';
import { consumeAddShortcut } from './lib/install.js';
import { useFinanceData } from './data/useFinanceData.js';
import Shell from './components/Shell.jsx';
import Icon from './components/Icon.jsx';
import QuickAdd from './components/QuickAdd.jsx';
import { LoadErrorScreen, LoadingScreen, SignInScreen } from './components/Screens.jsx';
import Overview from './pages/Overview.jsx';
import Budget from './pages/Budget.jsx';
import Settings from './pages/Settings.jsx';
import NetWorth from './pages/NetWorth.jsx';
import Goals from './pages/Goals.jsx';
import Analytics from './pages/Analytics.jsx';

/** Press N anywhere (not while typing) to add a transaction. */
function useQuickAddShortcut(open, enabled) {
  useEffect(() => {
    const onKey = (e) => {
      if (!enabled || e.metaKey || e.ctrlKey || e.altKey || (e.key !== 'n' && e.key !== 'N')) return;
      if (e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      open();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, enabled]);
}

function SignedIn({ user }) {
  const fin = useFinanceData(user);
  const page = usePage();
  const [privacy, togglePrivacy] = usePrivacy();
  const [quickAdd, setQuickAdd] = useState(false);
  const theme = fin.data ? themeFrom(fin.data.preferences) : null;
  useApplyTheme(theme);

  const openQuickAdd = useCallback(() => setQuickAdd(true), []);
  useQuickAddShortcut(openQuickAdd, Boolean(fin.data));

  // Opened from the home-screen "Add transaction" shortcut: go straight to quick add.
  const loaded = Boolean(fin.data);
  useEffect(() => {
    if (loaded && consumeAddShortcut()) setQuickAdd(true);
  }, [loaded]);

  const setTheme = useCallback(
    (t) => fin.update((d) => ({ ...d, preferences: withTheme(d.preferences, t) })),
    [fin.update],
  );
  const beforeSignOut = useCallback(async () => {
    if (fin.hasUnsaved()) await fin.saveNow();
  }, [fin.hasUnsaved, fin.saveNow]);

  if (!fin.data && fin.status === 'error') return <LoadErrorScreen error={fin.error} onRetry={fin.retry} />;
  if (!fin.data) return <LoadingScreen />;

  const common = { data: fin.data, update: fin.update };
  let content;
  if (page === 'overview') content = <Overview {...common} onQuickAdd={openQuickAdd} />;
  else if (page === 'budget') content = <Budget {...common} />;
  else if (page === 'settings')
    content = (
      <Settings
        {...common}
        user={user}
        theme={theme}
        onTheme={setTheme}
        replaceAll={fin.replaceAll}
        writesEnabled={fin.writesEnabled}
        beforeSignOut={beforeSignOut}
      />
    );
  else if (page === 'net-worth') content = <NetWorth {...common} />;
  else if (page === 'goals') content = <Goals {...common} />;
  else if (page === 'analytics') content = <Analytics {...common} />;

  return (
    <Shell
      user={user}
      page={page}
      theme={theme}
      onTheme={setTheme}
      status={fin.status}
      lastSavedAt={fin.lastSavedAt}
      onQuickAdd={openQuickAdd}
      privacy={privacy}
      onTogglePrivacy={togglePrivacy}
    >
      {(!fin.writesEnabled || fin.status === 'error') && (
        <div className="wrap" style={{ marginBottom: 20 }}>
          {!fin.writesEnabled && (
            <div className="banner info" role="status">
              <Icon name="info" size={16} />
              <span>
                <b>Test mode.</b> You’re looking at your real data, but saving is off on this computer, so nothing you change here is
                written to your account.
              </span>
            </div>
          )}
          {fin.status === 'error' && (
            <div className="banner error row between" role="alert">
              <span className="row" style={{ gap: 8 }}>
                <Icon name="alert" size={16} /> Your last change couldn’t be saved. Check your connection.
              </span>
              <button className="btn sm" type="button" onClick={fin.saveNow}>Try again</button>
            </div>
          )}
        </div>
      )}
      {content}
      {quickAdd && <QuickAdd data={fin.data} update={fin.update} onClose={() => setQuickAdd(false)} />}
    </Shell>
  );
}

export default function App() {
  const [user, setUser] = useState(undefined); // undefined = still checking
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  if (user === undefined) return <LoadingScreen label="Starting…" />;
  if (!user) return <SignInScreen />;
  return <SignedIn key={user.uid} user={user} />;
}

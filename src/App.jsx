import { useCallback, useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './lib/firebase.js';
import { usePage } from './lib/router.js';
import { themeFrom, useApplyTheme, withTheme } from './lib/theme.js';
import { useFinanceData } from './data/useFinanceData.js';
import Shell from './components/Shell.jsx';
import Icon from './components/Icon.jsx';
import { LoadErrorScreen, LoadingScreen, SignInScreen } from './components/Screens.jsx';
import Overview from './pages/Overview.jsx';
import Settings from './pages/Settings.jsx';
import ComingSoon from './pages/ComingSoon.jsx';

function SignedIn({ user }) {
  const fin = useFinanceData(user);
  const page = usePage();
  const theme = fin.data ? themeFrom(fin.data.preferences) : null;
  useApplyTheme(theme);

  const setTheme = useCallback(
    (t) => fin.update((d) => ({ ...d, preferences: withTheme(d.preferences, t) })),
    [fin.update],
  );
  const beforeSignOut = useCallback(async () => {
    if (fin.hasUnsaved()) await fin.saveNow();
  }, [fin.hasUnsaved, fin.saveNow]);

  if (!fin.data && fin.status === 'error') return <LoadErrorScreen error={fin.error} onRetry={fin.retry} />;
  if (!fin.data) return <LoadingScreen />;

  let content;
  if (page === 'overview') content = <Overview data={fin.data} user={user} />;
  else if (page === 'settings')
    content = (
      <Settings
        data={fin.data}
        user={user}
        theme={theme}
        onTheme={setTheme}
        replaceAll={fin.replaceAll}
        writesEnabled={fin.writesEnabled}
        beforeSignOut={beforeSignOut}
      />
    );
  else content = <ComingSoon page={page} />;

  return (
    <Shell user={user} page={page} theme={theme} onTheme={setTheme} status={fin.status} lastSavedAt={fin.lastSavedAt}>
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
      {content}
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

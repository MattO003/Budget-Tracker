import { useState } from 'react';
import { signInWithPopup, signInWithRedirect, signOut } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase.js';
import Icon from './Icon.jsx';

export function LoadingScreen({ label = 'Loading your budget…' }) {
  return (
    <div className="center-screen">
      <div className="stack tight" style={{ alignItems: 'center' }}>
        <div className="spinner" aria-hidden="true" />
        <p className="muted">{label}</p>
      </div>
    </div>
  );
}

const GoogleMark = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M22.6 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.3-4.8 3.3-8.1z" />
    <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.6-2.7c-1 .7-2.2 1.1-3.7 1.1-2.9 0-5.3-1.9-6.2-4.5H2.1v2.8A11 11 0 0 0 12 23z" />
    <path fill="#FBBC05" d="M5.8 14.2a6.6 6.6 0 0 1 0-4.3V7.1H2.1a11 11 0 0 0 0 9.9l3.7-2.8z" />
    <path fill="#EA4335" d="M12 5.4c1.6 0 3.1.6 4.2 1.7l3.2-3.2A11 11 0 0 0 2.1 7.1l3.7 2.8C6.7 7.3 9.1 5.4 12 5.4z" />
  </svg>
);

function describeSignInError(e) {
  const host = window.location.hostname;
  if (e?.code?.startsWith('auth/requests-from-referer')) {
    return `The Firebase API key doesn’t accept requests from ${window.location.origin}. In Google Cloud console → APIs & Services → Credentials, open the browser API key and add “${window.location.origin}/*” under Website restrictions.`;
  }
  switch (e?.code) {
    case 'auth/unauthorized-domain':
      return `This address (${host}) isn’t allowed to sign in yet. In the Firebase console, open Authentication → Settings → Authorized domains and add “${host}”.`;
    case 'auth/network-request-failed':
      return 'Couldn’t reach Google. Check your internet connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Google sign-in is turned off for this Firebase project. Turn it on under Authentication → Sign-in method.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.';
    default:
      return 'Sign-in didn’t work. Try again, and if it keeps failing, send me the error code below.';
  }
}

export function SignInScreen() {
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    setError(null);
    setBusy(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      if (e?.code === 'auth/popup-blocked') {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      if (e?.code !== 'auth/popup-closed-by-user' && e?.code !== 'auth/cancelled-popup-request') {
        console.error('Sign-in failed', e);
        setError({ message: describeSignInError(e), code: e?.code || e?.message || 'unknown' });
      }
      setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <div className="card signin">
        <div className="brand-mark" style={{ width: 44, height: 44, fontSize: 20, borderRadius: 12 }}>F</div>
        <div className="stack tight">
          <h1>Financial OS</h1>
          <p className="muted">Your budget, net worth and goals, synced to your Google account.</p>
        </div>
        <button className="btn lg" type="button" onClick={signIn} disabled={busy} style={{ width: '100%' }}>
          <GoogleMark /> {busy ? 'Signing in…' : 'Sign in with Google'}
        </button>
        {error && (
          <div className="stack tight" role="alert" style={{ gap: 4 }}>
            <p className="t-spend small">{error.message}</p>
            <p className="faint small">Error code: {error.code}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function describeLoadError(error) {
  switch (error?.code) {
    case 'permission-denied':
      return 'This account isn’t allowed to read this budget. Try signing in with the Google account you normally use.';
    case 'unavailable':
      return 'Can’t reach the server. Check your internet connection, then try again.';
    default:
      return 'Your budget couldn’t be loaded. Try again in a moment.';
  }
}

/** Shown when the budget can't be loaded (the original app showed "Loading…" forever). */
export function LoadErrorScreen({ error, onRetry }) {
  return (
    <div className="center-screen">
      <div className="card signin">
        <span className="t-spend"><Icon name="alert" size={32} /></span>
        <div className="stack tight">
          <h2>Couldn’t load your budget</h2>
          <p className="muted">{describeLoadError(error)}</p>
          {error?.code && <p className="faint small">Error code: {error.code}</p>}
        </div>
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn" type="button" onClick={() => signOut(auth)}>Sign out</button>
          <button className="btn primary" type="button" onClick={onRetry}>Try again</button>
        </div>
      </div>
    </div>
  );
}

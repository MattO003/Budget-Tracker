import { Component, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { ToastProvider } from './components/Toasts.jsx';
import { applyCachedTheme } from './lib/theme.js';
import './styles.css';

applyCachedTheme();

/** Replaces the original app's alert() popups: show a calm screen instead of a broken page. */
class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error(error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center-screen">
        <div className="card signin">
          <h2>Something went wrong</h2>
          <p className="muted">The page hit an unexpected problem. Your saved data is safe. Reload to continue.</p>
          <button className="btn primary" type="button" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <App />
      </ToastProvider>
    </ErrorBoundary>
  </StrictMode>,
);

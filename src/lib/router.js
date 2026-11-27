import { useEffect, useState } from 'react';

export const PAGES = [
  { id: 'overview', label: 'Overview', short: 'Overview', icon: 'home' },
  { id: 'budget', label: 'Budget', short: 'Budget', icon: 'wallet' },
  { id: 'net-worth', label: 'Net worth', short: 'Net worth', icon: 'trend' },
  { id: 'goals', label: 'Goals & debt', short: 'Goals', icon: 'target' },
  { id: 'analytics', label: 'Analytics', short: 'Analytics', icon: 'chart' },
  { id: 'settings', label: 'Settings', short: 'Settings', icon: 'gear' },
];

const read = () => {
  const id = window.location.hash.replace(/^#\/?/, '').split('/')[0];
  return PAGES.some((p) => p.id === id) ? id : 'overview';
};

/** Tiny hash router: #/budget, #/settings ... (works on Netlify without redirect rules). */
export function usePage() {
  const [page, setPage] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setPage(read());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return page;
}

export const href = (id, sub) => (sub ? `#/${id}/${sub}` : `#/${id}`);

/** Second part of the hash, e.g. "backup" in #/settings/backup. */
export const subPage = () => window.location.hash.replace(/^#\/?/, '').split('/')[1] || null;

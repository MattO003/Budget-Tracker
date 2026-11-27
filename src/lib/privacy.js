import { useCallback, useEffect, useState } from 'react';

const KEY = 'fos.privacy';

/**
 * Privacy mode (from the old Update_21 version): blurs every dollar amount.
 * Remembered per device, since it's about who can see this screen.
 */
export function usePrivacy() {
  const [on, setOn] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    document.documentElement.classList.toggle('privacy', on);
    try {
      localStorage.setItem(KEY, on ? '1' : '0');
    } catch {
      /* storage unavailable: fine */
    }
  }, [on]);
  const toggle = useCallback(() => setOn((v) => !v), []);
  return [on, toggle];
}

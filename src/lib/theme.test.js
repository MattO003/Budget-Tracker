import { describe, expect, it } from 'vitest';
import { themeFrom, withTheme } from './theme.js';

// Real preferences seen in live data (left over from the Update_21 version).
const live = { darkMode: true, theme: 'ocean', compactMode: false };

describe('theme preferences', () => {
  it('ignores the old colour-scheme field and follows darkMode until a choice is made', () => {
    expect(themeFrom(live)).toBe('dark');
    expect(themeFrom({ ...live, darkMode: false })).toBe('light');
    expect(themeFrom(undefined)).toBe('light');
  });

  it('uses the new appearance field once set', () => {
    expect(themeFrom({ ...live, appearance: 'system' })).toBe('system');
    expect(themeFrom({ ...live, appearance: 'bogus' })).toBe('dark');
  });

  it('never touches the old theme / compactMode fields, and keeps darkMode in step', () => {
    expect(withTheme(live, 'light')).toEqual({ darkMode: false, theme: 'ocean', compactMode: false, appearance: 'light' });
    expect(withTheme(live, 'dark')).toMatchObject({ darkMode: true, theme: 'ocean', appearance: 'dark' });
  });
});

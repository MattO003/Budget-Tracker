import { describe, expect, it } from 'vitest';
import { BackupError, backupFileName, makeBackup, parseBackup } from './backup.js';
import { createDefaultData } from './model.js';

describe('backups', () => {
  const data = createDefaultData(2026);

  it('round-trips: what we download is what we can restore', () => {
    const file = JSON.stringify(makeBackup(data, new Date('2026-11-21T12:00:00Z')));
    const { data: restored, exportedAt, summary } = parseBackup(file);
    expect(restored).toEqual(data);
    expect(exportedAt).toBe('2026-11-21T12:00:00.000Z');
    expect(summary.years).toEqual(['2026']);
  });

  it('also accepts a bare copy of the Firestore document', () => {
    const { data: restored } = parseBackup(JSON.stringify(data));
    expect(restored).toEqual(data);
  });

  it('names files by date', () => {
    expect(backupFileName(new Date(2026, 10, 21))).toBe('financial-os-backup-2026-11-21.json');
  });

  it.each([
    ['not json', 'hello'],
    ['not an object', '[1,2,3]'],
    ['no budget data', JSON.stringify({ foo: 1 })],
    ['damaged list', JSON.stringify({ ...data, assets: 'oops' })],
    ['newer version', JSON.stringify({ app: 'financial-os', version: 99, data })],
  ])('rejects %s with a readable message', (_label, text) => {
    expect(() => parseBackup(text)).toThrow(BackupError);
  });
});

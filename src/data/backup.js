import { normalizeData, summarize } from './model.js';

export const BACKUP_APP = 'financial-os';
export const BACKUP_VERSION = 1;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Wrap the raw Firestore document in a small labelled envelope. The data itself is stored exactly as-is. */
export function makeBackup(data, now = new Date()) {
  return {
    app: BACKUP_APP,
    kind: 'backup',
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data,
  };
}

export const backupFileName = (now = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `financial-os-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
};

export class BackupError extends Error {}

/**
 * Read a backup file's text. Accepts our own backup envelope, or a bare copy of
 * the Firestore document. Throws BackupError with a message meant for the user.
 * Returns { data, exportedAt, summary }.
 */
export function parseBackup(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError("This file isn't a Financial OS backup. It couldn't be read as JSON.");
  }
  if (!isObj(parsed)) throw new BackupError("This file isn't a Financial OS backup.");

  let data = parsed;
  let exportedAt = null;
  if (parsed.app === BACKUP_APP) {
    if (typeof parsed.version !== 'number' || parsed.version > BACKUP_VERSION) {
      throw new BackupError('This backup was made by a newer version of the app. Update the app, then try again.');
    }
    data = parsed.data;
    exportedAt = typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null;
  }

  if (!isObj(data) || !isObj(data.years) || !isObj(data.categories)) {
    throw new BackupError("This file doesn't contain budget data (no years or categories were found).");
  }
  for (const key of ['assets', 'debts', 'savingsGoals']) {
    if (key in data && !Array.isArray(data[key])) {
      throw new BackupError(`This backup looks damaged: "${key}" should be a list.`);
    }
  }
  return { data: normalizeData(data), exportedAt, summary: summarize(data) };
}

/** Trigger a browser download of the given data as a backup file. */
export function downloadBackup(data, now = new Date()) {
  const blob = new Blob([JSON.stringify(makeBackup(data, now), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFileName(now);
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

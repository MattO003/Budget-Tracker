# Financial OS

Personal budget tracker: monthly budget, net worth, goals and debt payoff. Signs in with Google and stores each user's data in one Firestore document (`users/{uid}`).

## Run it locally

```sh
npm install
npm run dev
```

Open the address it prints (usually http://localhost:5173) and sign in with Google.

**Test mode:** in local development the app reads your real data, but saving is off, so nothing you change locally is written to your account. A blue "Test mode" banner shows when this is the case. To turn saving on locally, copy `.env.example` to `.env.local` and set `VITE_ALLOW_WRITES=true`. The deployed site always saves.

## Other commands

| Command | What it does |
|---|---|
| `npm test` | Runs the tests (data format, backups, saving, pages) |
| `npm run build` | Builds the site into `dist/` |
| `npm run preview` | Serves the built site locally |

## Data format

The Firestore document keeps the original app's format. New fields may be added but existing ones are never renamed or removed, so older versions of the app keep working with the same data. See `src/data/model.js`.

## Project layout

```
src/
  data/        Firestore document format, sync hook, backups (+ tests)
  pages/       One file per page
  components/  Shell, dialogs, notifications, icons
  lib/         Firebase setup, routing, theme
legacy/        The original single-file app, kept for reference (not deployed)
```

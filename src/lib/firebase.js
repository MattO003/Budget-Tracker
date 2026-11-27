import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { initializeFirestore } from 'firebase/firestore';

// Same Firebase project as the original app. These values are public by design;
// access is protected by the Firestore security rules (each user can only read
// and write users/{their uid}).
const firebaseConfig = {
  apiKey: 'AIzaSyDRIcg7GW08eoTAmpd_kUKfDirSg3LsDTE',
  authDomain: 'pfpt-budget-tracker.firebaseapp.com',
  projectId: 'pfpt-budget-tracker',
  storageBucket: 'pfpt-budget-tracker.firebasestorage.app',
  messagingSenderId: '431901940294',
  appId: '1:431901940294:web:0be497e4b7662165334847',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
// ignoreUndefinedProperties: a stray `undefined` in state is dropped instead of failing the whole save.
export const db = initializeFirestore(app, { ignoreUndefinedProperties: true });

/**
 * Saving is always on in the deployed app. During `npm run dev` it is OFF unless
 * VITE_ALLOW_WRITES=true is set in .env.local, so local testing can't change real data.
 */
export const WRITES_ENABLED = !import.meta.env.DEV || import.meta.env.VITE_ALLOW_WRITES === 'true';

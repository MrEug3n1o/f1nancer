import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import {
  connectFirestoreEmulator, getFirestore, initializeFirestore, persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { firebaseConfig } from './config';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(app);

export const firestore = (() => {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch {
    return getFirestore(app);
  }
})();

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === '1') {
  try { connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true }); } catch { /* Fast refresh */ }
  try { connectFirestoreEmulator(firestore, '127.0.0.1', 8080); } catch { /* Fast refresh */ }
}

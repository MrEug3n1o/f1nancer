export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? 'AIzaSyAzURmZ9xYEgz1qjZfpwdEpa-J46hJhDbg',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? 'f1nancer.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? 'f1nancer',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? 'f1nancer.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '8398277156',
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? '1:8398277156:web:b10f9799ea7ca399c066b1',
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? 'G-490YFZY9HL',
};

export const firebaseProjectUrl = `https://${firebaseConfig.authDomain}`;
export const legacyCloudProjectUrls = ['https://xtqudnqthpakdaonrwir.supabase.co'];

export function isSyncConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

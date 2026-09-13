export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? 'AIzaSyAzURmZ9xYEgz1qjZfpwdEpa-J46hJhDbg',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? 'f1nancer.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? 'f1nancer',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? 'f1nancer.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '8398277156',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '1:8398277156:web:b10f9799ea7ca399c066b1',
};

export const firebaseProjectUrl = `https://${firebaseConfig.authDomain}`;
export const legacyCloudProjectUrls = ['https://xtqudnqthpakdaonrwir.supabase.co'];

export function isSyncConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
}

import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "YOUR_FIREBASE_API_KEY",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "oneflux-41cbc.firebaseapp.com",
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://oneflux-41cbc-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "oneflux-41cbc",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "oneflux-41cbc.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "803427248746",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:803427248746:web:2bf0ed5b8336104a093813",
};

const app = initializeApp(firebaseConfig);

export const database = getDatabase(app);

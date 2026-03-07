import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";
import {
  getFirestore,
  enableMultiTabIndexedDbPersistence,
  initializeFirestore,
  CACHE_SIZE_UNLIMITED,
} from "firebase/firestore";

// TODO: Replace with your own config
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: "lap.onl",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// Initialize and export auth and storage
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "europe-west1");

// Initialize Firestore with settings BEFORE creating the instance
export const db =
  typeof window !== "undefined"
    ? initializeFirestore(app, {
        cacheSizeBytes: CACHE_SIZE_UNLIMITED,
      })
    : getFirestore(app);

// Enable offline persistence for Firestore
if (typeof window !== "undefined") {
  enableMultiTabIndexedDbPersistence(db).catch((err) => {
    if (err.code === "failed-precondition") {
      console.warn(
        "Firestore persistence has been disabled because multiple tabs are open",
      );
    } else if (err.code === "unimplemented") {
      console.warn("Browser does not support the required IndexedDB features");
    }
  });
}

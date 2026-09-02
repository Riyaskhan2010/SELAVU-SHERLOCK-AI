/**
 * Firebase SDK initialization.
 * Reads VITE_FIREBASE_* environment variables from frontend/.env
 */
import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";

// ─── Validate env vars ────────────────────────────────────────────────────────
// Detect genuinely missing or placeholder values without false positives.

const REQUIRED: Record<string, string | undefined> = {
  VITE_FIREBASE_API_KEY:            import.meta.env.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_APP_ID:             import.meta.env.VITE_FIREBASE_APP_ID,
};

// Only flag values that are literally empty, undefined, or contain the exact
// placeholder strings we wrote — nothing else.
const EXACT_PLACEHOLDERS = [
  "REPLACE_WITH_YOUR_API_KEY",
  "REPLACE_WITH_YOUR_PROJECT",
  "REPLACE_WITH_YOUR_PROJECT_ID",
  "REPLACE_WITH_SENDER_ID",
  "REPLACE_WITH_APP_ID",
];

function isMissing(value: string | undefined): boolean {
  if (value === undefined || value === null || value.trim() === "") return true;
  return EXACT_PLACEHOLDERS.some((p) => value.trim() === p);
}

const missingKeys = Object.entries(REQUIRED)
  .filter(([, v]) => isMissing(v))
  .map(([k]) => k);

if (missingKeys.length > 0) {
  console.error(
    "\n[Selavu Sherlock AI] Firebase config missing:\n" +
    missingKeys.map((k) => `  • ${k}`).join("\n") +
    "\n  → Open frontend/.env and set real values, then restart `npm run dev`.\n"
  );
}

// ─── Firebase config object ───────────────────────────────────────────────────

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            as string,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        as string,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         as string,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     as string,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             as string,
};

// ─── Initialize (HMR-safe) ────────────────────────────────────────────────────

let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

export const firebaseAuth: Auth = getAuth(app);
export default app;

// True when all required vars are present and non-placeholder
export const isFirebaseConfigured: boolean = missingKeys.length === 0;

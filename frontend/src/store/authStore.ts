import { create } from "zustand";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  type User as FirebaseUser,
} from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";
import { authApi } from "@/services/api";
import type { User } from "@/types";

interface AuthState {
  user: User | null;                // local DB user from backend (may be null if backend unreachable)
  firebaseUser: FirebaseUser | null; // Firebase auth state — source of truth for routing
  isLoading: boolean;
  isAuthChecked: boolean;           // true once Firebase onAuthStateChanged has fired once
  error: string | null;

  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  _onFirebaseUser: (fbUser: FirebaseUser | null) => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  firebaseUser: null,
  isLoading: false,
  isAuthChecked: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      await signInWithEmailAndPassword(firebaseAuth, email, password);
      // onAuthStateChanged fires → _onFirebaseUser handles the rest
    } catch (err: unknown) {
      set({ error: _firebaseErrorMessage(err), isLoading: false });
      throw err;
    }
  },

  register: async (email, password, fullName) => {
    set({ isLoading: true, error: null });
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, email, password);
      await updateProfile(cred.user, { displayName: fullName });
      // onAuthStateChanged fires → _onFirebaseUser handles the rest
    } catch (err: unknown) {
      set({ error: _firebaseErrorMessage(err), isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try { await signOut(firebaseAuth); } catch { /* ignore */ }
    sessionStorage.removeItem("firebase_id_token");
    set({ user: null, firebaseUser: null, isAuthChecked: true, isLoading: false });
    import("@/store/appStore").then(({ useAppStore }) => {
      useAppStore.getState().clearUserData();
    });
  },

  clearError: () => set({ error: null }),

  _onFirebaseUser: async (fbUser) => {
    // ── User signed out ──────────────────────────────────────────────────────
    if (!fbUser) {
      sessionStorage.removeItem("firebase_id_token");
      set({ user: null, firebaseUser: null, isAuthChecked: true, isLoading: false });
      return;
    }

    // ── User signed in — Firebase auth is the source of truth ───────────────
    // Set firebaseUser immediately so ProtectedRoute lets the user in.
    // isAuthChecked = true so routing decisions can proceed.
    const idToken = await fbUser.getIdToken();
    sessionStorage.setItem("firebase_id_token", idToken);

    set({ firebaseUser: fbUser, isAuthChecked: true, isLoading: false });

    // ── Attempt to sync with backend (best-effort, non-blocking) ────────────
    // If backend is unreachable or Firebase Admin is not configured,
    // the user stays authenticated via Firebase. The app still works
    // for features that don't require a backend user record.
    try {
      const backendUser = await authApi.me();
      set({ user: backendUser });

      // Refresh datasets now that we have a confirmed backend user
      import("@/store/appStore").then(({ useAppStore }) => {
        useAppStore.getState().refreshDatasets();
      });
    } catch (err: unknown) {
      // Backend unreachable or Firebase Admin not configured yet.
      // DO NOT clear firebaseUser or kick the user out.
      // They are authenticated with Firebase — that is enough to stay in the app.
      const status = (err as any)?.response?.status;
      if (status === 401) {
        console.warn(
          "[Auth] Backend returned 401 on /auth/me. " +
          "Firebase Admin SDK may not be configured in backend/.env. " +
          "User stays authenticated via Firebase."
        );
      } else {
        console.warn("[Auth] Backend /auth/me failed:", err);
      }
      // user remains null — pages that need backendUser handle this gracefully
    }
  },
}));

// ─── Firebase auth listener ────────────────────────────────────────────────────
let _listenerStarted = false;

export function startFirebaseAuthListener() {
  if (_listenerStarted) return;
  _listenerStarted = true;

  onAuthStateChanged(firebaseAuth, async (fbUser) => {
    if (fbUser) {
      // Proactively refresh token in session storage
      const token = await fbUser.getIdToken();
      sessionStorage.setItem("firebase_id_token", token);
    } else {
      sessionStorage.removeItem("firebase_id_token");
    }
    useAuthStore.getState()._onFirebaseUser(fbUser);
  });
}

// ─── Error messages ───────────────────────────────────────────────────────────
function _firebaseErrorMessage(err: unknown): string {
  const code = (err as any)?.code || "";
  const map: Record<string, string> = {
    "auth/email-already-in-use":   "This email is already registered.",
    "auth/invalid-email":          "Invalid email address.",
    "auth/weak-password":          "Password must be at least 6 characters.",
    "auth/user-not-found":         "No account found with this email.",
    "auth/wrong-password":         "Incorrect password.",
    "auth/invalid-credential":     "Invalid email or password.",
    "auth/too-many-requests":      "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/operation-not-allowed":  "Email/password sign-in is not enabled in Firebase Console.",
  };
  return map[code] || (err instanceof Error ? err.message : "Authentication failed");
}

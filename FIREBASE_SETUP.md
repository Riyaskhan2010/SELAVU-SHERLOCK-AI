# Firebase Setup — Selavu Sherlock AI

Follow these steps to enable Firebase Authentication.

## Step 1 — Create a Firebase Project

1. Go to https://console.firebase.google.com
2. Click **Add project** → name it `selavu-sherlock-ai` (or any name)
3. Disable Google Analytics if not needed → **Create project**

## Step 2 — Enable Email/Password Auth

1. In your project → **Authentication** → **Sign-in method**
2. Enable **Email/Password**
3. Click **Save**

## Step 3 — Get the Frontend Web Config

1. Project Settings (gear icon) → **Your apps** → click **Web** (`</>`)
2. Register app name → copy the `firebaseConfig` object
3. Open `frontend/.env` and fill in:

```env
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

## Step 4 — Get the Backend Service Account

1. Project Settings → **Service accounts** tab
2. Click **Generate new private key** → downloads a JSON file
3. Save it somewhere safe, e.g. `backend/serviceAccountKey.json`
4. Open `backend/.env` and set:

```env
FIREBASE_SERVICE_ACCOUNT_PATH=serviceAccountKey.json
```

OR paste the entire JSON as a single line:
```env
FIREBASE_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"..."}
```

## Step 5 — Restart

```bash
# Backend
cd backend
python -m uvicorn app.main:app --reload

# Frontend
cd frontend
npm run dev
```

## Step 6 — Verify

- Open http://localhost:5173 → should show Selavu Sherlock AI login
- Register a new account
- Check http://localhost:8000/api/auth/status → `firebase_configured: true`
- Protected API calls should succeed

## Notes

- The backend `firebase_uid` column is added to `users` table automatically on first startup.
- Existing users (if any) will be linked to Firebase on first login by matching email.
- Demo Data `/demo-data` is available to any authenticated user — no special credentials needed.

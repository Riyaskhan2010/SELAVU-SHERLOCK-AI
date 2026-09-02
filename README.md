# Selavu Sherlock AI — Cloud Cost Optimization Platform

AI-powered cloud cost intelligence platform. Upload billing data, detect anomalies, find optimization opportunities, and ask the AI assistant questions about your spend.

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 · TypeScript · Vite · Tailwind CSS · Framer Motion · Recharts |
| Backend | Python 3.12 · FastAPI · SQLAlchemy · Pandas · scikit-learn |
| Auth | Firebase Authentication (email/password) |
| Database | SQLite (dev) · PostgreSQL (production) |
| AI/LLM | Groq · OpenAI · Anthropic · Ollama (configurable) |
| Deploy | Vercel (frontend) · Render (backend) |

## Quick Start (Local)

### Prerequisites
- Node.js 20+
- Python 3.12+
- A Firebase project with Email/Password auth enabled

### 1. Firebase setup
Follow `FIREBASE_SETUP.md` to:
- Create a Firebase project
- Enable Email/Password sign-in
- Get your Web App config → paste into `frontend/.env`
- Download a service account key → set `FIREBASE_SERVICE_ACCOUNT_PATH` in `backend/.env`

### 2. Backend

```bash
cd backend
cp .env.example .env          # fill in your values
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

Backend runs at http://localhost:8000

### 3. Frontend

```bash
cd frontend
cp .env.example .env          # fill in Firebase Web App config
npm install
npm run dev
```

Frontend runs at http://localhost:5173

## Features

- **Firebase Authentication** — email/password signup/login, persistent sessions
- **CSV/JSON Upload** — upload any billing export; auto-normalization with FOCUS-compatible column aliases
- **Cost Analysis** — daily trend, service breakdown, team breakdown
- **Anomaly Detection** — deterministic rules + IsolationForest + Z-score
- **Optimization Engine** — underutilization, cost spikes, idle resources, rightsizing
- **Evidence Explorer** — every finding is backed by evidence, calculations, and assumptions
- **AI Assistant** — ask questions about your dataset; persistent chat history per user
- **Demo Data** — shared read-only demo dataset available to all users

## Environment Variables

See `backend/.env.example` and `frontend/.env.example` for all required variables.

**Never commit `.env` files.**

## Deployment

- **Frontend → Vercel**: `frontend/vercel.json` is pre-configured
- **Backend → Render**: `backend/render.yaml` is pre-configured
- Use PostgreSQL (`DATABASE_URL`) in production

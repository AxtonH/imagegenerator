# Prezlab Image Generation MVP

Internal MVP for Odoo-verified creatives to generate Gemini images, save/favorite/download outputs, and track usage in Supabase.

## Stack

- Frontend: Next.js, React, TypeScript
- Backend: Python FastAPI
- Database/storage/tracking: Supabase
- Image generation: Gemini API
- Login: Odoo verification

## Setup

1. Create the Supabase tables and storage bucket:

```sql
-- Run in Supabase SQL editor
-- File: supabase/schema.sql
```

2. Configure backend environment:

```powershell
Copy-Item backend\.env.example backend\.env
```

Fill in Supabase service role key, Gemini API key, Odoo URL/database, and JWT secret.

3. Configure frontend environment:

```powershell
Copy-Item frontend\.env.example frontend\.env.local
```

4. Run the backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

5. Run the frontend:

```powershell
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Backend Endpoints

- `POST /auth/login`
- `GET /auth/me`
- `POST /generate-image`
- `POST /refine-image`
- `POST /image-action`
- `GET /history`
- `GET /admin/usage`

## Security Notes

- Gemini calls happen only in FastAPI.
- Supabase service role key is only used by FastAPI.
- Odoo passwords are used only for verification and are never stored.
- Important actions are written to `usage_events`.
- Generated image files are stored in the `generated-images` Supabase Storage bucket.

## Railway Deployment

This repo can deploy as **one Railway service** from the repository root. The service starts a private FastAPI process on `127.0.0.1:8000` and exposes the Next.js app on Railway's `$PORT`. Frontend API calls use same-origin routes and are proxied to FastAPI by `frontend/next.config.ts`.

Set these environment variables in the single Railway service:

```text
JWT_SECRET=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_STORAGE_BUCKET=generated-images
GEMINI_API_KEY=
GEMINI_MODEL_FAST=gemini-2.5-flash-image
GEMINI_MODEL_PREMIUM=gemini-3-pro-image
GEMINI_MODEL_REALISTIC=gemini-3-pro-image
GEMINI_MODEL_ILLUSTRATION=gemini-2.5-flash-image
ODOO_URL=https://prezlab.odoo.com
ODOO_DB=odoo-ps-psae-prezlab-main-10779811
DEFAULT_MONTHLY_GENERATION_LIMIT=100
```

Optional:

```text
INTERNAL_API_URL=http://127.0.0.1:8000
```

Do not set `NEXT_PUBLIC_API_URL` for the single-service deployment. Leaving it unset makes the frontend call same-origin API routes like `/auth/login`.

Railway will use root `nixpacks.toml` and run:

```text
sh start.sh
```

Health check:

```text
https://your-railway-url/health
```

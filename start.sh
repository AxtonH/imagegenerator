#!/usr/bin/env sh
set -e

export INTERNAL_API_URL="${INTERNAL_API_URL:-http://127.0.0.1:8000}"

cd backend
uvicorn app.main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

cd ../frontend
npm run start

kill "$BACKEND_PID"

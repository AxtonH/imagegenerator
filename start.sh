#!/usr/bin/env sh
set -e

export INTERNAL_API_URL="${INTERNAL_API_URL:-http://127.0.0.1:8000}"
PYTHON_BIN="${PYTHON_BIN:-python}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  PYTHON_BIN="python3"
fi

if ! "$PYTHON_BIN" -c "import uvicorn" >/dev/null 2>&1; then
  "$PYTHON_BIN" -m pip install -r backend/requirements.txt
fi

cd backend
"$PYTHON_BIN" -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

cd ../frontend
npm run start

kill "$BACKEND_PID"

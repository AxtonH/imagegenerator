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

echo "Waiting for FastAPI backend on ${INTERNAL_API_URL}/health"
for attempt in $(seq 1 30); do
  if "$PYTHON_BIN" -c "import urllib.request; urllib.request.urlopen('${INTERNAL_API_URL}/health', timeout=2).read()" >/dev/null 2>&1; then
    echo "FastAPI backend is ready"
    break
  fi

  if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    echo "FastAPI backend exited before it became ready"
    wait "$BACKEND_PID"
    exit 1
  fi

  if [ "$attempt" -eq 30 ]; then
    echo "FastAPI backend did not become ready after 30 seconds"
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    exit 1
  fi

  sleep 1
done

cd ../frontend
npm run start

kill "$BACKEND_PID"

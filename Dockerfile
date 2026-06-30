FROM node:22-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHON_BIN=/app/.venv/bin/python \
    INTERNAL_API_URL=http://127.0.0.1:8000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      python3 \
      python3-pip \
      python3-venv \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt backend/requirements.txt
RUN python3 -m venv /app/.venv \
    && /app/.venv/bin/pip install --no-cache-dir --upgrade pip setuptools wheel \
    && /app/.venv/bin/pip install --no-cache-dir -r backend/requirements.txt

COPY frontend/package.json frontend/package-lock.json frontend/
RUN npm --prefix frontend ci --include=dev

COPY . .
RUN npm --prefix frontend run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "railway-start.js"]

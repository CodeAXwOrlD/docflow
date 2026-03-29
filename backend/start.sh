#!/bin/bash
set -e

echo "Starting Celery worker in background..."
celery -A app.workers.celery_app worker \
  --loglevel=info \
  --pool=gevent \
  --concurrency=2 \
  --without-heartbeat \
  --without-gossip \
  --without-mingle \
  --max-tasks-per-child=10 &

echo "Starting FastAPI server..."
uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}

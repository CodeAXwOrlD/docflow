#!/bin/bash

# Start Celery worker in background
celery -A app.workers.celery_app worker --loglevel=info --pool=solo &

# Start FastAPI
uvicorn app.main:app --host 0.0.0.0 --port $PORT

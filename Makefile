.PHONY: up up-d down down-v logs logs-worker backend-shell worker-shell db-shell redis-cli install-backend install-frontend dev-backend dev-worker dev-frontend migrate test test-cov lint-frontend build-frontend test-all clean-uploads flower

# ─── Docker ───────────────────────────────────────────────────────────────────
up:
	docker-compose up --build

up-d:
	docker-compose up --build -d

down:
	docker-compose down

down-v:
	docker-compose down -v

logs:
	docker-compose logs -f

logs-worker:
	docker-compose logs -f celery_worker

# ─── Shells ───────────────────────────────────────────────────────────────────
backend-shell:
	docker-compose exec backend bash

worker-shell:
	docker-compose exec celery_worker bash

db-shell:
	docker-compose exec postgres psql -U docflow -d docflow_db

redis-cli:
	docker-compose exec redis redis-cli

# ─── Local dev ────────────────────────────────────────────────────────────────
install-backend:
	cd backend && pip install -r requirements.txt

install-frontend:
	cd frontend && npm install

dev-backend:
	cd backend && uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

dev-worker:
	cd backend && celery -A app.workers.celery_app worker --loglevel=info

dev-frontend:
	cd frontend && npm run dev

migrate:
	cd backend && alembic upgrade head

# ─── Tests & Lint ─────────────────────────────────────────────────────────────
test:
	cd backend && pytest tests/ -v

test-cov:
	cd backend && pytest tests/ -v --cov=app --cov-report=term-missing

lint-frontend:
	cd frontend && npm run lint

build-frontend:
	cd frontend && npm run build

test-all: test lint-frontend build-frontend

# ─── Misc ─────────────────────────────────────────────────────────────────────
clean-uploads:
	rm -rf backend/uploads/*

flower:
	cd backend && celery -A app.workers.celery_app flower --port=5555

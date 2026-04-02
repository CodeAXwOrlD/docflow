# 📄 DocFlow

> **An Enterprise-Grade Async Document Processing Workflow System**
>
> Upload, process, track, review, and export data from large volumes of documents — all asynchronously, without ever locking the UI.

![License](https://img.shields.io/badge/License-MIT-blue.svg)
![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)
![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=nextdotjs&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688?logo=fastapi&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?logo=postgresql&logoColor=white)

---

## ✨ Features

| | Feature | Description |
|---|---|---|
| 🚀 | **Async Processing** | Document processing is completely decoupled — uploads are queued instantly via Redis/Celery, keeping HTTP requests lightning-fast. |
| ⚡ | **Real-Time Tracking** | Live pipeline view powered by **Server-Sent Events (SSE)** + **Redis Pub/Sub**. See exactly what stage your document is at. |
| 🛠 | **Interactive Review** | Reviewers can inspect, tweak, and edit the extracted JSON data in an inline editor before finalizing documents. |
| 📂 | **Multi-Format Support** | Process **PDF**, **DOCX**, **XLSX**, **TXT**, **CSV**, **Markdown**, and **JSON** files out of the box. |
| 🔁 | **Fault Tolerance** | Failed or stuck jobs can be retried with a single click directly from the dashboard. |
| 📊 | **Celery Flower** | Built-in task monitoring dashboard at port `5555` for full visibility into worker health and queue depth. |

---

## 🏗 Architecture

```mermaid
graph TD
    classDef frontend fill:#3b82f6,stroke:#1d4ed8,stroke-width:2px,color:#fff
    classDef backend fill:#10b981,stroke:#047857,stroke-width:2px,color:#fff
    classDef worker fill:#f59e0b,stroke:#b45309,stroke-width:2px,color:#fff
    classDef db fill:#6366f1,stroke:#4338ca,stroke-width:2px,color:#fff

    User((User)) -- Uploads PDF/Doc --> UI(Next.js Frontend):::frontend
    UI -- Sends File --> API(FastAPI Backend):::backend
    UI -- Subscribes to SSE --> API
    
    API -- Saves Metadata --> DB[(PostgreSQL)]:::db
    API -- Dispatches Async Task --> Queue[(Redis Broker)]:::db
    
    Worker(Celery Worker):::worker -- Polls for new uploads --> Queue
    Worker -- Extracts Text & Data --> Worker
    Worker -- Publishes Real-time Progress --> Queue
    Worker -- Saves final JSON Data --> DB
    
    Queue -- Broadcasts Progress --> API
```

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14, React 18, TypeScript, Tailwind CSS |
| **Backend API** | Python, FastAPI, SQLAlchemy (Async), Pydantic v2 |
| **Message Broker** | Redis 7 (Pub/Sub & Task Queues) |
| **Worker Engine** | Celery with Flower monitoring |
| **Database** | PostgreSQL 15 |
| **File Parsing** | PyPDF2, python-docx, openpyxl |

---

## 🚀 Getting Started

### Option A — Docker Compose (Recommended)

Spin up the entire stack with a single command:

```bash
git clone https://github.com/indmadmax/docflow.git
cd docflow
```

```bash
# Build and start all services (Postgres, Redis, Backend, Worker, Flower, Frontend)
make up

# Or run in detached mode
make up-d
```

| Service | URL |
|---|---|
| Frontend | [http://localhost:3000](http://localhost:3000) |
| Backend API | [http://localhost:8000](http://localhost:8000) |
| Swagger Docs | [http://localhost:8000/docs](http://localhost:8000/docs) |
| Celery Flower | [http://localhost:5555](http://localhost:5555) |

```bash
# Tail logs
make logs

# Stop everything
make down

# Stop and remove volumes (full reset)
make down-v
```

---

### Option B — Local Development

#### Prerequisites

- **Python 3.11+**
- **Node.js 20+**
- **PostgreSQL 15** and **Redis 7** running locally (or via Podman/Docker)

#### 1. Clone & Install

```bash
git clone https://github.com/indmadmax/docflow.git
cd docflow

make install-backend    # pip install -r requirements.txt
make install-frontend   # npm install
```

#### 2. Environment Variables

Create a `.env` file inside `backend/` with the following:

```env
DATABASE_URL=postgresql+asyncpg://docflow:docflow_secret@localhost:5432/docflow_db
SYNC_DATABASE_URL=postgresql://docflow:docflow_secret@localhost:5432/docflow_db
REDIS_URL=redis://localhost:6379/0
UPLOAD_DIR=./uploads
```

Create a `.env.local` file inside `frontend/`:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
```

#### 3. Run (3 terminal tabs)

**Terminal 1 — Backend API**
```bash
make dev-backend
# → http://localhost:8000
```

**Terminal 2 — Celery Worker**
```bash
make dev-worker
# Connects to Redis, waits for tasks
```

**Terminal 3 — Frontend**
```bash
make dev-frontend
# → http://localhost:3000
```

> **🎉 Done!** Navigate to [http://localhost:3000](http://localhost:3000) to upload your first document.

---

## 📋 Makefile Reference

| Command | Description |
|---|---|
| `make up` | Build & start all Docker services |
| `make up-d` | Same, but detached |
| `make down` | Stop all services |
| `make down-v` | Stop & remove volumes |
| `make logs` | Tail all service logs |
| `make logs-worker` | Tail Celery worker logs only |
| `make backend-shell` | Shell into the backend container |
| `make db-shell` | Open a `psql` session |
| `make redis-cli` | Open a `redis-cli` session |
| `make install-backend` | Install Python dependencies |
| `make install-frontend` | Install Node dependencies |
| `make dev-backend` | Run backend locally |
| `make dev-worker` | Run Celery worker locally |
| `make dev-frontend` | Run frontend locally |
| `make flower` | Start Celery Flower locally |
| `make test` | Run backend tests |
| `make test-cov` | Run tests with coverage |
| `make clean-uploads` | Delete all uploaded files |

---

## 📖 API Documentation

The interactive **Swagger UI** is auto-generated while the backend is running:

👉 **[http://localhost:8000/docs](http://localhost:8000/docs)**

---

## 🛡️ License

This project is licensed under the **MIT License**. See the [`LICENSE`](LICENSE) file for details.

---

> Built with ❤️ by **Akhil Agarwal**

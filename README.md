# DocFlow — AI Document Intelligence + BYOK Platform

DocFlow is a full-stack document intelligence platform that transforms uploaded PDFs, DOCX files, spreadsheets, and text documents into verified, structured JSON/CSV data using **Google Gemini** and **Groq** APIs with **Bring Your Own Key (BYOK)**.

---

## Processing Workflow

```
Upload Document -> Validate File -> Extract Text -> Queue Processing (Celery)
  -> Resolve User BYOK Connection & Decrypt Key in Worker -> AI Analysis (Gemini / Groq)
  -> Structured Invoice + Indian GST Extraction (Pydantic)
  -> Deterministic Validation & Duplicate Detection -> Confidence Scoring
  -> Human Review & Verification -> Single & Batch Export (JSON / CSV)
```

---

## Core Capabilities

- **BYOK Multi-Provider AI**: Supports **Google Gemini** and **Groq** via an isolated provider abstraction (`BaseAIProvider`, `GeminiProvider`, `GroqProvider`, `ProviderFactory`). Switch providers or models per account or per upload without modifying the document-processing pipeline.
- **Per-User Authentication & Isolation**: JWT bearer authentication (`/api/v1/auth/register`, `/login`, `/me`) with bcrypt password hashing and user-scoped isolation across documents, AI provider connections, and usage telemetry. Short-lived `doc_id`-scoped stream tokens authorize Server-Sent Events (`/api/v1/documents/{id}/stream`).
- **Encrypted Credential Management**:
  - AI keys are submitted only through the Settings UI/API, tested strictly on the backend, and encrypted at rest using Fernet (`MultiFernet` for zero-downtime key rotation).
  - Plaintext keys are never returned in API responses, never logged, never stored in `localStorage`/`sessionStorage`, and never passed in Celery task arguments.
- **Invoice & Indian GST Intelligence**:
  - Extracts invoice number, dates, vendor/customer names and addresses, currency, subtotal, tax, total, payment terms, PO reference, line items, and Indian GST fields (`gstin`, `taxable_value`, `cgst`, `sgst`, `igst`, `hsn_sac_codes`).
  - Every field carries an explicit `value`, `confidence`, `evidence` quote, `validation_status`, and `verified_by_human` flag so missing or uncertain values are never silently fabricated.
- **Deterministic Validation Engine**:
  - Runs code-only `Decimal` checks for line-item arithmetic, subtotal and total consistency, GST/tax consistency, date ordering, currency code validity, mandatory fields, Indian GSTIN regex format, and duplicate invoice detection per user.
- **Human Review & Batch Export**:
  - Interactive Schema Inspector displaying per-field confidence badges, supporting evidence quotes, deterministic validation check cards, inline editing, per-field verification toggles, document reprocessing, and single or multi-document batch JSON/CSV export (`GET /api/v1/documents/export/batch`).
- **Interactive Demo Mode**:
  - Works out of the box with zero backend/database setup (`NEXT_PUBLIC_DEMO_MODE=true` default when `NEXT_PUBLIC_API_URL` is unset or toggled in the UI), simulating the full AI extraction, validation, BYOK settings, and review workflow.

---

## Architecture Overview

```
docflow/
├── backend/
│   ├── alembic/                  # Migrations (001_initial, 002_auth_byok)
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth_routes.py    # /api/v1/auth/{register,login,me}
│   │   │   ├── ai_routes.py      # /api/v1/ai/{connections,models,usage}
│   │   │   └── routes.py         # Upload, stream-token, SSE stream, review, reprocess, export, batch
│   │   ├── core/
│   │   │   ├── config.py         # Settings (DB, Redis, JWT, ENCRYPTION_MASTER_KEY)
│   │   │   ├── database.py       # Async SQLAlchemy engine & session
│   │   │   ├── redis_client.py   # Redis Pub/Sub + state storage
│   │   │   └── security.py       # Bcrypt, JWT, scoped stream tokens, Fernet/MultiFernet encryption, key masking
│   │   ├── models/               # User, Document, AIProviderConnection, AIUsageLog
│   │   ├── schemas/              # Auth, AI BYOK, Document, Invoice + Validation Pydantic schemas
│   │   ├── services/
│   │   │   ├── ai_providers/     # BaseAIProvider, GeminiProvider, GroqProvider, ProviderFactory
│   │   │   ├── ai_connection_service.py
│   │   │   ├── document_service.py
│   │   │   ├── extraction.py
│   │   │   ├── invoice_extraction_service.py
│   │   │   └── invoice_validator.py
│   │   └── workers/
│   │       └── celery_app.py     # Async Celery pipeline with in-worker key decryption, retries & usage logging
│   └── tests/                    # Automated backend test suite
├── frontend/
│   └── src/
│       ├── components/           # Layout, SchemaInspector (AI review + GST + checks), StageTracker, DropZone, etc.
│       ├── lib/                  # Axios client + Bearer auth interceptors, session storage helper (JWT only)
│       ├── pages/                # /, /login, /upload, /documents, /documents/[id], /settings
│       ├── services/             # Live & Demo repository implementations
│       └── types/                # TypeScript domain models
└── docker-compose.yml
```

---

## API Key Security & Encryption Key Management

DocFlow enforces strict BYOK isolation:

1. **No AI keys in `.env`**: `GEMINI_API_KEY` and `GROQ_API_KEY` are intentionally excluded from environment variables and `docker-compose.yml`. Each user enters and manages their own keys in **AI Settings** (`/settings`).
2. **Backend-only Encryption (`ENCRYPTION_MASTER_KEY`)**:
   - Keys are encrypted using `cryptography.fernet.MultiFernet` before insertion into `ai_provider_connections.encrypted_api_key`.
   - In non-development/production environments (`ENVIRONMENT` != `development` / `test`), startup or encryption operations **fail closed** if `ENCRYPTION_MASTER_KEY` is missing or malformed. In local development only, if `ENCRYPTION_MASTER_KEY` is omitted, DocFlow derives a deterministic dev-only fallback from `SECRET_KEY` (never use in production).
   - Database records store only `key_last_four`, rendered exclusively as masked strings (e.g., `••••••••1234`).
3. **Celery Hygiene**:
   - Enqueued Celery jobs receive only `[document_id, connection_id]`.
   - The trusted worker resolves `AIProviderConnection` inside PostgreSQL, decrypts the API key in memory during the task, executes the provider call, and discards the plaintext key.
4. **TLS / HTTPS**: Always terminate TLS/HTTPS in front of FastAPI and Next.js in production so BYOK submissions and JWT headers are encrypted in transit.

### Generating, Backing Up, and Rotating `ENCRYPTION_MASTER_KEY`

- **Generate a production Fernet key**:
  ```bash
  python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  ```
- **Backup**: Store `ENCRYPTION_MASTER_KEY` in a dedicated secret manager (e.g., AWS Secrets Manager, GCP Secret Manager, Vault) separate from PostgreSQL backups. Losing the master key renders stored encrypted BYOK credentials unrecoverable and requires users to re-enter their keys.
- **Zero-Downtime Key Rotation**:
  1. Generate a new Fernet key (`NEW_KEY`).
  2. Set `ENCRYPTION_MASTER_KEY="<NEW_KEY>,<OLD_KEY>"` (comma-separated, newest key first) and restart backend + Celery workers. `MultiFernet` encrypts new/updated keys with `NEW_KEY` and decrypts existing records with `OLD_KEY`.
  3. Re-encrypt existing rows in a maintenance script using `EncryptionService.rotate(conn.encrypted_api_key)` and commit them.
  4. Once all rows are rotated, remove `<OLD_KEY>` from `ENCRYPTION_MASTER_KEY` and restart services.

---

## BYOK Setup Guide (Gemini & Groq)

1. Register or sign in at `/login` (when running in Live Mode).
2. Navigate to **AI Settings** (`/settings`).
3. Choose **Google Gemini** or **Groq**, enter an optional connection label, paste your API key, and choose a supported model:
   - **Gemini**: e.g., `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-2.5-pro`, `gemini-2.0-flash`
   - **Groq**: e.g., `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `meta-llama/llama-4-scout-17b-16e-instruct`, `qwen/qwen3-32b`
4. Click **Test Connection** to validate the key from the backend before saving, or **Save Connection**.
5. Set your preferred **Default** connection, or select a specific active connection when uploading or reprocessing a document.

### Cost & Billing Responsibilities

- **AI Provider Charges (User Responsibility)**: Because DocFlow uses BYOK, all token inference charges from Google Gemini or Groq are billed directly to your own provider account/API key.
- **DocFlow Infrastructure Costs (Operator/Host Responsibility)**: Running DocFlow itself still incurs hosting, compute (FastAPI + Celery workers), PostgreSQL storage, Redis memory, and uploaded document disk/object storage costs.

---

## Environment Configuration

Copy `backend/.env.example` to `backend/.env` for local runs or export variables for `docker-compose.yml`:

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| `DATABASE_URL` | Yes | Async SQLAlchemy URL (`postgresql+asyncpg://...`) |
| `SYNC_DATABASE_URL` | Yes | Sync SQLAlchemy URL for Celery workers & Alembic (`postgresql://...`) |
| `REDIS_URL` | Yes | Redis broker, result backend, and SSE Pub/Sub URL |
| `SECRET_KEY` | Yes (prod) | JWT signing key for user access tokens and SSE stream tokens |
| `ENCRYPTION_MASTER_KEY` | Yes (prod) | Fernet / comma-separated MultiFernet master key for BYOK encryption |
| `ENVIRONMENT` | Recommended | `development`, `test`, or `production` (strict key enforcement in prod) |
| `CORS_ORIGINS` | Recommended | Comma-separated allowed frontend origins |
| `AI_REQUEST_TIMEOUT_SECONDS` | Optional | HTTP timeout for Gemini/Groq API requests (default `60`) |

Frontend (`frontend/.env.local`):

| Variable | Required | Purpose |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | Optional | Backend base URL (e.g., `http://localhost:8000`) |
| `NEXT_PUBLIC_DEMO_MODE` | Optional | Set `false` for Live Mode against FastAPI, or `true` for Demo Mode |

---

## Local Development, Migrations & Running Tests

### 1. Run Database Migrations

```bash
cd backend
alembic upgrade head
```

Or generate offline SQL to inspect schema changes:

```bash
cd backend
alembic upgrade head --sql
```

### 2. Run Backend + Worker + Frontend

With Docker Compose:

```bash
export SECRET_KEY="replace-with-strong-random-secret"
export ENCRYPTION_MASTER_KEY="$(python3 -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())')"
docker compose up --build
```

Or run services manually during development:

```bash
# Terminal 1: FastAPI backend
cd backend && ./venv/bin/uvicorn app.main:app --reload --port 8000

# Terminal 2: Celery worker
cd backend && ./venv/bin/celery -A app.workers.celery_app worker --loglevel=info

# Terminal 3: Next.js frontend
cd frontend && npm run dev
```

### 3. Verification & Tests

```bash
# Backend unit & integration tests (35 tests)
cd backend && ./venv/bin/pytest tests/ -v

# Verify Alembic migration SQL generation
cd backend && ./venv/bin/alembic upgrade head --sql > /dev/null

# Frontend ESLint, TypeScript check, and production build
cd frontend && npm run lint && npm run build
```

---

## Known Limitations & Roadmap Readiness

- **Text-Layer Extraction Only**: Current document extraction reads embedded text from PDF (`PyPDF2`), `.docx`, `.csv`, `.xlsx`, and `.txt` files. Scanned image-only PDFs require OCR preprocessing prior to text extraction.
- **External AI Provider Network Access**: Live Gemini and Groq validation/extraction requires outbound HTTPS access from the backend/Celery environment to `generativelanguage.googleapis.com` and `api.groq.com`.
- **Architecture Ready for Future Phases**: The data model (`document_type`, `batch_id`, `ai_connection_id`) and validation engine are structured cleanly for future Purchase Order matching, invoice-to-PO reconciliation, vendor catalogs, approval workflows, and accounting exports without refactoring core extraction.

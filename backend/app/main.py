import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.database import engine, Base
from app.api.routes import router
from app.models import document  # noqa: ensure model is imported for Base metadata


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create DB tables on startup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    os.makedirs(os.getenv("UPLOAD_DIR", "./uploads"), exist_ok=True)
    yield
    await engine.dispose()


app = FastAPI(
    title="DocFlow API",
    description="Async Document Processing Workflow System",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "DocFlow API"}

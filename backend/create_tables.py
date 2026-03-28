import asyncio
from app.core.database import engine, Base
from app.models import document  # noqa

# Also ensure JobStatus has 'processing' in case it's missed in postgres

async def main():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    print("Tables created!")
    await engine.dispose()

asyncio.run(main())

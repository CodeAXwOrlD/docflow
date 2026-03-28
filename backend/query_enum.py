import asyncio
from app.core.database import engine
async def main():
    async with engine.connect() as conn:
        res = await conn.execute(engine.dialect.statement_compiler.statement_cls("SELECT enum_range(NULL::jobstatus);"))
        print(res.all())
asyncio.run(main())

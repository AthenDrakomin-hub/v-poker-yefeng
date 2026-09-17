"""
结算微服务 (Commission Service) 入口主程序
运行端口：8000
"""
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base, AsyncSessionLocal
from app.models import Agent
from app.routers import settle, agent


@asynccontextmanager
async def lifespan(app: FastAPI):
    """启动时自动建表并 seed 三级测试代理"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
        from sqlalchemy import select
        res = await session.execute(select(Agent))
        if not res.scalars().first():
            agents = [
                Agent(agent_id="agt_top_01", parent_id=None, level=2, r_ratio=0.2000, commission_balance=0, status="active"),
                Agent(agent_id="agt_sub_02", parent_id="agt_top_01", level=1, r_ratio=0.3000, commission_balance=0, status="active"),
                Agent(agent_id="agt_room_03", parent_id="agt_sub_02", level=0, r_ratio=0.5000, commission_balance=0, status="active")
            ]
            session.add_all(agents)
            await session.commit()
    yield
    await engine.dispose()


app = FastAPI(
    title="Commission Service (代理返佣结算微服务)",
    description="多级代理分销、层级返佣计算与对账",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

app.include_router(settle.router)
app.include_router(agent.router)


@app.get("/health", tags=["Health"])
async def health():
    return {"code": 0, "message": "commission-service is running", "data": {"status": "ok"}}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

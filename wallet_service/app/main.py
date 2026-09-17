"""
钱包微服务 (Wallet Service) 入口主程序
运行端口：8001
"""
import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import engine, Base, AsyncSessionLocal
from app.models import FeePool, Agent, Wallet
from app.routers import wallet, audit


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    服务启动与关闭生命周期管理：自动建表与初始化单例数据
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # 初始化种子数据 (fee_pool 与 基础代理树)
    async with AsyncSessionLocal() as session:
        # 1. 初始化手续费池
        fee_pool_res = await session.execute(
            select(FeePool).where(FeePool.pool_id == settings.PLATFORM_FEE_POOL_ID)
        )
        if not fee_pool_res.scalar_one_or_none():
            pool = FeePool(
                pool_id=settings.PLATFORM_FEE_POOL_ID,
                balance=0,
                updated_at=int(time.time() * 1000)
            )
            session.add(pool)

        # 2. 初始化三级测试代理 (若不存在)
        agent_res = await session.execute(select(Agent))
        if not agent_res.scalars().first():
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
    title="Wallet Microservice (封闭式虚拟经济钱包微服务)",
    description="支持筹码铸造、万分之一自由转账扣费、德扑结算分润与能量守恒对账",
    version="1.0.0",
    lifespan=lifespan
)

# 允许跨域请求 (供 BFF / 前端测试)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    统一全局异常捕获，确保输出格式永远严格遵循 { code, message, data }
    """
    status_code = getattr(exc, "status_code", 500)
    detail = getattr(exc, "detail", str(exc))
    return JSONResponse(
        status_code=status_code if status_code < 500 else 200,
        content={
            "code": status_code if status_code != 200 else 5000,
            "message": detail,
            "data": None
        }
    )


# 挂载路由
app.include_router(wallet.router)
app.include_router(audit.router)


@app.get("/health", tags=["Health"])
async def health_check():
    return {"code": 0, "message": "wallet-service is running", "data": {"status": "ok"}}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=True)

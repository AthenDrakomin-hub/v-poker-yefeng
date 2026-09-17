"""
钱包微服务 (Wallet Service) 入口主程序
运行端口：8001
"""
import time
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.config import settings
from app.database import engine, Base, AsyncSessionLocal
from app.models import FeePool, Agent, Wallet
from app.routers import wallet, audit


async def verify_internal_key(request: Request):
    """
    内部服务鉴权：管理员铸币等敏感操作必须携带 X-Internal-Auth-Key
    开发环境若未设置 WALLET_INTERNAL_KEY 则放行（本地调试友好）
    """
    expected = os.getenv("WALLET_INTERNAL_KEY", "")
    if not expected:
        return  # 未配置密钥则不校验（开发模式）
    provided = request.headers.get("X-Internal-Auth-Key", "")
    if provided != expected:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Internal-Auth-Key")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """服务启动与关闭：自动建表与初始化种子数据"""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as session:
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
    description="支持筹码铸造、万分之一自由转账扣费、德扑结算分润与能量守恒审计",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """HTTP 异常统一输出 { code, message, data }"""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": exc.status_code,
            "message": exc.detail,
            "data": None
        }
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """统一全局异常捕获，输出 { code, message, data }"""
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


# 挂载路由（mint 路由叠加内部鉴权）
app.include_router(wallet.router)
app.include_router(audit.router)

# 给 mint 路由单独加鉴权依赖
for route in wallet.router.routes:
    if getattr(route, "path", "").endswith("/mint"):
        route.dependencies.append(Depends(verify_internal_key))


@app.get("/health", tags=["Health"])
async def health_check():
    return {"code": 0, "message": "wallet-service is running", "data": {"status": "ok"}}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8001, reload=True)

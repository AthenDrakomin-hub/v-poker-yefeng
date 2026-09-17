"""
结算微服务 (Commission Service) 入口主程序
运行端口：8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import settle, agent

app = FastAPI(
    title="Commission Service (代理返佣结算微服务)",
    description="多级代理分销、层级返佣计算与对账",
    version="1.0.0"
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

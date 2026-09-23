"""
系统配置与环境变量加载模块
"""
import os
from pydantic import BaseModel


class Settings(BaseModel):
    # 服务基础信息
    APP_NAME: str = "Wallet Service (钱包微服务)"
    APP_PORT: int = int(os.getenv("PORT", "8001"))
    ENVIRONMENT: str = os.getenv("ENV", "development")

    # 数据库连接 (SQLite 异步引擎)
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./wallet.db")

    # 手续费池固定ID
    PLATFORM_FEE_POOL_ID: str = "platform_fee"

    # 自由转账手续费比例 (0.01% = 0.0001)
    TRANSFER_FEE_RATE: float = 0.0001

    # 结算微服务地址 (用于联动多级代理返佣分账)
    COMMISSION_SERVICE_URL: str = os.getenv(
        "COMMISSION_SERVICE_URL", "http://commission-service:8000"
    )


settings = Settings()

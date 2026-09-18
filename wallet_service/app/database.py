"""
异步 SQLAlchemy 数据库引擎与会话管理
PostgreSQL: 连接池 50 + 溢出 20（支持 500 并发用户）
SQLite: 单文件模式
"""
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import declarative_base
from app.config import settings

# 根据数据库类型配置连接池
is_sqlite = "sqlite" in settings.DATABASE_URL

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=False,
    future=True,
    # PostgreSQL 连接池配置（支持 500 并发）
    pool_size=50 if not is_sqlite else None,
    max_overflow=20 if not is_sqlite else None,
    pool_pre_ping=True if not is_sqlite else False,
    pool_recycle=1800 if not is_sqlite else None,  # 30分钟回收
    pool_timeout=30 if not is_sqlite else None,
    # SQLite 配置
    connect_args={"check_same_thread": False} if is_sqlite else {}
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False
)

Base = declarative_base()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI 依赖注入：获取数据库会话并在请求完毕后妥善关闭
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

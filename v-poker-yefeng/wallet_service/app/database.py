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

# 注意：SQLAlchemy 不接受显式传入 None 的连接池参数，
# 因此 SQLite 下必须"不传"这些参数，而不是传 None。
_engine_kwargs: dict = {"echo": False, "future": True}
if is_sqlite:
    # SQLite（aiosqlite + NullPool）不支持 pool_size / max_overflow 等
    _engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # PostgreSQL 连接池配置（支持 500 并发）
    _engine_kwargs.update(
        {
            "pool_size": 50,
            "max_overflow": 20,
            "pool_pre_ping": True,
            "pool_recycle": 1800,  # 30分钟回收
            "pool_timeout": 30,
        }
    )

engine = create_async_engine(settings.DATABASE_URL, **_engine_kwargs)

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

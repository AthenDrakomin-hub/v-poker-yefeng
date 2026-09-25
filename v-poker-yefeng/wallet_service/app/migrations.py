"""
轻量数据库迁移系统（替代Alembic，零依赖）
启动时自动执行未应用的迁移，记录schema_version表
"""
from app.database import engine, Base
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)

# 迁移列表：按顺序执行，每项 (version, description, sql)
MIGRATIONS = [
    ("001", "initial_schema", None),  # create_all 自动建表
    ("002", "add_settlement_status_index", "CREATE INDEX IF NOT EXISTS idx_game_records_status ON game_records(settlement_status)"),
    ("003", "add_transaction_type_index", "CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type)"),
]

async def run_migrations():
    async with engine.begin() as conn:
        # 建表（首次）
        await conn.run_sync(Base.metadata.create_all)
        # 建版本表
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS schema_version (
                version TEXT PRIMARY KEY,
                description TEXT,
                applied_at INTEGER NOT NULL
            )
        """))
        # 执行未应用的迁移
        for version, desc, sql in MIGRATIONS:
            row = await conn.execute(
                text("SELECT version FROM schema_version WHERE version=:v"), {"v": version}
            )
            if row.scalar_one_or_none():
                continue
            if sql:
                await conn.execute(text(sql))
            await conn.execute(
                text("INSERT INTO schema_version (version, description, applied_at) VALUES (:v, :d, :t)"),
                {"v": version, "d": desc, "t": 0},
            )
            logger.info(f"[Migration] Applied {version}: {desc}")

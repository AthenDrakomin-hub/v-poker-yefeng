"""
数据库原子级操作封装 (CRUD)
"""
import time
from typing import Optional, List
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Wallet, Transaction, FeePool, Agent, GameRecord, SettlementLog


def now_ms() -> int:
    return int(time.time() * 1000)


async def get_or_create_wallet(
    session: AsyncSession,
    user_id: str,
    user_type: str = "player"
) -> Wallet:
    """
    根据 user_id 查询钱包，若不存在则原子化创建
    """
    stmt = select(Wallet).where(Wallet.user_id == user_id)
    result = await session.execute(stmt)
    wallet = result.scalar_one_or_none()

    if not wallet:
        wallet_id = f"w_{user_type}_{user_id}"
        wallet = Wallet(
            wallet_id=wallet_id,
            user_id=user_id,
            user_type=user_type,
            balance=0,
            frozen_balance=0,
            updated_at=now_ms()
        )
        session.add(wallet)
        await session.flush()

    return wallet


async def get_wallet_by_user_id(session: AsyncSession, user_id: str) -> Optional[Wallet]:
    stmt = select(Wallet).where(Wallet.user_id == user_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_fee_pool(session: AsyncSession) -> FeePool:
    """
    获取平台手续费池单例记录
    """
    stmt = select(FeePool).where(FeePool.pool_id == "platform_fee")
    result = await session.execute(stmt)
    pool = result.scalar_one_or_none()

    if not pool:
        pool = FeePool(
            pool_id="platform_fee",
            balance=0,
            updated_at=now_ms()
        )
        session.add(pool)
        await session.flush()

    return pool


async def get_transaction(session: AsyncSession, tx_id: str) -> Optional[Transaction]:
    """
    幂等查询：根据 transaction_id 获取交易
    """
    stmt = select(Transaction).where(Transaction.transaction_id == tx_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_user_transactions(
    session: AsyncSession,
    wallet_id: str,
    limit: int = 50,
    offset: int = 0
) -> List[Transaction]:
    """
    查询指定钱包的历史关联流水
    """
    stmt = (
        select(Transaction)
        .where(
            or_(
                Transaction.from_wallet_id == wallet_id,
                Transaction.to_wallet_id == wallet_id
            )
        )
        .order_by(Transaction.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    return list(result.scalars().all())


async def get_agent_chain(session: AsyncSession, start_agent_id: Optional[str] = None) -> List[Agent]:
    """
    从指定代理向上追溯完整的代理链条 (例如: 开房代理 -> 二级代 -> 总代)
    若未指定，则默认查出系统中所有已激活的代理按 level 升序排列
    """
    chain: List[Agent] = []
    if not start_agent_id:
        stmt = select(Agent).where(Agent.status == "active").order_by(Agent.level.asc())
        res = await session.execute(stmt)
        return list(res.scalars().all())

    curr_id = start_agent_id
    visited = set()
    while curr_id and curr_id not in visited:
        visited.add(curr_id)
        stmt = select(Agent).where(Agent.agent_id == curr_id, Agent.status == "active")
        res = await session.execute(stmt)
        agent = res.scalar_one_or_none()
        if not agent:
            break
        chain.append(agent)
        curr_id = agent.parent_id

    # 按照 level 从小到大排序 (0=开房代理, 1=二级, 2=总代)
    chain.sort(key=lambda a: a.level)
    return chain


async def calculate_audit_metrics(session: AsyncSession):
    """
    审计对账汇总计算
    """
    # 1. 历史铸币发行总量 (type == 'mint' and status == 'success')
    mint_stmt = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        Transaction.type == "mint",
        Transaction.status == "success"
    )
    total_minted = (await session.execute(mint_stmt)).scalar() or 0

    # 2. 当前所有钱包资产总和 (balance + frozen_balance)
    wallets_stmt = select(
        func.coalesce(func.sum(Wallet.balance + Wallet.frozen_balance), 0),
        func.count(Wallet.wallet_id)
    )
    res_wallets = (await session.execute(wallets_stmt)).one()
    wallets_balance_sum = res_wallets[0] or 0
    wallets_count = res_wallets[1] or 0

    # 3. 手续费池累积余额
    fee_pool = await get_fee_pool(session)
    fee_pool_balance = fee_pool.balance

    # 4. 守恒验证
    total_assets = wallets_balance_sum + fee_pool_balance
    difference = total_assets - total_minted
    is_conserved = (difference == 0)

    return {
        "total_minted": total_minted,
        "wallets_balance_sum": wallets_balance_sum,
        "fee_pool_balance": fee_pool_balance,
        "total_system_assets": total_assets,
        "difference": difference,
        "is_conserved": is_conserved,
        "wallets_count": wallets_count,
        "audit_time": now_ms()
    }

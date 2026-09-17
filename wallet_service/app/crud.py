"""
数据库原子级操作封装 (CRUD)
- 牌桌虚拟钱包：user_id = room_{room_id}, user_type = "room"
- 能量守恒校验：所有钱包余额 + fee_pool == 总铸币量
"""
import time
from typing import Optional, List, Dict
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
    """根据 user_id 查询钱包，若不存在则原子化创建"""
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


async def get_room_wallet(session: AsyncSession, room_id: str) -> Wallet:
    """获取牌桌虚拟钱包，不存在则自动创建 (user_type=room)"""
    room_user_id = f"room_{room_id}"
    return await get_or_create_wallet(session, room_user_id, user_type="room")


async def get_fee_pool(session: AsyncSession) -> FeePool:
    """获取平台手续费池单例记录"""
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
    """幂等查询：根据 transaction_id 获取交易"""
    stmt = select(Transaction).where(Transaction.transaction_id == tx_id)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_user_transactions(
    session: AsyncSession,
    wallet_id: str,
    limit: int = 50,
    offset: int = 0
) -> List[Transaction]:
    """查询指定钱包的历史关联流水"""
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
    """从指定代理向上追溯完整的代理链条"""
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

    chain.sort(key=lambda a: a.level)
    return chain


async def sum_balance_by_user_type(session: AsyncSession) -> Dict[str, int]:
    """按 user_type 分组汇总钱包余额"""
    stmt = select(
        Wallet.user_type,
        func.coalesce(func.sum(Wallet.balance + Wallet.frozen_balance), 0)
    ).group_by(Wallet.user_type)
    res = await session.execute(stmt)
    return {row[0]: (row[1] or 0) for row in res.all()}


async def calculate_audit_metrics(session: AsyncSession):
    """
    审计对账汇总计算 (增强版，含分项明细)
    守恒公式：sum_all_wallets + sum_fee_pool == total_minted
    """
    # 1. 历史铸币发行总量
    mint_stmt = select(func.coalesce(func.sum(Transaction.amount), 0)).where(
        Transaction.type == "mint",
        Transaction.status == "success"
    )
    total_minted = (await session.execute(mint_stmt)).scalar() or 0

    # 2. 按用户类型分组汇总
    type_sums = await sum_balance_by_user_type(session)
    player_sum = type_sums.get("player", 0)
    room_sum = type_sums.get("room", 0)
    agent_sum = type_sums.get("agent", 0)
    admin_sum = type_sums.get("admin", 0)
    support_sum = type_sums.get("support", 0)

    sum_all_wallets = player_sum + room_sum + agent_sum + admin_sum + support_sum

    # 3. 钱包总数
    count_stmt = select(func.count(Wallet.wallet_id))
    wallets_count = (await session.execute(count_stmt)).scalar() or 0

    # 4. 手续费池
    fee_pool = await get_fee_pool(session)
    fee_pool_balance = fee_pool.balance

    # 5. 守恒校验
    total_system_assets = sum_all_wallets + fee_pool_balance
    difference = total_system_assets - total_minted
    check_passed = (difference == 0)

    return {
        "total_minted": total_minted,
        "sum_all_wallets": sum_all_wallets,
        "sum_fee_pool": fee_pool_balance,
        "total_system_assets": total_system_assets,
        "difference": difference,
        "check_passed": check_passed,
        "wallets_count": wallets_count,
        "breakdown": {
            "player_wallets": player_sum,
            "room_wallets": room_sum,
            "agent_wallets": agent_sum,
            "admin_wallets": admin_sum,
            "support_wallets": support_sum,
            "fee_pool": fee_pool_balance
        },
        "audit_time": now_ms()
    }


async def verify_energy_conservation(session: AsyncSession) -> int:
    """
    守恒校验：返回 difference，非 0 则表示能量不守恒
    在每笔写操作后调用，不通过则回滚
    """
    metrics = await calculate_audit_metrics(session)
    return metrics["difference"]

"""
结算服务数据库操作 (CRUD)
"""
import time
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Agent, SettlementLog


def now_ms() -> int:
    return int(time.time() * 1000)


async def get_agent_by_id(session: AsyncSession, agent_id: str) -> Optional[Agent]:
    stmt = select(Agent).where(Agent.agent_id == agent_id)
    res = await session.execute(stmt)
    return res.scalar_one_or_none()


async def list_all_agents(session: AsyncSession) -> List[Agent]:
    stmt = select(Agent).order_by(Agent.level.asc())
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def create_agent(session: AsyncSession, agent: Agent) -> Agent:
    session.add(agent)
    await session.commit()
    await session.refresh(agent)
    return agent


async def get_agent_chain_by_ids(session: AsyncSession, agent_ids: List[str]) -> List[Agent]:
    """
    按 agent_ids 列表查代理链 (从开房代理向上追溯)
    若 agent_ids 为空则返回全部 active 代理
    """
    if not agent_ids:
        stmt = select(Agent).where(Agent.status == "active").order_by(Agent.level.asc())
        res = await session.execute(stmt)
        return list(res.scalars().all())

    chain = []
    visited = set()
    for start_id in agent_ids:
        curr_id = start_id
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


async def save_settlement_logs(
    session: AsyncSession,
    transaction_id: str,
    agent_shares: List[dict],
    platform_revenue: int
):
    """批量写入结算分账明细"""
    import uuid
    for share in agent_shares:
        log = SettlementLog(
            settlement_id=f"stl_{uuid.uuid4().hex[:16]}",
            transaction_id=transaction_id,
            agent_id=share["agent_id"],
            level=share["level"],
            commission_amount=share["commission_amount"],
            platform_revenue=platform_revenue,
            created_at=now_ms()
        )
        session.add(log)
    await session.commit()

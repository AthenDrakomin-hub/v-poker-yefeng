"""
结算服务数据库操作 (CRUD)
"""
from typing import List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.models import Agent, SettlementLog


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

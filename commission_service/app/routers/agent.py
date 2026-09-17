"""
代理管理与代理树查询路由
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import APIResponse, AgentCreateRequest, AgentTreeNode
from app.crud import list_all_agents, create_agent, get_agent_by_id
from app.models import Agent

router = APIRouter(prefix="/api/agent", tags=["Agent Management"])


@router.post("", response_model=APIResponse[dict])
async def add_agent(req: AgentCreateRequest, db: AsyncSession = Depends(get_db)):
    """POST /api/agent 新增代理"""
    existing = await get_agent_by_id(db, req.agent_id)
    if existing:
        raise HTTPException(status_code=400, detail="Agent already exists")

    new_agent = Agent(
        agent_id=req.agent_id,
        parent_id=req.parent_id,
        level=req.level,
        r_ratio=req.r_ratio,
        commission_balance=0,
        status=req.status
    )
    await create_agent(db, new_agent)

    return APIResponse(code=0, message="Agent added", data={
        "agent_id": new_agent.agent_id,
        "parent_id": new_agent.parent_id,
        "level": new_agent.level,
        "r_ratio": float(new_agent.r_ratio),
        "commission_balance": 0,
        "status": new_agent.status
    })


@router.get("/tree", response_model=APIResponse[list])
async def get_agent_tree(db: AsyncSession = Depends(get_db)):
    """GET /api/agent/tree 代理树查询 (扁平列表，前端自行组装树)"""
    agents = await list_all_agents(db)
    return APIResponse(code=0, message="success", data=[
        {
            "agent_id": a.agent_id,
            "parent_id": a.parent_id,
            "level": a.level,
            "r_ratio": float(a.r_ratio),
            "commission_balance": a.commission_balance,
            "status": a.status
        }
        for a in agents
    ])

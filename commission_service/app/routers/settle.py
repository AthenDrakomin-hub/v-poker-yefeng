"""
代理结算分账路由
"""
import time
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.schemas import APIResponse, SettleRequest, SettleResponseData, AgentShareResult
from app.models import Agent, SettlementLog
from app.settlement_engine import SettlementEngine

router = APIRouter(prefix="/api", tags=["Commission Settlement"])


@router.post("/settle", response_model=APIResponse[SettleResponseData])
async def settle_commission(
    req: SettleRequest
):
    """
    POST /api/settle 代理返佣结算
    """
    # 构造代理链或从数据库读取
    mock_agents = [
        Agent(agent_id="agt_room_03", level=0, r_ratio=0.5000),
        Agent(agent_id="agt_sub_02", level=1, r_ratio=0.3000),
        Agent(agent_id="agt_top_01", level=2, r_ratio=0.2000),
    ]

    calc = SettlementEngine.calculate_commission(
        total_flow=req.total_flow,
        p_rate=req.platform_fee_rate,
        a_rate=req.agent_commission_rate,
        agent_chain=mock_agents
    )

    data = SettleResponseData(
        transaction_id=req.transaction_id,
        total_flow=calc["total_flow"],
        total_rake=calc["total_rake"],
        agent_pool=calc["agent_pool"],
        platform_revenue=calc["platform_revenue"],
        agent_shares=[AgentShareResult(**s) for s in calc["agent_shares"]],
        created_at=int(time.time() * 1000)
    )
    return APIResponse(code=0, message="settlement calculated", data=data)

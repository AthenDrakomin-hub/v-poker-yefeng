"""
代理结算分账路由 (由 wallet_service 调用)
"""
import time
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import APIResponse, SettleRequest, SettleResponseData, AgentShareResult
from app.crud import get_agent_chain_by_ids, save_settlement_logs
from app.settlement_engine import SettlementEngine

router = APIRouter(prefix="/api", tags=["Commission Settlement"])


@router.post("/settle", response_model=APIResponse[SettleResponseData])
async def settle_commission(
    req: SettleRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    POST /api/settle 代理返佣结算
    - 从 DB 按 agent_ids 查代理链
    - 计算各级分账
    - 落库 SettlementLog
    - 返回 agent_shares 给 wallet_service
    """
    agent_chain = await get_agent_chain_by_ids(db, req.agent_ids)

    calc = SettlementEngine.calculate_commission(
        total_flow=req.total_flow,
        p_rate=req.platform_fee_rate,
        a_rate=req.agent_commission_rate,
        agent_chain=agent_chain
    )

    # 落库分账明细
    await save_settlement_logs(
        db,
        transaction_id=req.transaction_id,
        agent_shares=calc["agent_shares"],
        platform_revenue=calc["platform_revenue"]
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

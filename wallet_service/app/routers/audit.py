"""
能量守恒对账与系统审计路由
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import APIResponse, AuditResponseData
from app.crud import calculate_audit_metrics

router = APIRouter(prefix="/api/wallet", tags=["System Audit"])


@router.get("/audit", response_model=APIResponse[AuditResponseData])
async def audit_system_energy(
    db: AsyncSession = Depends(get_db)
):
    """
    GET /api/wallet/audit 能量守恒对账
    核心公式：
    sum_all_wallets + sum_fee_pool == total_minted
    若 difference != 0 则表明系统发生资产泄漏或虚增，必须报警！
    """
    metrics = await calculate_audit_metrics(db)
    check_passed = metrics["check_passed"]
    msg = "Energy conserved: System in balance." if check_passed else "CRITICAL ALERT: Energy conservation violated!"

    return APIResponse(
        code=0 if check_passed else 5001,
        message=msg,
        data=AuditResponseData(**metrics)
    )

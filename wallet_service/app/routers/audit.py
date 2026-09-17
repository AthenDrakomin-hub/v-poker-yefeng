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
    Sum(所有钱包余额 + 冻结余额) + Sum(手续费池 fee_pool) == Sum(所有成功的 mint 铸币总量)
    若 difference != 0 则表明系统发生资产泄漏或虚增，必须报警！
    """
    metrics = await calculate_audit_metrics(db)
    is_conserved = metrics["is_conserved"]
    msg = "Energy conserved: System in balance." if is_conserved else "CRITICAL ALERT: Energy conservation violated!"

    return APIResponse(
        code=0 if is_conserved else 5001,
        message=msg,
        data=AuditResponseData(**metrics)
    )

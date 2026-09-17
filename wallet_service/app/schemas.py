"""
Pydantic 请求与响应契约定义 (遵循统一 {code, message, data} 规范)
"""
from typing import Generic, TypeVar, Optional, List, Any
from decimal import Decimal
from pydantic import BaseModel, Field

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    """
    统一全局响应契约
    """
    code: int = Field(default=0, description="状态码：0为成功，非0为异常")
    message: str = Field(default="success", description="返回说明信息")
    data: Optional[T] = Field(default=None, description="业务负载数据")


# --- 钱包相关 Schemas ---

class MintRequest(BaseModel):
    """
    管理员铸币请求
    """
    transaction_id: str = Field(..., description="幂等流水号，全局唯一")
    admin_user_id: str = Field(..., description="管理员用户ID")
    target_user_id: str = Field(..., description="接收铸币的目标用户ID")
    amount: int = Field(..., gt=0, description="铸币筹码整数")
    remark: Optional[str] = Field(default="Admin Mint", description="交易备注")


class MintResponseData(BaseModel):
    transaction_id: str
    target_user_id: str
    wallet_id: str
    amount: int
    balance: int
    created_at: int


class TransferRequest(BaseModel):
    """
    用户间自由转账请求 (扣除 0.01% 手续费)
    """
    transaction_id: str = Field(..., description="幂等流水号，全局唯一")
    from_user_id: str = Field(..., description="转出方用户ID")
    to_user_id: str = Field(..., description="接收方用户ID")
    amount: int = Field(..., gt=0, description="转出总额 (筹码整数)")
    remark: Optional[str] = Field(default="User Transfer", description="备注信息")


class TransferResponseData(BaseModel):
    transaction_id: str
    from_user_id: str
    to_user_id: str
    gross_amount: int
    fee: int
    net_amount: int
    from_balance: int
    to_balance: int
    fee_pool_balance: int
    created_at: int


class WinnerDistribution(BaseModel):
    """
    牌局获胜者分配项
    """
    user_id: str
    weight: int = Field(default=1, gt=0, description="平分权重或分配份数")


class GameSettleRequest(BaseModel):
    """
    游戏对局结算分水请求
    """
    transaction_id: str = Field(..., description="全局唯一对局结算流水号")
    room_id: str = Field(..., description="房间/牌桌号")
    total_pot: int = Field(..., gt=0, description="本局总底池筹码 S")
    player_count: int = Field(..., ge=2, description="参与对局人数")
    winners: List[WinnerDistribution] = Field(..., min_length=1, description="获胜赢家列表")
    platform_fee_rate: Decimal = Field(
        default=Decimal("0.0500"), description="平台房费抽水率 p，例如 0.0500"
    )
    agent_commission_rate: Decimal = Field(
        default=Decimal("0.0300"), description="代理总返佣率 a，例如 0.0300"
    )
    room_agent_id: Optional[str] = Field(
        default=None, description="开房代理ID（层级0代理），若为空则使用默认开房代理"
    )


class AgentShareItem(BaseModel):
    agent_id: str
    level: int
    r_ratio: float
    commission_amount: int


class GameSettleResponseData(BaseModel):
    transaction_id: str
    room_id: str
    total_pot: int
    total_rake: int  # 房费总抽水
    agent_pool: int  # 代理返佣池
    platform_revenue: int  # 平台最终净留存
    winners_payout: int  # 赢家瓜分实得总筹码
    winners_detail: List[dict]
    agent_shares: List[AgentShareItem]
    created_at: int


class BalanceResponseData(BaseModel):
    user_id: str
    wallet_id: str
    user_type: str
    balance: int
    frozen_balance: int
    updated_at: int


class TransactionItem(BaseModel):
    transaction_id: str
    from_wallet_id: Optional[str]
    to_wallet_id: str
    amount: int
    fee: int
    type: str
    status: str
    remark: Optional[str]
    created_at: int


class AuditResponseData(BaseModel):
    """
    系统能量守恒对账输出
    """
    total_minted: int = Field(..., description="历史所有铸币发行总量")
    wallets_balance_sum: int = Field(..., description="当前所有钱包可用及冻结余额之和")
    fee_pool_balance: int = Field(..., description="当前平台手续费池累积余额")
    total_system_assets: int = Field(..., description="钱包余额总和 + 手续费池余额")
    difference: int = Field(..., description="差额 (total_system_assets - total_minted)，必须为0")
    is_conserved: bool = Field(..., description="能量是否绝对守恒")
    wallets_count: int = Field(..., description="已注册钱包总数")
    audit_time: int = Field(..., description="审计完成毫秒时间戳")

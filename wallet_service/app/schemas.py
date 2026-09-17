"""
Pydantic 请求与响应契约定义 (严格遵循全局契约字典)
- snake_case / 整数金额 / 4位小数比例 / 毫秒时间戳
- 统一响应 { code, message, data }
- 牌桌虚拟账户模型：user_id = room_{room_id}, user_type = "room"
"""
from typing import Generic, TypeVar, Optional, List
from decimal import Decimal
from pydantic import BaseModel, Field

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    """统一全局响应契约"""
    code: int = Field(default=0, description="状态码：0为成功，非0为异常")
    message: str = Field(default="success", description="返回说明信息")
    data: Optional[T] = Field(default=None, description="业务负载数据")


# --- 钱包相关 Schemas ---

class MintRequest(BaseModel):
    """管理员铸币请求"""
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
    """用户间自由转账请求 (扣除 0.01% 手续费)"""
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


# --- 下注扣款 / 异常退款 / 游戏结算 ---

class BetRequest(BaseModel):
    """下注扣款请求：从玩家钱包扣款到牌桌虚拟钱包"""
    transaction_id: str = Field(..., description="幂等流水号，全局唯一")
    room_id: str = Field(..., description="房间号")
    user_id: str = Field(..., description="下注玩家用户ID")
    amount: int = Field(..., gt=0, description="下注金额 (筹码整数)")
    remark: Optional[str] = Field(default=None, description="备注")


class BetResponseData(BaseModel):
    transaction_id: str
    room_id: str
    user_id: str
    amount: int
    player_balance: int
    room_balance: int
    created_at: int


class RefundItem(BaseModel):
    """单个玩家退款明细"""
    user_id: str
    amount: int = Field(..., gt=0)


class RefundRequest(BaseModel):
    """异常退款请求：从牌桌虚拟钱包退还给玩家"""
    transaction_id: str = Field(..., description="幂等流水号，全局唯一")
    room_id: str = Field(..., description="房间号")
    refunds: List[RefundItem] = Field(..., min_length=1, description="退款明细列表")
    remark: Optional[str] = Field(default=None, description="备注")


class RefundResponseData(BaseModel):
    transaction_id: str
    room_id: str
    total_refund: int
    room_balance_after: int
    refunds: List[dict]
    created_at: int


class GameSettleRequest(BaseModel):
    """
    游戏对局结算分水请求
    资金来源：从 room_{room_id} 牌桌虚拟钱包扣款
    对齐全局契约：winner_ids + agent_ids
    """
    transaction_id: str = Field(..., description="全局唯一对局结算流水号")
    room_id: str = Field(..., description="房间/牌桌号")
    total_pot: int = Field(..., gt=0, description="本局总底池筹码 S (必须等于牌桌钱包余额)")
    winner_ids: List[str] = Field(..., min_length=1, description="获胜赢家用户ID列表，平分实得")
    platform_fee_rate: Decimal = Field(
        default=Decimal("0.0500"), description="平台房费抽水率 p，例如 0.0500"
    )
    agent_commission_rate: Decimal = Field(
        default=Decimal("0.0300"), description="代理总返佣率 a，例如 0.0300"
    )
    agent_ids: List[str] = Field(
        default_factory=list, description="代理分账名单 [room_agent, sub_agent, top_agent]"
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
    total_rake: int
    agent_pool: int
    platform_revenue: int
    winners_payout: int
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


class AuditBreakdown(BaseModel):
    """审计分项明细 (按用户类型拆分钱包余额)"""
    player_wallets: int = Field(description="所有玩家钱包余额总和")
    room_wallets: int = Field(description="所有牌桌钱包余额总和")
    agent_wallets: int = Field(description="所有代理钱包余额总和")
    admin_wallets: int = Field(description="所有管理员钱包余额总和")
    support_wallets: int = Field(description="所有客服钱包余额总和")
    fee_pool: int = Field(description="手续费池余额")


class AuditResponseData(BaseModel):
    """系统能量守恒对账输出 (增强版)"""
    total_minted: int = Field(description="历史所有铸币发行总量")
    sum_all_wallets: int = Field(description="所有钱包余额总和 (含玩家/牌桌/代理/管理员/客服)")
    sum_fee_pool: int = Field(description="手续费池余额")
    total_system_assets: int = Field(description="sum_all_wallets + sum_fee_pool")
    difference: int = Field(description="total_system_assets - total_minted，必须为0")
    check_passed: bool = Field(description="守恒校验是否通过")
    wallets_count: int = Field(description="已注册钱包总数")
    breakdown: AuditBreakdown = Field(description="分项明细")
    audit_time: int = Field(description="审计完成毫秒时间戳")

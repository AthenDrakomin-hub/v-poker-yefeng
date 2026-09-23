"""
结算服务 Pydantic 数据规范
"""
from typing import Optional, List, Generic, TypeVar
from decimal import Decimal
from pydantic import BaseModel, Field

T = TypeVar("T")


class APIResponse(BaseModel, Generic[T]):
    code: int = 0
    message: str = "success"
    data: Optional[T] = None


class SettleRequest(BaseModel):
    """代理返佣结算请求 (由 wallet_service 调用)"""
    transaction_id: str
    room_id: str
    total_flow: int = Field(..., gt=0, description="总流水 S")
    platform_fee_rate: Decimal = Field(default=Decimal("0.0500"), description="平台房费比例 p")
    agent_commission_rate: Decimal = Field(default=Decimal("0.0300"), description="代理总返佣比例 a")
    agent_ids: List[str] = Field(default_factory=list, description="代理分账名单 [room_agent, sub_agent, top_agent]")


class AgentShareResult(BaseModel):
    agent_id: str
    level: int
    r_ratio: float
    commission_amount: int


class SettleResponseData(BaseModel):
    transaction_id: str
    total_flow: int
    total_rake: int
    agent_pool: int
    platform_revenue: int
    agent_shares: List[AgentShareResult]
    created_at: int


class AgentCreateRequest(BaseModel):
    agent_id: str
    parent_id: Optional[str] = None
    level: int = 0
    r_ratio: Decimal = Field(..., description="抽成比例 r_i，如 0.4000")
    status: str = "active"


class AgentTreeNode(BaseModel):
    agent_id: str
    parent_id: Optional[str]
    level: int
    r_ratio: float
    commission_balance: int
    status: str
    children: List["AgentTreeNode"] = []

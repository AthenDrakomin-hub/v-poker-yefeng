"""
结算服务返佣数学引擎
"""
from decimal import Decimal, ROUND_FLOOR
from typing import List, Dict, Any
from app.models import Agent, SettlementLog


class SettlementEngine:
    @staticmethod
    def calculate_commission(
        total_flow: int,
        p_rate: Decimal,
        a_rate: Decimal,
        agent_chain: List[Agent]
    ) -> Dict[str, Any]:
        """
        计算房费、代理返佣池、平台净收益以及多级代理分账
        公式：
        - 房费总额 T_fee = floor(S * p)
        - 代理总池 C_pool = floor(S * a)
        - 平台基础留存 P_base = T_fee - C_pool
        - 各级代理分账 C_i = floor(C_pool * r_i)
        - 未分配零钱补充归入平台净收益
        """
        flow_dec = Decimal(str(total_flow))
        total_rake = int((flow_dec * p_rate).quantize(Decimal("1"), rounding=ROUND_FLOOR))
        agent_pool = int((flow_dec * a_rate).quantize(Decimal("1"), rounding=ROUND_FLOOR))
        base_platform_revenue = total_rake - agent_pool

        agent_shares = []
        distributed_commission = 0

        for agent in agent_chain:
            r_dec = Decimal(str(agent.r_ratio))
            share = int((Decimal(str(agent_pool)) * r_dec).quantize(Decimal("1"), rounding=ROUND_FLOOR))
            distributed_commission += share
            agent_shares.append({
                "agent_id": agent.agent_id,
                "level": agent.level,
                "r_ratio": float(agent.r_ratio),
                "commission_amount": share
            })

        unallocated = agent_pool - distributed_commission
        final_platform_revenue = base_platform_revenue + unallocated

        return {
            "total_flow": total_flow,
            "total_rake": total_rake,
            "agent_pool": agent_pool,
            "platform_revenue": final_platform_revenue,
            "agent_shares": agent_shares
        }

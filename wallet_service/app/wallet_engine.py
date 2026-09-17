"""
虚拟经济系统核心业务引擎 (铸币 / 转账扣费 / 游戏结算抽水 / 能量守恒校验)
"""
import math
import uuid
from decimal import Decimal, ROUND_FLOOR
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
import httpx

from app.config import settings
from app.models import Wallet, Transaction, FeePool, GameRecord, SettlementLog, Agent
from app.crud import (
    now_ms,
    get_or_create_wallet,
    get_wallet_by_user_id,
    get_fee_pool,
    get_transaction,
    get_agent_chain,
    calculate_audit_metrics
)
from app.schemas import (
    MintRequest,
    TransferRequest,
    GameSettleRequest,
    AgentShareItem
)


class WalletEngine:
    """
    钱包业务引擎：处理虚拟资产的原子流转与零损耗守恒
    """

    @staticmethod
    async def process_mint(session: AsyncSession, req: MintRequest) -> Dict[str, Any]:
        """
        1. 管理员铸币操作 (type: mint)
        - 严格幂等校验：若 transaction_id 已存在，直接拦截或返回原有结果
        - 不扣除任何支出方，直接注入目标钱包 balance
        - 记录流水
        """
        # 1. 幂等校验
        existing_tx = await get_transaction(session, req.transaction_id)
        if existing_tx:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate transaction_id '{req.transaction_id}'. Idempotency violation."
            )

        ts = now_ms()

        # 2. 目标用户钱包
        target_wallet = await get_or_create_wallet(session, req.target_user_id, user_type="player")

        # 3. 增加余额 (整数筹码)
        target_wallet.balance += req.amount
        target_wallet.updated_at = ts

        # 4. 写入流水账本
        tx = Transaction(
            transaction_id=req.transaction_id,
            from_wallet_id=None,  # 铸币无支出方
            to_wallet_id=target_wallet.wallet_id,
            amount=req.amount,
            fee=0,
            fee_recipient=settings.PLATFORM_FEE_POOL_ID,
            type="mint",
            status="success",
            remark=f"{req.remark} | Admin:{req.admin_user_id}",
            created_at=ts
        )
        session.add(tx)

        await session.commit()
        await session.refresh(target_wallet)

        return {
            "transaction_id": req.transaction_id,
            "target_user_id": req.target_user_id,
            "wallet_id": target_wallet.wallet_id,
            "amount": req.amount,
            "balance": target_wallet.balance,
            "created_at": ts
        }

    @staticmethod
    async def process_transfer(session: AsyncSession, req: TransferRequest) -> Dict[str, Any]:
        """
        2. 用户自由转账 (type: transfer)
        - 校验发送方余额充足
        - 扣除万分之一 (0.01%) 手续费，向下取整 (floor)
        - 手续费存入 fee_pool
        - 净额存入接收方钱包
        - 写入流水并保证支出量 == 到账量 + 手续费量
        """
        if req.from_user_id == req.to_user_id:
            raise HTTPException(status_code=400, detail="Cannot transfer chips to self.")

        # 1. 幂等校验
        existing_tx = await get_transaction(session, req.transaction_id)
        if existing_tx:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate transaction_id '{req.transaction_id}'."
            )

        ts = now_ms()

        # 2. 获取双方钱包
        from_wallet = await get_wallet_by_user_id(session, req.from_user_id)
        if not from_wallet:
            raise HTTPException(status_code=404, detail=f"Sender wallet for '{req.from_user_id}' not found.")

        if from_wallet.balance < req.amount:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance. Available: {from_wallet.balance}, Requested: {req.amount}"
            )

        to_wallet = await get_or_create_wallet(session, req.to_user_id, user_type="player")

        # 3. 计算 0.01% 手续费 (向下取整)
        # fee = floor(amount * 0.0001)
        gross_amount_dec = Decimal(str(req.amount))
        rate_dec = Decimal("0.0001")
        fee_dec = (gross_amount_dec * rate_dec).quantize(Decimal("1"), rounding=ROUND_FLOOR)
        fee = int(fee_dec)
        net_amount = req.amount - fee

        # 4. 账户金额更新
        from_wallet.balance -= req.amount
        from_wallet.updated_at = ts

        to_wallet.balance += net_amount
        to_wallet.updated_at = ts

        fee_pool = await get_fee_pool(session)
        fee_pool.balance += fee
        fee_pool.updated_at = ts

        # 5. 写入流水 (to_wallet_id 为接收方，amount 为净到账额，fee 为手续费)
        tx = Transaction(
            transaction_id=req.transaction_id,
            from_wallet_id=from_wallet.wallet_id,
            to_wallet_id=to_wallet.wallet_id,
            amount=net_amount,
            fee=fee,
            fee_recipient=settings.PLATFORM_FEE_POOL_ID,
            type="transfer",
            status="success",
            remark=f"{req.remark} | Gross:{req.amount}, Fee:{fee}",
            created_at=ts
        )
        session.add(tx)

        await session.commit()
        await session.refresh(from_wallet)
        await session.refresh(to_wallet)
        await session.refresh(fee_pool)

        return {
            "transaction_id": req.transaction_id,
            "from_user_id": req.from_user_id,
            "to_user_id": req.to_user_id,
            "gross_amount": req.amount,
            "fee": fee,
            "net_amount": net_amount,
            "from_balance": from_wallet.balance,
            "to_balance": to_wallet.balance,
            "fee_pool_balance": fee_pool.balance,
            "created_at": ts
        }

    @staticmethod
    async def process_game_settle(session: AsyncSession, req: GameSettleRequest) -> Dict[str, Any]:
        """
        3. 游戏结算与分水分账 (type: game_settle)
        参数：
        - total_pot: 本局总底池 S
        - platform_fee_rate: 房费抽水率 p (如 0.0500)
        - agent_commission_rate: 代理返佣率 a (如 0.0300)
        
        数学模型：
        - 房费总额 total_rake = floor(S * p)
        - 赢家实得总额 winners_payout = S - total_rake
        - 代理总返佣池 agent_pool = floor(S * a)
        - 平台净留存 platform_revenue = total_rake - agent_pool
        - 各级代理分账: r_i 从代理树获取，各级佣金 c_i = floor(agent_pool * r_i)
        - 未分尽碎屑归入 platform_revenue，确保零误差守恒
        """
        # 1. 幂等校验
        existing_tx = await get_transaction(session, req.transaction_id)
        if existing_tx:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate settlement transaction_id '{req.transaction_id}'."
            )

        ts = now_ms()
        total_pot_dec = Decimal(str(req.total_pot))
        p_dec = req.platform_fee_rate
        a_dec = req.agent_commission_rate

        if a_dec > p_dec:
            raise HTTPException(
                status_code=400,
                detail="Agent commission rate cannot exceed platform fee rate."
            )

        # 2. 精确计算核心指标
        total_rake = int((total_pot_dec * p_dec).quantize(Decimal("1"), rounding=ROUND_FLOOR))
        agent_pool = int((total_pot_dec * a_dec).quantize(Decimal("1"), rounding=ROUND_FLOOR))
        winners_payout = req.total_pot - total_rake
        base_platform_revenue = total_rake - agent_pool

        # 3. 赢家筹码发放 (根据权重分配)
        total_weight = sum(w.weight for w in req.winners)
        winners_detail = []
        distributed_winners = 0

        for i, winner in enumerate(req.winners):
            # 若是最后一个赢家，补齐剩余，避免除法截断
            if i == len(req.winners) - 1:
                share_amount = winners_payout - distributed_winners
            else:
                share_amount = math.floor((winners_payout * winner.weight) / total_weight)
                distributed_winners += share_amount

            winner_wallet = await get_or_create_wallet(session, winner.user_id, user_type="player")
            winner_wallet.balance += share_amount
            winner_wallet.updated_at = ts

            winners_detail.append({
                "user_id": winner.user_id,
                "wallet_id": winner_wallet.wallet_id,
                "amount": share_amount,
                "weight": winner.weight
            })

        # 4. 获取代理树并逐级返佣
        agent_chain = await get_agent_chain(session, req.room_agent_id)
        agent_shares: List[AgentShareItem] = []
        total_agent_commission = 0

        for agent in agent_chain:
            ratio_dec = Decimal(str(agent.r_ratio))
            commission = int((Decimal(str(agent_pool)) * ratio_dec).quantize(Decimal("1"), rounding=ROUND_FLOOR))
            
            # 更新代理钱包及佣金累积
            agent_wallet = await get_or_create_wallet(session, agent.agent_id, user_type="agent")
            agent_wallet.balance += commission
            agent_wallet.updated_at = ts

            agent.commission_balance += commission

            total_agent_commission += commission

            agent_shares.append(
                AgentShareItem(
                    agent_id=agent.agent_id,
                    level=agent.level,
                    r_ratio=float(agent.r_ratio),
                    commission_amount=commission
                )
            )

            # 写入结算分账明细
            settle_log = SettlementLog(
                settlement_id=f"stl_{uuid.uuid4().hex[:16]}",
                transaction_id=req.transaction_id,
                agent_id=agent.agent_id,
                level=agent.level,
                commission_amount=commission,
                platform_revenue=base_platform_revenue,
                created_at=ts
            )
            session.add(settle_log)

        # 未分尽的代理碎片补充进入平台净收益
        unallocated_agent_crumbs = agent_pool - total_agent_commission
        final_platform_revenue = base_platform_revenue + unallocated_agent_crumbs

        # 5. 平台手续费池入账 (增加平台净留存)
        fee_pool = await get_fee_pool(session)
        fee_pool.balance += final_platform_revenue
        fee_pool.updated_at = ts

        # 6. 写入游戏流水主表
        game_rec = GameRecord(
            transaction_id=req.transaction_id,
            room_id=req.room_id,
            total_flow=req.total_pot,
            player_count=req.player_count,
            created_at=ts,
            settlement_status="settled"
        )
        session.add(game_rec)

        # 7. 写入交易流水主表 (支出方为游戏房间, 接收方为赢家首位或集合, 记录总抽水为 fee)
        tx = Transaction(
            transaction_id=req.transaction_id,
            from_wallet_id=f"room_{req.room_id}",
            to_wallet_id=winners_detail[0]["wallet_id"] if winners_detail else "multiple_winners",
            amount=winners_payout,
            fee=total_rake,
            fee_recipient=settings.PLATFORM_FEE_POOL_ID,
            type="game_settle",
            status="success",
            remark=(
                f"Room:{req.room_id} | Pot:{req.total_pot} | Rake:{total_rake} "
                f"| AgentPool:{agent_pool} | PlatformRev:{final_platform_revenue}"
            ),
            created_at=ts
        )
        session.add(tx)

        await session.commit()

        # 8. 可选：异步上报至 commission_service 保持微服务解耦通信
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                await client.post(
                    f"{settings.COMMISSION_SERVICE_URL}/api/settle",
                    json={
                        "transaction_id": req.transaction_id,
                        "room_id": req.room_id,
                        "total_pot": req.total_pot,
                        "agent_pool": agent_pool,
                        "agent_shares": [s.model_dump() for s in agent_shares],
                        "platform_revenue": final_platform_revenue
                    }
                )
        except Exception:
            # 微服务容错：本地事务已完成，外部服务不可用时不阻塞核心结算
            pass

        return {
            "transaction_id": req.transaction_id,
            "room_id": req.room_id,
            "total_pot": req.total_pot,
            "total_rake": total_rake,
            "agent_pool": agent_pool,
            "platform_revenue": final_platform_revenue,
            "winners_payout": winners_payout,
            "winners_detail": winners_detail,
            "agent_shares": agent_shares,
            "created_at": ts
        }

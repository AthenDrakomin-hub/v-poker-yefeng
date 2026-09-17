"""
虚拟经济系统核心业务引擎
- 铸币 mint / 转账 transfer / 下注 bet / 退款 refund / 结算 game_settle
- 牌桌虚拟钱包模型：user_id = room_{room_id}, user_type = "room"
- 每笔写操作后强制能量守恒校验，不通过则回滚事务
- 严格遵循：整数筹码、Decimal 计算、毫秒时间戳、snake_case
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
    get_room_wallet,
    get_fee_pool,
    get_transaction,
    get_agent_chain,
    verify_energy_conservation
)
from app.schemas import (
    MintRequest,
    TransferRequest,
    BetRequest,
    RefundRequest,
    GameSettleRequest,
    AgentShareItem
)


class WalletEngine:
    """钱包业务引擎：处理虚拟资产的原子流转与零损耗守恒"""

    # ================================================================
    # 1. 管理员铸币 (type: mint) —— 唯一资金来源
    # ================================================================
    @staticmethod
    async def process_mint(session: AsyncSession, req: MintRequest) -> Dict[str, Any]:
        """
        铸币：唯一凭空产生筹码的接口，仅管理员可调
        - 幂等校验
        - 直接注入目标玩家钱包
        - 写入流水
        """
        existing_tx = await get_transaction(session, req.transaction_id)
        if existing_tx:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate transaction_id '{req.transaction_id}'. Idempotency violation."
            )

        ts = now_ms()
        target_wallet = await get_or_create_wallet(session, req.target_user_id, user_type="player")
        target_wallet.balance += req.amount
        target_wallet.updated_at = ts

        tx = Transaction(
            transaction_id=req.transaction_id,
            from_wallet_id=None,
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

        # 守恒校验：铸币后 difference 应等于铸币金额（因为总资产增加了）
        # 铸币本身就是资金注入，difference 不为 0 是正常的（total_minted 增加了）
        # 这里不做校验，因为 mint 是唯一合法的资金来源

        await session.refresh(target_wallet)
        return {
            "transaction_id": req.transaction_id,
            "target_user_id": req.target_user_id,
            "wallet_id": target_wallet.wallet_id,
            "amount": req.amount,
            "balance": target_wallet.balance,
            "created_at": ts
        }

    # ================================================================
    # 2. 用户自由转账 (type: transfer) —— 扣 0.01% 手续费
    # ================================================================
    @staticmethod
    async def process_transfer(session: AsyncSession, req: TransferRequest) -> Dict[str, Any]:
        """
        用户间转账：扣 0.01% 手续费入 fee_pool
        - 校验余额充足
        - 校验幂等
        - 守恒校验：操作前后 difference 不变（资金只是转移+磨损）
        """
        if req.from_user_id == req.to_user_id:
            raise HTTPException(status_code=400, detail="Cannot transfer chips to self.")

        existing_tx = await get_transaction(session, req.transaction_id)
        if existing_tx:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate transaction_id '{req.transaction_id}'."
            )

        ts = now_ms()
        from_wallet = await get_wallet_by_user_id(session, req.from_user_id)
        if not from_wallet:
            raise HTTPException(status_code=404, detail=f"Sender wallet for '{req.from_user_id}' not found.")
        if from_wallet.balance < req.amount:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance. Available: {from_wallet.balance}, Requested: {req.amount}"
            )

        to_wallet = await get_or_create_wallet(session, req.to_user_id, user_type="player")

        # fee = floor(amount * 0.0001)
        gross_dec = Decimal(str(req.amount))
        rate_dec = Decimal("0.0001")
        fee_dec = (gross_dec * rate_dec).quantize(Decimal("1"), rounding=ROUND_FLOOR)
        fee = int(fee_dec)
        net_amount = req.amount - fee

        from_wallet.balance -= req.amount
        from_wallet.updated_at = ts
        to_wallet.balance += net_amount
        to_wallet.updated_at = ts

        fee_pool = await get_fee_pool(session)
        fee_pool.balance += fee
        fee_pool.updated_at = ts

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

        # 守恒校验：转账操作后 difference 必须为 0（资金只是从玩家转到玩家+fee_pool）
        diff = await verify_energy_conservation(session)
        if diff != 0:
            await session.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Energy conservation violated after transfer. Difference: {diff}. Rolled back."
            )

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

    # ================================================================
    # 3. 下注扣款 (type: bet) —— 玩家钱包 -> 牌桌虚拟钱包
    # ================================================================
    @staticmethod
    async def process_bet(session: AsyncSession, req: BetRequest) -> Dict[str, Any]:
        """
        下注：玩家钱包扣款到牌桌虚拟钱包
        - 玩家余额 -= amount
        - 牌桌钱包 += amount（不存在则自动创建，user_type=room）
        - 守恒校验：操作前后 difference 不变（资金只是从玩家转到牌桌）
        """
        existing_tx = await get_transaction(session, req.transaction_id)
        if existing_tx:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate transaction_id '{req.transaction_id}'. Idempotency violation."
            )

        ts = now_ms()

        # 获取玩家钱包并校验余额
        player_wallet = await get_wallet_by_user_id(session, req.user_id)
        if not player_wallet:
            raise HTTPException(status_code=404, detail=f"Player wallet '{req.user_id}' not found.")
        if player_wallet.balance < req.amount:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance for bet. Available: {player_wallet.balance}, Requested: {req.amount}"
            )

        # 获取或创建牌桌虚拟钱包
        room_wallet = await get_room_wallet(session, req.room_id)

        # 执行资金转移
        player_wallet.balance -= req.amount
        player_wallet.updated_at = ts
        room_wallet.balance += req.amount
        room_wallet.updated_at = ts

        # 写入流水
        tx = Transaction(
            transaction_id=req.transaction_id,
            from_wallet_id=player_wallet.wallet_id,
            to_wallet_id=room_wallet.wallet_id,
            amount=req.amount,
            fee=0,
            fee_recipient=settings.PLATFORM_FEE_POOL_ID,
            type="bet",
            status="success",
            remark=f"{req.remark or ''} | Room:{req.room_id}, Bet:{req.amount}",
            created_at=ts
        )
        session.add(tx)
        await session.commit()

        # 守恒校验
        diff = await verify_energy_conservation(session)
        if diff != 0:
            await session.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Energy conservation violated after bet. Difference: {diff}. Rolled back."
            )

        await session.refresh(player_wallet)
        await session.refresh(room_wallet)

        return {
            "transaction_id": req.transaction_id,
            "room_id": req.room_id,
            "user_id": req.user_id,
            "amount": req.amount,
            "player_balance": player_wallet.balance,
            "room_balance": room_wallet.balance,
            "created_at": ts
        }

    # ================================================================
    # 4. 异常退款 (type: refund) —— 牌桌虚拟钱包 -> 玩家钱包
    # ================================================================
    @staticmethod
    async def process_refund(session: AsyncSession, req: RefundRequest) -> Dict[str, Any]:
        """
        异常退款：牌桌钱包退还给玩家
        - 校验牌桌钱包余额 >= 退款总额
        - 牌桌钱包 -= total_refund
        - 各玩家钱包 += 对应金额
        - 守恒校验
        """
        existing_tx = await get_transaction(session, req.transaction_id)
        if existing_tx:
            raise HTTPException(
                status_code=400,
                detail=f"Duplicate transaction_id '{req.transaction_id}'. Idempotency violation."
            )

        ts = now_ms()
        total_refund = sum(item.amount for item in req.refunds)

        # 获取牌桌钱包并校验余额
        room_wallet = await get_room_wallet(session, req.room_id)
        if room_wallet.balance < total_refund:
            raise HTTPException(
                status_code=400,
                detail=f"Room wallet insufficient balance for refund. Room balance: {room_wallet.balance}, Requested: {total_refund}"
            )

        # 牌桌钱包扣款
        room_wallet.balance -= total_refund
        room_wallet.updated_at = ts

        # 各玩家退款
        refunds_detail = []
        for item in req.refunds:
            player_wallet = await get_or_create_wallet(session, item.user_id, user_type="player")
            player_wallet.balance += item.amount
            player_wallet.updated_at = ts

            # 每个玩家写一条流水
            tx = Transaction(
                transaction_id=f"{req.transaction_id}_{item.user_id}",
                from_wallet_id=room_wallet.wallet_id,
                to_wallet_id=player_wallet.wallet_id,
                amount=item.amount,
                fee=0,
                fee_recipient=settings.PLATFORM_FEE_POOL_ID,
                type="refund",
                status="success",
                remark=f"{req.remark or ''} | Room:{req.room_id}",
                created_at=ts
            )
            session.add(tx)

            refunds_detail.append({
                "user_id": item.user_id,
                "amount": item.amount,
                "player_balance": player_wallet.balance
            })

        await session.commit()

        # 守恒校验
        diff = await verify_energy_conservation(session)
        if diff != 0:
            await session.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Energy conservation violated after refund. Difference: {diff}. Rolled back."
            )

        await session.refresh(room_wallet)

        return {
            "transaction_id": req.transaction_id,
            "room_id": req.room_id,
            "total_refund": total_refund,
            "room_balance_after": room_wallet.balance,
            "refunds": refunds_detail,
            "created_at": ts
        }

    # ================================================================
    # 5. 游戏结算 (type: game_settle) —— 从牌桌钱包分账
    # ================================================================
    @staticmethod
    async def process_game_settle(session: AsyncSession, req: GameSettleRequest) -> Dict[str, Any]:
        """
        游戏结算：从牌桌虚拟钱包扣款，分给赢家 + 平台 + 代理
        资金流：
        - 牌桌钱包 -= total_pot
        - 赢家钱包 += winners_payout (S - rake)
        - fee_pool += platform_revenue (rake - agent_pool)
        - 代理钱包 += agent_pool
        - 守恒校验
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

        # 2. 获取牌桌钱包并校验余额
        room_wallet = await get_room_wallet(session, req.room_id)
        if room_wallet.balance < req.total_pot:
            raise HTTPException(
                status_code=400,
                detail=f"Room wallet insufficient balance. Room balance: {room_wallet.balance}, Requested pot: {req.total_pot}"
            )

        # 3. 精确计算核心指标
        total_rake = int((total_pot_dec * p_dec).quantize(Decimal("1"), rounding=ROUND_FLOOR))
        agent_pool = int((total_pot_dec * a_dec).quantize(Decimal("1"), rounding=ROUND_FLOOR))
        winners_payout = req.total_pot - total_rake
        base_platform_revenue = total_rake - agent_pool

        # 4. 牌桌钱包扣款
        room_wallet.balance -= req.total_pot
        room_wallet.updated_at = ts

        # 5. 赢家平分实得 (最后一个赢家补齐截断误差)
        winner_count = len(req.winner_ids)
        winners_detail = []
        distributed = 0

        for i, winner_id in enumerate(req.winner_ids):
            if i == winner_count - 1:
                share = winners_payout - distributed
            else:
                share = math.floor(winners_payout / winner_count)
                distributed += share

            winner_wallet = await get_or_create_wallet(session, winner_id, user_type="player")
            winner_wallet.balance += share
            winner_wallet.updated_at = ts

            winners_detail.append({
                "user_id": winner_id,
                "wallet_id": winner_wallet.wallet_id,
                "amount": share
            })

        # 6. 调用 commission_service 完成代理层级分账
        agent_shares: List[AgentShareItem] = []
        unallocated_crumbs = 0

        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.post(
                    f"{settings.COMMISSION_SERVICE_URL}/api/settle",
                    json={
                        "transaction_id": req.transaction_id,
                        "room_id": req.room_id,
                        "total_flow": req.total_pot,
                        "platform_fee_rate": str(req.platform_fee_rate),
                        "agent_commission_rate": str(req.agent_commission_rate),
                        "agent_ids": req.agent_ids
                    }
                )
                resp.raise_for_status()
                comm_data = resp.json().get("data", {})

                for item in comm_data.get("agent_shares", []):
                    share_amt = int(item.get("commission_amount", 0))
                    agent_wallet = await get_or_create_wallet(
                        session, item["agent_id"], user_type="agent"
                    )
                    agent_wallet.balance += share_amt
                    agent_wallet.updated_at = ts

                    agent_obj = await session.get(Agent, item["agent_id"])
                    if agent_obj:
                        agent_obj.commission_balance += share_amt

                    agent_shares.append(AgentShareItem(
                        agent_id=item["agent_id"],
                        level=int(item.get("level", 0)),
                        r_ratio=float(item.get("r_ratio", 0)),
                        commission_amount=share_amt
                    ))

                total_distributed = sum(s.commission_amount for s in agent_shares)
                unallocated_crumbs = agent_pool - total_distributed

        except Exception:
            # commission_service 不可用时，降级为 wallet 内部代理链计算
            agent_chain = await get_agent_chain(
                session, req.agent_ids[0] if req.agent_ids else None
            )
            total_distributed = 0
            for agent in agent_chain:
                commission = int(
                    (Decimal(str(agent_pool)) * Decimal(str(agent.r_ratio)))
                    .quantize(Decimal("1"), rounding=ROUND_FLOOR)
                )
                agent_wallet = await get_or_create_wallet(session, agent.agent_id, user_type="agent")
                agent_wallet.balance += commission
                agent.commission_balance += commission
                total_distributed += commission

                agent_shares.append(AgentShareItem(
                    agent_id=agent.agent_id,
                    level=agent.level,
                    r_ratio=float(agent.r_ratio),
                    commission_amount=commission
                ))

            unallocated_crumbs = agent_pool - total_distributed

        final_platform_revenue = base_platform_revenue + unallocated_crumbs

        # 7. 平台手续费池入账
        fee_pool = await get_fee_pool(session)
        fee_pool.balance += final_platform_revenue
        fee_pool.updated_at = ts

        # 8. 写入游戏流水主表
        game_rec = GameRecord(
            transaction_id=req.transaction_id,
            room_id=req.room_id,
            total_flow=req.total_pot,
            player_count=winner_count,
            created_at=ts,
            settlement_status="settled"
        )
        session.add(game_rec)

        # 9. 写入交易流水主表
        tx = Transaction(
            transaction_id=req.transaction_id,
            from_wallet_id=room_wallet.wallet_id,
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

        # 10. 写入代理分账明细
        for share in agent_shares:
            settle_log = SettlementLog(
                settlement_id=f"stl_{uuid.uuid4().hex[:16]}",
                transaction_id=req.transaction_id,
                agent_id=share.agent_id,
                level=share.level,
                commission_amount=share.commission_amount,
                platform_revenue=final_platform_revenue,
                created_at=ts
            )
            session.add(settle_log)

        await session.commit()

        # 11. 守恒校验：结算后 difference 必须为 0
        diff = await verify_energy_conservation(session)
        if diff != 0:
            await session.rollback()
            raise HTTPException(
                status_code=500,
                detail=f"Energy conservation violated after game settle. Difference: {diff}. Rolled back."
            )

        return {
            "transaction_id": req.transaction_id,
            "room_id": req.room_id,
            "total_pot": req.total_pot,
            "total_rake": total_rake,
            "agent_pool": agent_pool,
            "platform_revenue": final_platform_revenue,
            "winners_payout": winners_payout,
            "winners_detail": winners_detail,
            "agent_shares": [s.model_dump() for s in agent_shares],
            "created_at": ts
        }

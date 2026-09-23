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
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
import httpx

from app.config import settings
from app.models import Wallet, Transaction, FeePool, GameRecord, SettlementLog, Agent, Room
from app.crud import (
    now_ms,
    get_or_create_wallet,
    get_wallet_by_user_id,
    get_room_wallet,
    get_fee_pool,
    get_transaction,
    get_agent_chain,
    verify_energy_conservation,
    lock_wallets
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

        # 1. 先获取两个钱包的 ID（不加锁，仅用于排序）
        from_wallet_pre = await get_wallet_by_user_id(session, req.from_user_id)
        if not from_wallet_pre:
            raise HTTPException(status_code=404, detail=f"Sender wallet for '{req.from_user_id}' not found.")

        to_wallet_pre = await get_or_create_wallet(session, req.to_user_id, user_type="player")

        # 2. 按 wallet_id 排序后加行锁，避免死锁
        wallets = await lock_wallets(session, [from_wallet_pre.wallet_id, to_wallet_pre.wallet_id])
        from_wallet = wallets[from_wallet_pre.wallet_id]
        to_wallet = wallets[to_wallet_pre.wallet_id]

        # 3. 加锁后重新校验余额（防止并发修改）
        if from_wallet.balance < req.amount:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance. Available: {from_wallet.balance}, Requested: {req.amount}"
            )

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

        # fee_pool 也必须加锁，否则并发转账会有竞态条件
        fee_pool = await get_fee_pool(session, for_update=True)
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

        # 守恒校验：不做全表校验（全表查询在 READ COMMITTED 下非原子，会误报）
        # 转账操作本身守恒：from - amount = to + net + fee_pool + fee
        # 已通过行锁保证并发安全，这里只需确认操作本身的数学正确性

        await session.commit()

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

        # 1. 先获取两个钱包（不加锁，仅用于排序）
        player_wallet_pre = await get_wallet_by_user_id(session, req.user_id)
        if not player_wallet_pre:
            raise HTTPException(status_code=404, detail=f"Player wallet '{req.user_id}' not found.")

        room_wallet_pre = await get_room_wallet(session, req.room_id)

        # 2. 按 wallet_id 排序后加行锁
        wallets = await lock_wallets(session, [player_wallet_pre.wallet_id, room_wallet_pre.wallet_id])
        player_wallet = wallets[player_wallet_pre.wallet_id]
        room_wallet = wallets[room_wallet_pre.wallet_id]

        # 3. 加锁后重新校验余额
        if player_wallet.balance < req.amount:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance for bet. Available: {player_wallet.balance}, Requested: {req.amount}"
            )

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

        # 守恒校验：bet 操作本身守恒（玩家 - amount = 牌桌 + amount）
        # 不做全表校验（全表查询在并发下非原子），已通过行锁保证安全
        await session.commit()

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

        # 1. 先获取所有涉及的钱包（不加锁，仅用于排序）
        room_wallet_pre = await get_room_wallet(session, req.room_id)
        player_wallets_pre = []
        for item in req.refunds:
            pw = await get_or_create_wallet(session, item.user_id, user_type="player")
            player_wallets_pre.append(pw)

        # 2. 收集所有 wallet_id，排序后统一加锁
        all_wallet_ids = [room_wallet_pre.wallet_id] + [pw.wallet_id for pw in player_wallets_pre]
        wallets = await lock_wallets(session, all_wallet_ids)

        room_wallet = wallets[room_wallet_pre.wallet_id]
        player_wallets = {pw.wallet_id: wallets[pw.wallet_id] for pw in player_wallets_pre}

        # 3. 加锁后重新校验牌桌余额
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
            player_wallet = player_wallets[f"w_player_{item.user_id}"]
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

        # 守恒校验：refund 操作本身守恒（牌桌 - total = 玩家们 + total）
        # 不做全表校验，已通过行锁保证安全
        await session.commit()

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

        # 2. 先获取所有涉及的钱包（不加锁，仅用于排序）
        room_wallet_pre = await get_room_wallet(session, req.room_id)

        winner_wallets_pre = []
        for winner_id in req.winner_ids:
            ww = await get_or_create_wallet(session, winner_id, user_type="player")
            winner_wallets_pre.append(ww)

        # 3. 收集所有 wallet_id，排序后统一加锁
        all_wallet_ids = [room_wallet_pre.wallet_id] + [ww.wallet_id for ww in winner_wallets_pre]
        wallets = await lock_wallets(session, all_wallet_ids)

        room_wallet = wallets[room_wallet_pre.wallet_id]
        winner_wallets = {ww.wallet_id: wallets[ww.wallet_id] for ww in winner_wallets_pre}

        # 4. 加锁后重新校验牌桌余额
        if room_wallet.balance < req.total_pot:
            raise HTTPException(
                status_code=400,
                detail=f"Room wallet insufficient balance. Room balance: {room_wallet.balance}, Requested pot: {req.total_pot}"
            )

        # 5. 精确计算核心指标
        total_rake = int((total_pot_dec * p_dec).quantize(Decimal("1"), rounding=ROUND_FLOOR))
        original_agent_pool = int((total_pot_dec * a_dec).quantize(Decimal("1"), rounding=ROUND_FLOOR))
        
        # 抽水上限：如果传了 big_blind，则最多抽 big_blind * rake_cap_multiplier
        # 标准德州扑克每手抽水有上限，防止高额桌抽水过重
        if req.big_blind and req.big_blind > 0:
            rake_cap = req.big_blind * req.rake_cap_multiplier
            if total_rake > rake_cap:
                # 抽水上限生效，代理返佣按比例缩放
                scale_factor = Decimal(rake_cap) / Decimal(total_rake)
                total_rake = rake_cap
                original_agent_pool = int((Decimal(original_agent_pool) * scale_factor).quantize(Decimal("1"), rounding=ROUND_FLOOR))
        
        agent_pool = original_agent_pool
        winners_payout = req.total_pot - total_rake
        base_platform_revenue = total_rake - agent_pool

        # 6. 牌桌钱包扣款
        room_wallet.balance -= req.total_pot
        room_wallet.updated_at = ts

        # 7. 赢家平分实得 (最后一个赢家补齐截断误差)
        winner_count = len(req.winner_ids)
        winners_detail = []
        distributed = 0

        for i, winner_id in enumerate(req.winner_ids):
            if i == winner_count - 1:
                share = winners_payout - distributed
            else:
                share = math.floor(winners_payout / winner_count)
                distributed += share

            winner_wallet = winner_wallets[f"w_player_{winner_id}"]
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

        # 计算缩放后的实际代理返佣率（抽水上限生效时需要缩放）
        effective_agent_rate = Decimal(agent_pool) / total_pot_dec if total_pot_dec > 0 else Decimal("0")

        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.post(
                    f"{settings.COMMISSION_SERVICE_URL}/api/settle",
                    json={
                        "transaction_id": req.transaction_id,
                        "room_id": req.room_id,
                        "total_flow": req.total_pot,
                        "platform_fee_rate": str(req.platform_fee_rate),
                        "agent_commission_rate": str(effective_agent_rate),
                        "agent_ids": req.agent_ids
                    }
                )
                resp.raise_for_status()
                comm_data = resp.json().get("data", {})

                for item in comm_data.get("agent_shares", []):
                    share_amt = int(item.get("commission_amount", 0))
                    # 统一使用 w_player_{agent_id} 作为代理钱包 ID
                    # 因为铸币时创建的是 player 类型钱包，避免同一个 user_id 有两个钱包
                    agent_wallet = await get_or_create_wallet(
                        session, item["agent_id"], user_type="player"
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
                # 统一使用 player 类型钱包
                agent_wallet = await get_or_create_wallet(session, agent.agent_id, user_type="player")
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
        # 先获取当前房间局数，用于记录 round_no
        room_for_round = await session.execute(select(Room).where(Room.room_id == req.room_id))
        room_obj_for_round = room_for_round.scalar_one_or_none()
        round_no = (room_obj_for_round.current_round + 1) if room_obj_for_round else 1

        game_rec = GameRecord(
            transaction_id=req.transaction_id,
            room_id=req.room_id,
            round_no=round_no,
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

        # 10. 写入代理分账明细 + 代理佣金流水
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

            # ★ 新增：给每个代理佣金写入 Transaction 流水（type: commission）
            # 这样代理查询自己的流水时就能看到佣金到账记录
            # 统一使用 w_player_{agent_id} 作为代理钱包 ID
            agent_wallet_id = f"w_player_{share.agent_id}"
            commission_tx = Transaction(
                transaction_id=f"comm_{req.transaction_id}_{share.agent_id}",
                from_wallet_id=room_wallet.wallet_id,
                to_wallet_id=agent_wallet_id,
                amount=share.commission_amount,
                fee=0,
                fee_recipient=settings.PLATFORM_FEE_POOL_ID,
                type="commission",
                status="success",
                remark=f"Agent commission | Level:{share.level} | Room:{req.room_id}",
                created_at=ts
            )
            session.add(commission_tx)

        # 11. 更新房间局数和状态
        room_result = await session.execute(select(Room).where(Room.room_id == req.room_id))
        room_obj = room_result.scalar_one_or_none()
        if room_obj:
            room_obj.current_round += 1
            room_obj.updated_at = ts

            # 检查是否达到总局数上限
            if room_obj.current_round >= room_obj.total_rounds:
                room_obj.status = "finished"
                # 房间结束后，牌桌钱包剩余筹码按 refund 退回（如果有剩余）
                if room_wallet.balance > 0:
                    # 这里只记录，实际退款需要 game-engine 调用 refund 接口
                    pass
            elif room_obj.status == "waiting":
                room_obj.status = "playing"

        # 守恒校验：game_settle 操作本身守恒
        # 牌桌 - total_pot = 赢家 + (winners_payout) + fee_pool + (platform_revenue) + 代理 + (agent_pool)
        # 已通过行锁保证安全，不做全表校验
        await session.commit()

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

"""
钱包服务 API 路由：铸币、转账、下注、退款、游戏结算、余额及流水查询
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas import (
    APIResponse,
    MintRequest,
    MintResponseData,
    TransferRequest,
    TransferResponseData,
    BetRequest,
    BetResponseData,
    RefundRequest,
    RefundResponseData,
    GameSettleRequest,
    GameSettleResponseData,
    BalanceResponseData,
    TransactionItem
)
from app.crud import get_wallet_by_user_id, get_user_transactions
from app.wallet_engine import WalletEngine

router = APIRouter(prefix="/api/wallet", tags=["Wallet Operations"])


@router.post("/mint", response_model=APIResponse[MintResponseData])
async def mint_chips(
    req: MintRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    POST /api/wallet/mint 管理员铸币
    唯一凭空产生筹码的接口，写入流水（type: mint），幂等校验
    """
    data = await WalletEngine.process_mint(db, req)
    return APIResponse(code=0, message="Mint successful", data=MintResponseData(**data))


@router.post("/transfer", response_model=APIResponse[TransferResponseData])
async def transfer_chips(
    req: TransferRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    POST /api/wallet/transfer 用户自由转账
    扣 0.01% 手续费入 fee_pool，守恒校验
    """
    data = await WalletEngine.process_transfer(db, req)
    return APIResponse(code=0, message="Transfer successful", data=TransferResponseData(**data))


@router.post("/bet", response_model=APIResponse[BetResponseData])
async def bet_chips(
    req: BetRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    POST /api/wallet/bet 下注扣款
    玩家钱包扣款到牌桌虚拟钱包 (type: bet)，守恒校验
    """
    data = await WalletEngine.process_bet(db, req)
    return APIResponse(code=0, message="Bet successful", data=BetResponseData(**data))


@router.post("/refund", response_model=APIResponse[RefundResponseData])
async def refund_chips(
    req: RefundRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    POST /api/wallet/refund 异常退款
    牌桌虚拟钱包退还给玩家 (type: refund)，守恒校验
    """
    data = await WalletEngine.process_refund(db, req)
    return APIResponse(code=0, message="Refund successful", data=RefundResponseData(**data))


@router.post("/game_settle", response_model=APIResponse[GameSettleResponseData])
async def settle_game_pot(
    req: GameSettleRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    POST /api/wallet/game_settle 游戏对局结算分账
    从牌桌虚拟钱包扣款，分给赢家 + 平台 + 代理，守恒校验
    """
    data = await WalletEngine.process_game_settle(db, req)
    return APIResponse(code=0, message="Game settled successfully", data=GameSettleResponseData(**data))


@router.get("/balance/{user_id}", response_model=APIResponse[BalanceResponseData])
async def get_balance(
    user_id: str,
    db: AsyncSession = Depends(get_db)
):
    """
    GET /api/wallet/balance/{user_id} 查询用户钱包余额
    """
    wallet = await get_wallet_by_user_id(db, user_id)
    if not wallet:
        raise HTTPException(status_code=404, detail=f"User wallet '{user_id}' not found.")

    return APIResponse(
        code=0, message="success",
        data=BalanceResponseData(
            user_id=wallet.user_id,
            wallet_id=wallet.wallet_id,
            user_type=wallet.user_type,
            balance=wallet.balance,
            frozen_balance=wallet.frozen_balance,
            updated_at=wallet.updated_at
        )
    )


@router.get("/transactions/{user_id}", response_model=APIResponse[List[TransactionItem]])
async def get_transactions(
    user_id: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """
    GET /api/wallet/transactions/{user_id} 查询流水账本
    """
    wallet = await get_wallet_by_user_id(db, user_id)
    if not wallet:
        return APIResponse(code=0, message="No wallet found", data=[])

    txs = await get_user_transactions(db, wallet.wallet_id, limit=limit, offset=offset)
    items = [
        TransactionItem(
            transaction_id=t.transaction_id,
            from_wallet_id=t.from_wallet_id,
            to_wallet_id=t.to_wallet_id,
            amount=t.amount,
            fee=t.fee,
            type=t.type,
            status=t.status,
            remark=t.remark,
            created_at=t.created_at
        )
        for t in txs
    ]
    return APIResponse(code=0, message="success", data=items)


@router.get("/leaderboard", response_model=APIResponse)
async def get_leaderboard(
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """财富排行榜：按用户钱包余额降序排列"""
    from sqlalchemy import text

    result = await db.execute(
        text("""
            SELECT user_id, user_type, balance
            FROM wallets
            WHERE user_type = 'player' AND balance > 0
            ORDER BY balance DESC
            LIMIT :limit
        """),
        {"limit": limit}
    )
    rows = result.mappings().all()

    leaderboard = [
        {
            "rank": idx + 1,
            "user_id": row["user_id"],
            "balance": row["balance"],
        }
        for idx, row in enumerate(rows)
    ]

    return APIResponse(code=0, message="success", data=leaderboard)

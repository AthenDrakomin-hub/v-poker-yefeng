"""
钱包服务 API 路由：铸币、转账、游戏结算、余额及流水查询
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
    向指定用户账户增加筹码，写入流水（type: mint），严格执行幂等校验
    """
    data = await WalletEngine.process_mint(db, req)
    return APIResponse(
        code=0,
        message="Mint successful",
        data=MintResponseData(**data)
    )


@router.post("/transfer", response_model=APIResponse[TransferResponseData])
async def transfer_chips(
    req: TransferRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    POST /api/wallet/transfer 用户自由转账
    校验余额，扣除 0.01% (万分之一) 手续费（向下取整），手续费归集到 fee_pool，写入流水
    """
    data = await WalletEngine.process_transfer(db, req)
    return APIResponse(
        code=0,
        message="Transfer successful",
        data=TransferResponseData(**data)
    )


@router.post("/game_settle", response_model=APIResponse[GameSettleResponseData])
async def settle_game_pot(
    req: GameSettleRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    POST /api/wallet/game_settle 游戏对局结算分账
    房费抽水 + 赢家分账 + 代理层级分佣 + 平台留存入账
    """
    data = await WalletEngine.process_game_settle(db, req)
    return APIResponse(
        code=0,
        message="Game settled successfully",
        data=GameSettleResponseData(**data)
    )


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
        code=0,
        message="success",
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

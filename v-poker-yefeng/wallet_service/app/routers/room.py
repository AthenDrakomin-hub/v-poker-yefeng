"""
房间管理路由
职责：创建房间、房间列表、房间详情、加入房间
对齐全局契约：6 位房号 + 可选密码
"""
import random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models import Room, Wallet
from app.schemas import (
    APIResponse,
    CreateRoomRequest,
    RoomItem,
    RoomDetail,
    JoinRoomRequest,
)

router = APIRouter(prefix="/api/rooms", tags=["Rooms"])


async def get_db():
    """获取数据库会话"""
    async with AsyncSessionLocal() as session:
        yield session


def generate_room_id() -> str:
    """
    生成 6 位随机数字房号
    行业标准：6 位数字，查重后分配
    """
    return f"{random.randint(100000, 999999)}"


@router.post("/create", response_model=APIResponse[RoomDetail])
async def create_room(
    req: CreateRoomRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    创建房间
    - 自动生成 6 位随机房号
    - 支持公开/私有房间
    - 校验游戏类型和参数范围
    """
    # 校验游戏类型
    valid_game_types = [
        "texas_holdem", "zha_jin_hua", "niu_niu", "san_gong", "squid_game",
        "guandan", "fight_bomb", "omaha",
        "thirteen_water", "double_kong", "hong_wu",
        "pineapple", "short_deck",
    ]
    if req.game_type not in valid_game_types:
        raise HTTPException(status_code=400, detail=f"Invalid game_type. Must be one of: {valid_game_types}")

    # 校验创建者钱包存在
    creator_wallet = await db.execute(
        select(Wallet).where(Wallet.user_id == req.created_by)
    )
    if not creator_wallet.scalar_one_or_none():
        raise HTTPException(status_code=404, detail=f"Creator wallet '{req.created_by}' not found.")

    # 生成不重复的 6 位房号
    room_id = generate_room_id()
    for _ in range(10):  # 最多重试 10 次
        existing = await db.execute(select(Room).where(Room.room_id == room_id))
        if not existing.scalar_one_or_none():
            break
        room_id = generate_room_id()
    else:
        raise HTTPException(status_code=500, detail="Failed to generate unique room_id after 10 attempts.")

    now_ms = int(time.time() * 1000)

    room = Room(
        room_id=room_id,
        room_name=req.room_name,
        room_password=req.room_password or "",
        game_type=req.game_type,
        room_level=req.room_level,
        blind_small=req.blind_small,
        blind_big=req.blind_big,
        ante=req.ante,
        variant=req.variant,
        mode=req.mode,
        total_rounds=req.total_rounds,
        base_score=req.base_score,
        action_time=req.action_time,
        platform_fee_rate=req.platform_fee_rate,
        agent_commission_rate=req.agent_commission_rate,
        min_players=req.min_players,
        max_players=req.max_players,
        big_blind=req.big_blind,
        rake_cap_multiplier=req.rake_cap_multiplier,
        created_by=req.created_by,
        config=req.config,
        # 有密码即视为私有房（契约 3.2：前端只传 room_password，不传 room_type；
        # 若沿用 req.room_type 的默认值 "public"，带密码房间会被误标为公开房）
        room_type="private" if req.room_password else "public",
        status="waiting",
        current_round=0,
        created_at=now_ms,
        updated_at=now_ms,
    )

    db.add(room)
    await db.commit()
    await db.refresh(room)

    return APIResponse(
        code=0,
        message="Room created successfully",
        data=RoomDetail(
            room_id=room.room_id,
            room_name=room.room_name,
            game_type=room.game_type,
            mode=room.mode,
            total_rounds=room.total_rounds,
            base_score=room.base_score,
            platform_fee_rate=room.platform_fee_rate,
            min_players=room.min_players,
            max_players=room.max_players,
            status=room.status,
            current_round=room.current_round,
            created_by=room.created_by,
            room_type=room.room_type,
            created_at=room.created_at,
            room_password=room.room_password,
            agent_commission_rate=room.agent_commission_rate,
            big_blind=room.big_blind,
            rake_cap_multiplier=room.rake_cap_multiplier,
            updated_at=room.updated_at,
        )
    )


@router.get("/list", response_model=APIResponse[list[RoomItem]])
async def list_rooms(
    game_type: str | None = None,
    status: str = "waiting",
    db: AsyncSession = Depends(get_db)
):
    """
    获取房间列表
    - 可按游戏类型筛选
    - 可按状态筛选（默认只显示等待中的房间）
    - 只返回公开房间
    """
    stmt = select(Room).where(Room.room_type == "public", Room.status == status)

    if game_type:
        stmt = stmt.where(Room.game_type == game_type)

    stmt = stmt.order_by(Room.created_at.desc()).limit(50)

    result = await db.execute(stmt)
    rooms = result.scalars().all()

    items = [
        RoomItem(
            room_id=room.room_id,
            room_name=room.room_name,
            game_type=room.game_type,
            mode=room.mode,
            total_rounds=room.total_rounds,
            base_score=room.base_score,
            platform_fee_rate=room.platform_fee_rate,
            min_players=room.min_players,
            max_players=room.max_players,
            status=room.status,
            current_round=room.current_round,
            created_by=room.created_by,
            room_type=room.room_type,
            created_at=room.created_at,
        )
        for room in rooms
    ]

    return APIResponse(
        code=0,
        message="Success",
        data=items
    )


@router.get("/{room_id}", response_model=APIResponse[RoomDetail])
async def get_room(
    room_id: str,
    db: AsyncSession = Depends(get_db)
):
    """获取房间详情"""
    result = await db.execute(select(Room).where(Room.room_id == room_id))
    room = result.scalar_one_or_none()

    if not room:
        raise HTTPException(status_code=404, detail=f"Room '{room_id}' not found.")

    return APIResponse(
        code=0,
        message="Success",
        data=RoomDetail(
            room_id=room.room_id,
            room_name=room.room_name,
            game_type=room.game_type,
            mode=room.mode,
            total_rounds=room.total_rounds,
            base_score=room.base_score,
            platform_fee_rate=room.platform_fee_rate,
            min_players=room.min_players,
            max_players=room.max_players,
            status=room.status,
            current_round=room.current_round,
            created_by=room.created_by,
            room_type=room.room_type,
            created_at=room.created_at,
            room_password=room.room_password,
            agent_commission_rate=room.agent_commission_rate,
            big_blind=room.big_blind,
            rake_cap_multiplier=room.rake_cap_multiplier,
            updated_at=room.updated_at,
        )
    )


@router.post("/join", response_model=APIResponse[RoomDetail])
async def join_room(
    req: JoinRoomRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    加入房间
    - 校验房间存在
    - 校验密码（私有房必填）
    - 校验玩家钱包存在
    """
    # 查询房间
    result = await db.execute(select(Room).where(Room.room_id == req.room_id))
    room = result.scalar_one_or_none()

    if not room:
        raise HTTPException(status_code=404, detail=f"Room '{req.room_id}' not found.")

    # 校验密码（私有房必填）
    if room.room_type == "private" or room.room_password:
        if not req.room_password or req.room_password != room.room_password:
            raise HTTPException(status_code=403, detail="Invalid room password.")

    # 校验玩家钱包存在
    wallet_result = await db.execute(select(Wallet).where(Wallet.user_id == req.user_id))
    if not wallet_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail=f"Player wallet '{req.user_id}' not found.")

    # 返回房间详情
    return APIResponse(
        code=0,
        message="Joined room successfully",
        data=RoomDetail(
            room_id=room.room_id,
            room_name=room.room_name,
            game_type=room.game_type,
            mode=room.mode,
            total_rounds=room.total_rounds,
            base_score=room.base_score,
            platform_fee_rate=room.platform_fee_rate,
            min_players=room.min_players,
            max_players=room.max_players,
            status=room.status,
            current_round=room.current_round,
            created_by=room.created_by,
            room_type=room.room_type,
            created_at=room.created_at,
            room_password=room.room_password,
            agent_commission_rate=room.agent_commission_rate,
            big_blind=room.big_blind,
            rake_cap_multiplier=room.rake_cap_multiplier,
            updated_at=room.updated_at,
        )
    )


import time

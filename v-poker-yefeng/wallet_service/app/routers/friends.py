"""
好友关系路由
"""
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime
import uuid

from app.database import get_db
from app.models import Friend

router = APIRouter(prefix="/api/friends", tags=["friends"])

class APIResponse(BaseModel):
    code: int = 0
    message: str = "success"
    data: Optional[Any] = None


class FriendAddRequest(BaseModel):
    friend_id: str


@router.get("/{user_id}", response_model=APIResponse)
async def list_friends(user_id: str, db: AsyncSession = Depends(get_db)):
    """获取好友列表"""
    result = await db.execute(
        select(Friend).where(Friend.user_id == user_id, Friend.status == "active")
    )
    friends = result.scalars().all()
    data = [{"user_id": f.friend_id, "name": f.friend_id, "online": False} for f in friends]
    return APIResponse(data=data)


@router.post("/add", response_model=APIResponse)
async def add_friend(req: FriendAddRequest, request: Request, db: AsyncSession = Depends(get_db)):
    """添加好友（当前用户ID从X-User-Id头获取）"""
    user_id = request.headers.get("X-User-Id", "")
    now = int(datetime.now().timestamp() * 1000)
    friend = Friend(
        id=f"fr_{uuid.uuid4().hex[:16]}",
        user_id=user_id,
        friend_id=req.friend_id,
        status="pending",
        created_at=now
    )
    db.add(friend)
    await db.commit()
    return APIResponse(data={"user_id": user_id, "friend_id": req.friend_id, "status": "pending"})

"""
好友关系路由
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime

from app.database import get_db

router = APIRouter(prefix="/api/friends", tags=["friends"])

class APIResponse(BaseModel):
    code: int = 0
    message: str = "success"
    data: Optional[any] = None


class FriendAddRequest(BaseModel):
    friend_id: str


# 内联 friends 表定义（避免修改 models.py）
from sqlalchemy import Column, String, BigInteger
from app.database import Base

class Friend(Base):
    __tablename__ = "friends"
    id = Column(String(64), primary_key=True)
    user_id = Column(String(64), nullable=False, index=True)
    friend_id = Column(String(64), nullable=False, index=True)
    friend_note = Column(String(64), nullable=True)
    status = Column(String(16), nullable=False, default="active")
    created_at = Column(BigInteger, nullable=False)


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
async def add_friend(req: FriendAddRequest, db: AsyncSession = Depends(get_db)):
    """添加好友"""
    import uuid
    now = int(datetime.now().timestamp() * 1000)
    friend = Friend(
        id=f"fr_{uuid.uuid4().hex[:16]}",
        user_id=req.friend_id,  # 简化：实际需要当前用户ID
        friend_id=req.friend_id,
        status="pending",
        created_at=now
    )
    db.add(friend)
    await db.commit()
    return APIResponse(data={"friend_id": req.friend_id, "status": "pending"})

"""
系统消息路由
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models import Message

router = APIRouter(prefix="/api/messages", tags=["messages"])

class APIResponse(BaseModel):
    code: int = 0
    message: str = "success"
    data: Optional[any] = None


@router.get("/{user_id}", response_model=APIResponse)
async def list_messages(user_id: str, limit: int = 20, offset: int = 0, db: AsyncSession = Depends(get_db)):
    """获取消息列表"""
    result = await db.execute(
        select(Message)
        .where(Message.user_id == user_id)
        .order_by(desc(Message.created_at))
        .limit(limit)
        .offset(offset)
    )
    messages = result.scalars().all()
    data = [{
        "message_id": m.message_id,
        "title": m.title,
        "content": m.content,
        "is_read": m.is_read,
        "created_at": m.created_at
    } for m in messages]
    return APIResponse(data=data)

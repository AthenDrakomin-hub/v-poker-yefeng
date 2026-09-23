"""
成就路由
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.database import Base, get_db
from sqlalchemy import Column, String, BigInteger, Boolean

router = APIRouter(prefix="/api/achievements", tags=["achievements"])

class APIResponse(BaseModel):
    code: int = 0
    message: str = "success"
    data: Optional[any] = None


class Achievement(Base):
    __tablename__ = "achievements"
    id = Column(String(64), primary_key=True)
    name = Column(String(64), nullable=False)
    description = Column(String(256), nullable=False)
    icon = Column(String(8), nullable=False, default="♠")
    condition_type = Column(String(32), nullable=False)
    condition_value = Column(BigInteger, nullable=False, default=1)
    created_at = Column(BigInteger, nullable=False)


class UserAchievement(Base):
    __tablename__ = "user_achievements"
    id = Column(String(64), primary_key=True)
    user_id = Column(String(64), nullable=False, index=True)
    achievement_id = Column(String(64), nullable=False)
    unlocked = Column(Boolean, nullable=False, default=False)
    unlocked_at = Column(BigInteger, nullable=True)


@router.get("/{user_id}", response_model=APIResponse)
async def list_achievements(user_id: str, db: AsyncSession = Depends(get_db)):
    """获取成就列表（含解锁状态）"""
    # 获取所有成就定义
    ach_result = await db.execute(select(Achievement))
    achievements = ach_result.scalars().all()

    # 获取用户解锁状态
    ua_result = await db.execute(
        select(UserAchievement).where(UserAchievement.user_id == user_id)
    )
    unlocked_map = {ua.achievement_id: ua for ua in ua_result.scalars().all()}

    data = []
    for ach in achievements:
        ua = unlocked_map.get(ach.id)
        data.append({
            "id": ach.id,
            "name": ach.name,
            "desc": ach.description,
            "icon": ach.icon,
            "unlocked": ua.unlocked if ua else False,
            "unlocked_at": ua.unlocked_at if ua and ua.unlocked else 0
        })

    return APIResponse(data=data)

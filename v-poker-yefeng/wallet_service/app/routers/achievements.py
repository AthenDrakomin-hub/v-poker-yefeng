"""
成就路由
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models import Achievement, UserAchievement

router = APIRouter(prefix="/api/achievements", tags=["achievements"])

class APIResponse(BaseModel):
    code: int = 0
    message: str = "success"
    data: Optional[any] = None


@router.get("/{user_id}", response_model=APIResponse)
async def list_achievements(user_id: str, db: AsyncSession = Depends(get_db)):
    """获取成就列表（含解锁状态）"""
    ach_result = await db.execute(select(Achievement))
    achievements = ach_result.scalars().all()

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

"""
个人战绩统计路由
从 game_records + user_stats 聚合玩家战绩
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel
from typing import Optional

from app.database import get_db
from app.models import GameRecord, UserStats

router = APIRouter(prefix="/api/stats", tags=["stats"])

class APIResponse(BaseModel):
    code: int = 0
    message: str = "success"
    data: Optional[dict] = None


@router.get("/{user_id}", response_model=APIResponse)
async def get_user_stats(user_id: str, db: AsyncSession = Depends(get_db)):
    """获取个人战绩统计"""
    # 查询 user_stats
    result = await db.execute(select(UserStats).where(UserStats.user_id == user_id))
    stats = result.scalar_one_or_none()

    if not stats:
        return APIResponse(data={
            "user_id": user_id,
            "total_games": 0,
            "win_rate": 0,
            "total_profit": 0,
            "best_pot": 0,
            "best_hand": "—",
            "max_streak": 0,
            "game_stats": []
        })

    return APIResponse(data={
        "user_id": user_id,
        "total_games": stats.total_hands,
        "win_rate": float(stats.win_rate),
        "total_profit": stats.total_pot,
        "best_pot": stats.biggest_pot,
        "best_hand": "—",
        "max_streak": 0,
        "game_stats": []
    })

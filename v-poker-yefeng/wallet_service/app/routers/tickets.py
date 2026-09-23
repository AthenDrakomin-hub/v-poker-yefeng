"""
客服工单路由
"""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
from typing import Optional
from datetime import datetime
import uuid

from app.database import get_db
from app.models import Ticket, TicketMessage

router = APIRouter(prefix="/api/tickets", tags=["tickets"])

class APIResponse(BaseModel):
    code: int = 0
    message: str = "success"
    data: Optional[any] = None


class TicketCreateRequest(BaseModel):
    user_id: str
    subject: str
    content: str


class TicketReplyRequest(BaseModel):
    content: str
    reply_by: str  # support / player


@router.get("/{user_id}", response_model=APIResponse)
async def list_tickets(user_id: str, db: AsyncSession = Depends(get_db)):
    """获取用户工单列表"""
    result = await db.execute(
        select(Ticket)
        .where(Ticket.user_id == user_id)
        .order_by(desc(Ticket.created_at))
    )
    tickets = result.scalars().all()
    data = [{
        "ticket_id": t.ticket_id,
        "subject": t.subject,
        "status": t.status,
        "created_at": t.created_at
    } for t in tickets]
    return APIResponse(data=data)


@router.post("", response_model=APIResponse)
async def create_ticket(req: TicketCreateRequest, db: AsyncSession = Depends(get_db)):
    """创建工单"""
    now = int(datetime.now().timestamp() * 1000)
    ticket = Ticket(
        ticket_id=f"tk_{uuid.uuid4().hex[:16]}",
        user_id=req.user_id,
        subject=req.subject,
        status="open",
        created_at=now,
        updated_at=now
    )
    db.add(ticket)
    await db.flush()

    # 首条消息
    msg = TicketMessage(
        message_id=f"tm_{uuid.uuid4().hex[:16]}",
        ticket_id=ticket.ticket_id,
        sender_type="player",
        sender_id=req.user_id,
        content=req.content,
        created_at=now
    )
    db.add(msg)
    await db.commit()
    return APIResponse(data={"ticket_id": ticket.ticket_id, "status": "open"})


@router.get("/detail/{ticket_id}", response_model=APIResponse)
async def get_ticket(ticket_id: str, db: AsyncSession = Depends(get_db)):
    """获取工单详情+消息"""
    result = await db.execute(select(Ticket).where(Ticket.ticket_id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        return APIResponse(code=404, message="工单不存在")

    msg_result = await db.execute(
        select(TicketMessage)
        .where(TicketMessage.ticket_id == ticket_id)
        .order_by(TicketMessage.created_at)
    )
    messages = msg_result.scalars().all()

    return APIResponse(data={
        "ticket_id": ticket.ticket_id,
        "subject": ticket.subject,
        "status": ticket.status,
        "user_id": ticket.user_id,
        "created_at": ticket.created_at,
        "messages": [{
            "message_id": m.message_id,
            "sender_type": m.sender_type,
            "content": m.content,
            "created_at": m.created_at
        } for m in messages]
    })


@router.patch("/{ticket_id}", response_model=APIResponse)
async def update_ticket(ticket_id: str, req: TicketReplyRequest, db: AsyncSession = Depends(get_db)):
    """回复工单/更新状态"""
    now = int(datetime.now().timestamp() * 1000)

    # 添加回复消息
    msg = TicketMessage(
        message_id=f"tm_{uuid.uuid4().hex[:16]}",
        ticket_id=ticket_id,
        sender_type=req.reply_by,
        sender_id=req.reply_by,
        content=req.content,
        created_at=now
    )
    db.add(msg)

    # 更新工单状态
    result = await db.execute(select(Ticket).where(Ticket.ticket_id == ticket_id))
    ticket = result.scalar_one_or_none()
    if ticket:
        ticket.status = "answered" if req.reply_by == "support" else "open"
        ticket.updated_at = now

    await db.commit()
    return APIResponse(data={"ticket_id": ticket_id, "status": ticket.status if ticket else "unknown"})

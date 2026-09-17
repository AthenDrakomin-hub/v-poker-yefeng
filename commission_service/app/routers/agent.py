"""
代理管理与代理树查询路由
"""
from typing import List
from fastapi import APIRouter, HTTPException
from app.schemas import APIResponse, AgentCreateRequest, AgentTreeNode

router = APIRouter(prefix="/api/agent", tags=["Agent Management"])

# 内存/持久化代理列表模拟
_AGENTS = [
    {"agent_id": "agt_top_01", "parent_id": None, "level": 2, "r_ratio": 0.2000, "commission_balance": 18500, "status": "active"},
    {"agent_id": "agt_sub_02", "parent_id": "agt_top_01", "level": 1, "r_ratio": 0.3000, "commission_balance": 27750, "status": "active"},
    {"agent_id": "agt_room_03", "parent_id": "agt_sub_02", "level": 0, "r_ratio": 0.5000, "commission_balance": 46250, "status": "active"}
]


@router.post("", response_model=APIResponse[dict])
async def add_agent(req: AgentCreateRequest):
    """
    POST /api/agent 新增代理
    """
    for a in _AGENTS:
        if a["agent_id"] == req.agent_id:
            raise HTTPException(status_code=400, detail="Agent already exists")

    new_a = {
        "agent_id": req.agent_id,
        "parent_id": req.parent_id,
        "level": req.level,
        "r_ratio": float(req.r_ratio),
        "commission_balance": 0,
        "status": req.status
    }
    _AGENTS.append(new_a)
    return APIResponse(code=0, message="Agent added", data=new_a)


@router.get("/tree", response_model=APIResponse[List[dict]])
async def get_agent_tree():
    """
    GET /api/agent/tree 代理树查询
    """
    return APIResponse(code=0, message="success", data=_AGENTS)

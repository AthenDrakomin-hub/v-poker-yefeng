/**
 * BFF - 管理端核心聚合路由 (/api/admin/*)
 * 能量守恒全景大盘、全局铸币操作、手续费池监控、代理管理
 *
 * 说明：转发到 wallet-service / commission-service / game-engine 时
 *       必须携带内部鉴权头 `X-Internal-Auth-Key`。
 */
import { Hono } from "hono";
import { authMiddleware } from "../auth/index.js";
import { internalHeaders } from "../internal.js";

export const adminRouter = new Hono();

const WALLET_SERVICE = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001";
const COMMISSION_SERVICE = process.env.COMMISSION_SERVICE_URL || "http://commission-service:8000";
const GAME_ENGINE = process.env.GAME_ENGINE_URL || "http://game-engine:8003";

// 所有 admin 路由都需要 admin 角色
adminRouter.use("*", authMiddleware(["admin"]));

// 系统全景核心指标看板
adminRouter.get("/overview", async (c) => {
  try {
    const [auditRes, roomsRes] = await Promise.all([
      fetch(`${WALLET_SERVICE}/api/wallet/audit`, { headers: internalHeaders() })
        .then((r) => r.json())
        .catch(() => null),
      fetch(`${GAME_ENGINE}/api/engine/rooms`, { headers: internalHeaders() })
        .then((r) => r.json())
        .catch(() => null),
    ]);

    const rooms = roomsRes?.data || [];

    return c.json({
      code: 0,
      message: "success",
      data: {
        audit: auditRes?.data,
        system_status: auditRes?.data?.check_passed ? "HEALTHY" : "CRITICAL_ALERT",
        active_tables: rooms.length,
        online_players: rooms.reduce((sum: number, r: any) => sum + (r.seat_count || 0), 0)
      }
    });
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 管理员调起铸币代理
adminRouter.post("/mint", async (c) => {
  const user = c.get("user") as { userId: string; userType: string };
  const body = await c.req.json();
  try {
    // 契约 3.5 用 user_id；wallet-service 的 MintRequest 要求
    // target_user_id + admin_user_id（后者由 JWT 注入），此处做字段映射
    const payload = {
      transaction_id: body.transaction_id,
      admin_user_id: user.userId,
      target_user_id: body.target_user_id ?? body.user_id,
      amount: body.amount,
      remark: body.remark ?? "Admin Mint"
    };
    const res = await fetch(`${WALLET_SERVICE}/api/wallet/mint`, {
      method: "POST",
      headers: internalHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    return c.json(json, res.status as any);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 能量守恒审计
adminRouter.get("/audit", async (c) => {
  try {
    const res = await fetch(`${WALLET_SERVICE}/api/wallet/audit`, { headers: internalHeaders() });
    const json = await res.json();
    return c.json(json);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 代理树查询
adminRouter.get("/agents", async (c) => {
  try {
    const res = await fetch(`${COMMISSION_SERVICE}/api/agent/tree`, { headers: internalHeaders() });
    const json = await res.json();
    return c.json(json);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 新增代理
adminRouter.post("/agents", async (c) => {
  const body = await c.req.json();
  try {
    const res = await fetch(`${COMMISSION_SERVICE}/api/agent`, {
      method: "POST",
      headers: internalHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body)
    });
    const json = await res.json();
    return c.json(json, res.status as any);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 全局流水查询
adminRouter.get("/transactions", async (c) => {
  const userId = c.req.query("user_id");
  if (!userId) {
    return c.json({ code: 400, message: "user_id query param required", data: null }, 400);
  }
  try {
    const res = await fetch(`${WALLET_SERVICE}/api/wallet/transactions/${userId}`, { headers: internalHeaders() });
    const json = await res.json();
    return c.json(json);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 活跃房间列表
adminRouter.get("/rooms", async (c) => {
  try {
    const res = await fetch(`${GAME_ENGINE}/api/engine/rooms`, { headers: internalHeaders() });
    const json = await res.json();
    return c.json(json);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

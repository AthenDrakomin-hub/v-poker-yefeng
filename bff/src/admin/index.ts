/**
 * BFF - 管理端核心聚合路由 (/api/admin/*)
 * 能量守恒全景大盘、全局铸币操作、手续费池监控、代理管理
 */
import { Hono } from "hono";
import { authMiddleware } from "../auth/index.js";

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
      fetch(`${WALLET_SERVICE}/api/wallet/audit`).then((r) => r.json()).catch(() => null),
      fetch(`${GAME_ENGINE}/api/engine/rooms`).then((r) => r.json()).catch(() => null),
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
  const body = await c.req.json();
  try {
    const res = await fetch(`${WALLET_SERVICE}/api/wallet/mint`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
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
    const res = await fetch(`${WALLET_SERVICE}/api/wallet/audit`);
    const json = await res.json();
    return c.json(json);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 代理树查询
adminRouter.get("/agents", async (c) => {
  try {
    const res = await fetch(`${COMMISSION_SERVICE}/api/agent/tree`);
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
      headers: { "Content-Type": "application/json" },
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
    const res = await fetch(`${WALLET_SERVICE}/api/wallet/transactions/${userId}`);
    const json = await res.json();
    return c.json(json);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 活跃房间列表
adminRouter.get("/rooms", async (c) => {
  try {
    const res = await fetch(`${GAME_ENGINE}/api/engine/rooms`);
    const json = await res.json();
    return c.json(json);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

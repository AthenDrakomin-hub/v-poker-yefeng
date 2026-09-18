/**
 * BFF - 房间路由 (/api/rooms/*)
 * 聚合玩家端房间相关请求
 */
import { Hono } from "hono";
import { authMiddleware } from "../auth/index.js";

export const roomRouter = new Hono();

const WALLET_SERVICE = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001";

// 所有房间路由都需要登录（玩家/代理/管理员都可以创建房间）
roomRouter.use("*", authMiddleware(["player", "agent", "admin"]));

// 创建房间
roomRouter.post("/create", async (c) => {
  const user = c.get("user") as { userId: string; userType: string };
  const body = await c.req.json();

  // 强制注入创建者为当前登录用户（防止越权）
  body.created_by = user.userId;

  try {
    const resp = await fetch(`${WALLET_SERVICE}/api/rooms/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return c.json(data, resp.status);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 房间列表
roomRouter.get("/list", async (c) => {
  try {
    const gameType = c.req.query("game_type") || "";
    const status = c.req.query("status") || "waiting";
    const url = `${WALLET_SERVICE}/api/rooms/list?status=${status}${gameType ? `&game_type=${gameType}` : ""}`;
    const resp = await fetch(url);
    const data = await resp.json();
    return c.json(data, resp.status);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 房间详情
roomRouter.get("/:room_id", async (c) => {
  const roomId = c.req.param("room_id");
  try {
    const resp = await fetch(`${WALLET_SERVICE}/api/rooms/${roomId}`);
    const data = await resp.json();
    return c.json(data, resp.status);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 加入房间
roomRouter.post("/join", async (c) => {
  const user = c.get("user") as { userId: string; userType: string };
  const body = await c.req.json();

  // 强制注入用户ID为当前登录用户（防止越权）
  body.user_id = user.userId;

  try {
    const resp = await fetch(`${WALLET_SERVICE}/api/rooms/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return c.json(data, resp.status);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

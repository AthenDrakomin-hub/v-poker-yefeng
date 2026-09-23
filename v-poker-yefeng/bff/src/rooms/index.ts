/**
 * BFF - 房间路由 (/api/rooms/*)
 * 聚合玩家端房间相关请求
 *
 * 说明：转发到 wallet-service / game-engine 时必须携带内部鉴权头
 *       `X-Internal-Auth-Key`，否则下游 /api/* 返回 401。
 */
import { Hono } from "hono";
import { authMiddleware } from "../auth/index.js";
import { internalHeaders } from "../internal.js";

export const roomRouter = new Hono();

const WALLET_SERVICE = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001";
const GAME_ENGINE = process.env.GAME_ENGINE_URL || "http://game-engine:8003";

// 房间路由：玩家/代理/管理员均可访问
roomRouter.use("*", authMiddleware(["player", "agent", "admin"]));

/**
 * wallet 侧 mode（cash 等）→ game-engine 插件支持的 mode
 * 插件 supported_modes：texas=[fixed]、zjh=[normal]、niu_niu/san_gong=[qiang_zhuang|tong_bi]
 */
function engineModeOf(gameType: string, mode: string): string {
  if (gameType === "texas_holdem") return "fixed";
  if (gameType === "zha_jin_hua") return "normal";
  if (gameType === "niu_niu" || gameType === "san_gong") {
    return mode === "tong_bi" ? "tong_bi" : "qiang_zhuang";
  }
  return mode;
}

/**
 * 确保 game-engine 已为该房间创建状态机
 *
 * 说明：BFF 此前只调用 wallet-service 建房，从未通知 game-engine，
 *       导致后续 `/bots`、WS 均返回 404，牌局无法开始。此处补齐。
 */
async function ensureEngineRoom(room: {
  room_id: string;
  game_type: string;
  mode: string;
  base_score: number;
  max_players?: number;
  min_players?: number;
  platform_fee_rate?: number;
  agent_commission_rate?: number;
}): Promise<void> {
  if (!room?.room_id) return;
  try {
    const resp = await fetch(`${GAME_ENGINE}/api/engine/room/create`, {
      method: "POST",
      headers: internalHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        room_id: room.room_id,
        game_type: room.game_type,
        mode: engineModeOf(room.game_type, room.mode),
        base_score: room.base_score,
        max_seats: room.max_players,
        min_players_to_start: room.min_players,
        platform_fee_rate: room.platform_fee_rate,
        agent_commission_rate: room.agent_commission_rate,
      }),
    });
    const json = await resp.json().catch(() => null);
    if (json?.code === 0) {
      console.log(`[BFF] engine room ${room.room_id} ready (${room.game_type})`);
    } else {
      // 已存在等情况忽略（幂等）
      console.warn(`[BFF] engine room ${room.room_id}: ${JSON.stringify(json)}`);
    }
  } catch (err: any) {
    console.warn(`[BFF] engine room ${room.room_id} create failed: ${err.message}`);
  }
}

/**
 * 确保玩家已在 game-engine 入座（初始筹码取钱包余额）
 *
 * 说明：引擎此前没有任何"人类玩家入座"入口，玩家 WS 发 ready 会得到
 *       "Player not seated."，牌局永远无法开始。此处补齐。
 */
async function ensureEngineSeat(roomId: string, userId: string): Promise<void> {
  try {
    // 取钱包余额作为入座筹码
    let chips = 0;
    try {
      const wr = await fetch(`${WALLET_SERVICE}/api/wallet/balance/${userId}`, { headers: internalHeaders() });
      const wj = await wr.json().catch(() => null);
      if (wj?.code === 0 && wj?.data?.balance != null) chips = Number(wj.data.balance);
    } catch {
      /* 取不到余额则用 0，不阻断入座 */
    }

    const resp = await fetch(`${GAME_ENGINE}/api/engine/room/${roomId}/seat`, {
      method: "POST",
      headers: internalHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ user_id: userId, chips })
    });
    const json = await resp.json().catch(() => null);
    if (json?.code === 0) {
      console.log(`[BFF] seated ${userId} in ${roomId} (chips=${chips}, seat=${json?.data?.seat_index})`);
    } else {
      console.warn(`[BFF] seat ${userId} in ${roomId}: ${JSON.stringify(json)}`);
    }
  } catch (err: any) {
    console.warn(`[BFF] seat ${userId} in ${roomId} failed: ${err.message}`);
  }
}

// 创建房间（代理端功能，玩家端前端已移除入口）
roomRouter.post("/create", async (c) => {
  const user = c.get("user") as { userId: string; userType: string };
  const body = await c.req.json();

  // 强制注入创建者为当前登录用户（防止越权）
  body.created_by = user.userId;

  try {
    const resp = await fetch(`${WALLET_SERVICE}/api/rooms/create`, {
      method: "POST",
      headers: internalHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    // wallet 侧建房成功后，同步在引擎侧建状态机，并让创建者入座
    if (resp.ok && data?.data?.room_id) {
      await ensureEngineRoom(data.data);
      await ensureEngineSeat(data.data.room_id, user.userId);
    }
    return c.json(data, resp.status as any);
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
    const resp = await fetch(url, { headers: internalHeaders() });
    const data = await resp.json();
    return c.json(data, resp.status as any);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 房间详情
roomRouter.get("/:room_id", async (c) => {
  const roomId = c.req.param("room_id");
  try {
    const resp = await fetch(`${WALLET_SERVICE}/api/rooms/${roomId}`, { headers: internalHeaders() });
    const data = await resp.json();
    return c.json(data, resp.status as any);
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
      headers: internalHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    // join 成功后确保引擎侧房间存在且玩家已入座
    if (resp.ok && data?.data?.room_id) {
      await ensureEngineRoom(data.data);
      await ensureEngineSeat(data.data.room_id, user.userId);
    }
    return c.json(data, resp.status as any);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 添加 AI 机器人（转发到 game-engine）
roomRouter.post("/:room_id/bots", async (c) => {
  const roomId = c.req.param("room_id");
  const body = await c.req.json();
  try {
    const resp = await fetch(`${GAME_ENGINE}/api/engine/room/${roomId}/bots`, {
      method: "POST",
      headers: internalHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return c.json(data, resp.status as any);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 导出牌谱（转发到 game-engine）
roomRouter.get("/:room_id/hand-history", async (c) => {
  const roomId = c.req.param("room_id");
  try {
    const resp = await fetch(`${GAME_ENGINE}/api/engine/room/${roomId}/hand-history`, {
      headers: internalHeaders(),
    });
    const data = await resp.json();
    return c.json(data, resp.status as any);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

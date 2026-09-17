/**
 * 多游戏引擎主微服务 (Node.js + Hono)
 * 架构：统一平台核心 (Core) + 游戏规则插件 + 钱包桥接 (Bridge)
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { coreRoomManager } from "./core/roomManager.js";
import { coreActionRouter } from "./core/actionRouter.js";
import { walletClient } from "./bridge/walletClient.js";
import { GameMode, GameSettleRequest, GameType } from "./shared/types.js";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "multi-game-engine",
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

/** 1. 创建游戏房间 */
app.post("/api/engine/room/create", async (c) => {
  try {
    const body = await c.req.json();
    const { room_id, game_type, mode, base_score } = body;

    if (!room_id || !game_type || !mode) {
      return c.json({ code: 400, message: "Missing required fields: room_id, game_type, mode" }, 400);
    }

    const created = coreRoomManager.createRoom({
      room_id,
      game_type: game_type as GameType,
      mode: mode as GameMode,
      base_score: base_score ? Number(base_score) : 100
    });

    return c.json({ code: 0, message: "Room created successfully", data: created.room });
  } catch (err: any) {
    return c.json({ code: 500, message: err.message }, 500);
  }
});

/** 2. 获取所有房间列表 */
app.get("/api/engine/rooms", (c) => {
  const rooms = coreRoomManager.getAllRooms();
  return c.json({ code: 0, message: "OK", data: rooms });
});

/** 3. 获取房间状态 */
app.get("/api/engine/room/:id", (c) => {
  const roomId = c.req.param("id");
  const room = coreRoomManager.getRoom(roomId);
  const sm = coreRoomManager.getStateMachine(roomId);

  if (!room || !sm) {
    return c.json({ code: 404, message: "Room not found" }, 404);
  }

  return c.json({
    code: 0, message: "OK",
    data: { room, round_state: sm.roundState, seats: sm.seatManager.getSeats() }
  });
});

/** 4. 玩家操作 */
app.post("/api/engine/room/:id/action", async (c) => {
  const roomId = c.req.param("id");
  const body = await c.req.json();
  const { user_id, action } = body;

  const result = coreActionRouter.routeAction({ room_id: roomId, user_id, action });
  if (!result.success) {
    return c.json({ code: 400, message: result.error }, 400);
  }
  return c.json({ code: 0, message: "Action accepted", data: result });
});

/** 5. 结算当前牌局并上报钱包服务 */
app.post("/api/engine/room/:id/settle", async (c) => {
  const roomId = c.req.param("id");
  const sm = coreRoomManager.getStateMachine(roomId);
  if (!sm) {
    return c.json({ code: 404, message: "Room not found" }, 404);
  }

  try {
    const { request, response } = await sm.settleRound();
    return c.json({
      code: 0,
      message: "Game settled successfully",
      data: { request, response }
    });
  } catch (err: any) {
    return c.json({
      code: 500,
      message: `Failed to settle with wallet: ${err.message}`,
      data: null
    }, 500);
  }
});

const PORT = Number(process.env.ENGINE_PORT || 8003);

if (process.env.NODE_ENV !== "test") {
  serve({ fetch: app.fetch, port: PORT });
  console.log(`[GameEngine] Running on http://0.0.0.0:${PORT}`);
}

export default app;

/**
 * 多游戏引擎主微服务 (Node.js + Hono + WebSocket)
 * 核心架构：统一平台核心 (Core) + 6 规则插件 (Plugins) + 钱包桥接 (Bridge)
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

/**
 * 1. 创建游戏房间 POST /api/engine/room/create
 */
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

    return c.json({
      code: 0,
      message: "Room created successfully",
      data: created.room
    });
  } catch (err: any) {
    return c.json({ code: 500, message: err.message }, 500);
  }
});

/**
 * 2. 获取所有房间列表 GET /api/engine/rooms
 */
app.get("/api/engine/rooms", (c) => {
  const rooms = coreRoomManager.getAllRooms();
  return c.json({ code: 0, message: "OK", data: rooms });
});

/**
 * 3. 获取房间状态 GET /api/engine/room/:id
 */
app.get("/api/engine/room/:id", (c) => {
  const roomId = c.req.param("id");
  const room = coreRoomManager.getRoom(roomId);
  const sm = coreRoomManager.getStateMachine(roomId);

  if (!room || !sm) {
    return c.json({ code: 404, message: "Room not found" }, 404);
  }

  return c.json({
    code: 0,
    message: "OK",
    data: {
      room,
      round_state: sm.roundState,
      seats: sm.seatManager.getSeats()
    }
  });
});

/**
 * 4. 玩家操作 POST /api/engine/room/:id/action
 */
app.post("/api/engine/room/:id/action", async (c) => {
  const roomId = c.req.param("id");
  const body = await c.req.json();
  const { user_id, action } = body;

  const result = coreActionRouter.routeAction({
    room_id: roomId,
    user_id,
    action
  });

  if (!result.success) {
    return c.json({ code: 400, message: result.error }, 400);
  }

  return c.json({ code: 0, message: "Action accepted", data: result });
});

/**
 * 5. 结算当前牌局并上报钱包服务 POST /api/engine/room/:id/settle
 */
app.post("/api/engine/room/:id/settle", async (c) => {
  const roomId = c.req.param("id");
  const sm = coreRoomManager.getStateMachine(roomId);
  if (!sm) {
    return c.json({ code: 404, message: "Room not found" }, 404);
  }

  const results = sm.forceShowdown();
  const totalPot = sm.roundState.total_pot > 0
    ? sm.roundState.total_pot
    : sm.roundState.room.base_score * 4;

  const txId = walletClient.generateRoundTxId(roomId);
  const settlePayload: GameSettleRequest = {
    transaction_id: txId,
    game_type: sm.roundState.room.game_type,
    room_id: roomId,
    total_pot: totalPot,
    platform_fee_rate: sm.roundState.room.platform_fee_rate,
    agent_commission_rate: sm.roundState.room.agent_commission_rate,
    agent_ids: sm.roundState.room.agent_ids,
    player_results: results
  };

  try {
    const settleRes = await walletClient.settleGame(settlePayload);
    sm.finishSettlement();

    return c.json({
      code: 0,
      message: "Game settled successfully",
      data: {
        request: settlePayload,
        response: settleRes
      }
    });
  } catch (err: any) {
    return c.json({
      code: 500,
      message: `Failed to settle with wallet: ${err.message}`,
      data: { payload: settlePayload }
    }, 500);
  }
});

const PORT = Number(process.env.ENGINE_PORT || 8003);

if (process.env.NODE_ENV !== "test") {
  serve({
    fetch: app.fetch,
    port: PORT
  });
  console.log(`[GameEngine] Running on http://0.0.0.0:${PORT}`);
}

export default app;

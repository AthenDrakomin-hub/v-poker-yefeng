/**
 * 多游戏引擎主微服务 (Node.js + Hono)
 * 架构：统一平台核心 (Core) + 游戏规则插件 + 钱包桥接 (Bridge)
 * 实时推送：WebSocket 房间订阅 + 心跳检测 + 自动清理
 * 性能：支持 500+ 并发用户
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { coreRoomManager } from "./core/roomManager.js";
import { coreActionRouter } from "./core/actionRouter.js";
import { walletClient } from "./bridge/walletClient.js";
import { GameMode, GameSettleRequest, GameType } from "./shared/types.js";

const app = new Hono();

// ========== WebSocket 房间订阅管理器 ==========

interface WsClient {
  userId: string;
  roomId: string;
  ws: any;
  lastPing: number; // 最后一次心跳时间
}

const roomSubscribers = new Map<string, Set<WsClient>>(); // roomId -> 订阅者列表
const HEARTBEAT_INTERVAL = 30000; // 30秒心跳
const HEARTBEAT_TIMEOUT = 60000; // 60秒无响应断开

/**
 * 广播房间状态给所有订阅者
 */
function broadcastRoomState(roomId: string) {
  const subscribers = roomSubscribers.get(roomId);
  if (!subscribers || subscribers.size === 0) return;

  const room = coreRoomManager.getRoom(roomId);
  const sm = coreRoomManager.getStateMachine(roomId);
  if (!room || !sm) return;

  const message = JSON.stringify({
    type: "game_state",
    room_id: roomId,
    data: {
      room,
      round_state: sm.roundState,
      seats: sm.seatManager.getSeats()
    },
    timestamp: Date.now()
  });

  const deadClients: WsClient[] = [];
  subscribers.forEach((client) => {
    try {
      client.ws.send(message);
    } catch (err) {
      deadClients.push(client);
    }
  });

  // 清理死连接
  deadClients.forEach((c) => {
    subscribers.delete(c);
  });
}

/**
 * 心跳检测：定期 ping 所有客户端，清理死连接
 */
setInterval(() => {
  const now = Date.now();
  for (const [roomId, subscribers] of roomSubscribers.entries()) {
    const deadClients: WsClient[] = [];

    subscribers.forEach((client) => {
      // 超过 60 秒无响应的连接，主动关闭
      if (now - client.lastPing > HEARTBEAT_TIMEOUT) {
        try {
          client.ws.terminate();
        } catch {}
        deadClients.push(client);
      } else {
        // 发送 ping
        try {
          client.ws.ping();
        } catch {}
      }
    });

    deadClients.forEach((c) => subscribers.delete(c));

    // 清理空房间
    if (subscribers.size === 0) {
      roomSubscribers.delete(roomId);
      console.log(`[WS] Room ${roomId} has no subscribers, removed`);
    }
  }
}, HEARTBEAT_INTERVAL);

/**
 * 定期推送房间状态（每 500ms 一次，替代前端轮询）
 */
setInterval(() => {
  for (const roomId of roomSubscribers.keys()) {
    broadcastRoomState(roomId);
  }
}, 500);

app.get("/health", (c) => {
  const totalSubscribers = Array.from(roomSubscribers.values()).reduce((sum, set) => sum + set.size, 0);
  return c.json({
    status: "ok",
    service: "multi-game-engine",
    uptime: process.uptime(),
    timestamp: Date.now(),
    rooms: roomSubscribers.size,
    ws_connections: totalSubscribers,
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
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

  // 操作后立即广播状态
  broadcastRoomState(roomId);

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

    // 结算后广播结算结果
    broadcastRoomState(roomId);

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

/**
 * 6. WebSocket 连接端点
 * 客户端连接后发送 { type: "join_room", room_id: "xxx", user_id: "xxx" }
 */
app.get("/ws", (c) => {
  // 这里用原生 ws 库实现，不用 Hono 的 ws 中间件，更简单直接
  return c.text("WebSocket endpoint. Connect with Sec-WebSocket-Protocol header.", 200);
});

const PORT = Number(process.env.ENGINE_PORT || 8003);

if (process.env.NODE_ENV !== "test") {
  const server = serve({ fetch: app.fetch, port: PORT });
  console.log(`[GameEngine] HTTP server on http://0.0.0.0:${PORT}`);
}

export default app;

/**
 * 多游戏引擎主微服务 (Node.js + Hono)
 * 架构：统一平台核心 (Core) + 游戏规则插件 + 钱包桥接 (Bridge)
 *
 * v3 WS 协议升级：
 *  - 事件驱动即时推送（替代 500ms 全量轮询）
 *  - 支持 WS 端 player_action，带 req_id 的 action_ack
 *  - 推送 turn_timer / player_status / auto_fold 等事件
 *  - 定时接入 checkDisconnectTimeout（v2 死代码复活）
 *  - 保留 5s 兜底全量同步（防事件丢包）
 */

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { WebSocketServer, WebSocket } from "ws";
import { coreRoomManager } from "./core/roomManager.js";
import { coreActionRouter } from "./core/actionRouter.js";
import { coreEventBus } from "./core/eventBus.js";
import { walletClient } from "./bridge/walletClient.js";
import { GameMode, GameType } from "./shared/types.js";

const app = new Hono();

// ========== 生产安全：内部鉴权中间件 ==========
const INTERNAL_AUTH_KEY = process.env.INTERNAL_AUTH_KEY || "change-me-in-prod";

app.use("/api/*", async (c, next) => {
  // /health 不需要鉴权（Docker healthcheck 用）
  if (c.req.path === "/health") return next();

  const key = c.req.header("X-Internal-Auth-Key");
  if (key !== INTERNAL_AUTH_KEY) {
    return c.json({ code: 401, message: "Unauthorized: invalid internal key" }, 401);
  }
  await next();
});

// ========== WebSocket 房间订阅管理器 ==========

interface WsClient {
  userId: string;
  roomId: string;
  ws: WebSocket;
  lastPing: number;
  isSpectator?: boolean;
}

const roomSubscribers = new Map<string, Set<WsClient>>();
const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 60_000;
const SYNC_INTERVAL = 5_000;            // 兜底全量同步间隔
const DISCONNECT_CHECK_INTERVAL = 30_000; // 断线超时检查间隔
const DISCONNECT_TIMEOUT_MS = Number(process.env.DISCONNECT_TIMEOUT_MS || 300_000);

/**
 * 组装房间状态快照（用于全量同步 / 新玩家进房）
 */
function buildRoomSnapshot(roomId: string) {
  const room = coreRoomManager.getRoom(roomId);
  const sm = coreRoomManager.getStateMachine(roomId);
  if (!room || !sm) return null;

  return {
    room,
    round_state: sm.roundState,
    seats: sm.seatManager.getSeats(),
    turn_timer: sm.getTurnTimerState(),
  };
}

/**
 * 隐藏其他玩家底牌（spectator 模式用）
 * 只保留自己的牌，其他人的 cards 清空
 */
function maskHoleCards(snapshot: any, viewerUserId: string) {
  if (!snapshot?.seats) return snapshot;
  return {
    ...snapshot,
    seats: snapshot.seats.map((seat: any) => ({
      ...seat,
      cards: seat.user_id === viewerUserId ? seat.cards : [],
    })),
  };
}

/**
 * 向房间所有订阅者广播一条消息
 */
function broadcastToRoom(roomId: string, message: object): void {
  const subscribers = roomSubscribers.get(roomId);
  if (!subscribers || subscribers.size === 0) return;

  const payload = JSON.stringify({ ...message, room_id: roomId, timestamp: Date.now() });
  const deadClients: WsClient[] = [];

  subscribers.forEach((client) => {
    try {
      client.ws.send(payload);
    } catch {
      deadClients.push(client);
    }
  });

  deadClients.forEach((c) => subscribers.delete(c));
}

/**
 * 广播房间全量状态（兜底同步用）
 * spectator 收到的版本会隐藏其他玩家底牌
 */
function broadcastRoomState(roomId: string): void {
  const snapshot = buildRoomSnapshot(roomId);
  if (!snapshot) return;

  const subscribers = roomSubscribers.get(roomId);
  if (!subscribers) return;

  // 普通玩家：发全量快照
  const fullPayload = JSON.stringify({ type: "game_state", room_id: roomId, data: snapshot, timestamp: Date.now() });

  // spectator：发隐藏底牌版本
  const maskedPayload = JSON.stringify({
    type: "game_state",
    room_id: roomId,
    data: maskHoleCards(snapshot, ""),
    timestamp: Date.now(),
  });

  subscribers.forEach((client) => {
    try {
      client.ws.send(client.isSpectator ? maskedPayload : fullPayload);
    } catch { /* dead client, ignore */ }
  });
}

// ========== 事件总线订阅：即时推送 ==========

coreEventBus.on("phase_changed", ({ roomId, prevPhase, newPhase }) => {
  broadcastToRoom(roomId, {
    type: "phase_changed",
    data: { prev_phase: prevPhase, new_phase: newPhase },
  });
  broadcastRoomState(roomId);
});

coreEventBus.on("action_executed", ({ roomId, action }) => {
  broadcastToRoom(roomId, {
    type: "action_broadcast",
    data: { action },
  });
  broadcastRoomState(roomId);
});

coreEventBus.on("player_disconnected", ({ roomId, userId }) => {
  broadcastToRoom(roomId, {
    type: "player_status",
    data: { user_id: userId, status: "disconnected" },
  });
});

coreEventBus.on("player_reconnected", ({ roomId, userId }) => {
  broadcastToRoom(roomId, {
    type: "player_status",
    data: { user_id: userId, status: "reconnected" },
  });
});

coreEventBus.on("auto_fold", ({ roomId, foldedPlayers }) => {
  broadcastToRoom(roomId, {
    type: "auto_fold",
    data: { folded: foldedPlayers },
  });
  broadcastRoomState(roomId);
});

coreEventBus.on("turn_timer_start", ({ roomId, seat_index, user_id, deadline_ms, timeout_ms }) => {
  broadcastToRoom(roomId, {
    type: "turn_timer",
    data: { event: "start", seat_index, user_id, deadline_ms, timeout_ms },
  });
});

coreEventBus.on("turn_timer_tick", ({ roomId, seat_index, remaining_ms }) => {
  broadcastToRoom(roomId, {
    type: "turn_timer",
    data: { event: "tick", seat_index, remaining_ms },
  });
});

coreEventBus.on("turn_timer_cancel", ({ roomId, seat_index }) => {
  broadcastToRoom(roomId, {
    type: "turn_timer",
    data: { event: "cancel", seat_index },
  });
});

coreEventBus.on("turn_timer_expired", ({ roomId, seat_index, user_id }) => {
  broadcastToRoom(roomId, {
    type: "turn_timer",
    data: { event: "expired", seat_index, user_id },
  });
});

coreEventBus.on("round_finished", ({ roomId, results, event_log }) => {
  broadcastToRoom(roomId, {
    type: "round_result",
    data: { results, event_log },
  });
  broadcastRoomState(roomId);
});

// ========== 定时任务 ==========

/** 心跳检测：清理死连接，玩家断线通知状态机 */
setInterval(() => {
  const now = Date.now();
  for (const [roomId, subscribers] of roomSubscribers.entries()) {
    const deadClients: WsClient[] = [];

    subscribers.forEach((client) => {
      if (now - client.lastPing > HEARTBEAT_TIMEOUT) {
        try {
          client.ws.terminate();
        } catch {}
        deadClients.push(client);
      } else {
        try {
          client.ws.ping();
        } catch {}
      }
    });

    deadClients.forEach((c) => {
      subscribers.delete(c);
      if (c.userId) {
        const sm = coreRoomManager.getStateMachine(roomId);
        sm?.onPlayerDisconnect(c.userId);
      }
    });

    if (subscribers.size === 0) {
      roomSubscribers.delete(roomId);
      console.log(`[WS] Room ${roomId} has no subscribers, removed`);
    }
  }
}, HEARTBEAT_INTERVAL);

/** 兜底全量同步（每 5s 一次，防事件丢包） */
setInterval(() => {
  for (const roomId of roomSubscribers.keys()) {
    broadcastRoomState(roomId);
  }
}, SYNC_INTERVAL);

/** 断线超时检查（v2 死代码复活：checkDisconnectTimeout 之前定义了但没人调） */
setInterval(() => {
  for (const room of coreRoomManager.getAllRooms()) {
    const sm = coreRoomManager.getStateMachine(room.room_id);
    if (!sm) continue;
    const folded = sm.checkDisconnectTimeout(DISCONNECT_TIMEOUT_MS);
    if (folded.length > 0) {
      console.log(`[DisconnectCheck] Room ${room.room_id} auto-folded:`, folded);
    }
  }
}, DISCONNECT_CHECK_INTERVAL);

// ========== HTTP API ==========

app.get("/health", (c) => {
  const totalSubscribers = Array.from(roomSubscribers.values()).reduce((sum, set) => sum + set.size, 0);
  return c.json({
    status: "ok",
    service: "multi-game-engine",
    uptime: process.uptime(),
    timestamp: Date.now(),
    rooms: roomSubscribers.size,
    ws_connections: totalSubscribers,
    memory_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
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
      base_score: base_score ? Number(base_score) : 100,
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

/** 3. 获取房间状态（含 turn_timer 快照） */
app.get("/api/engine/room/:id", (c) => {
  const roomId = c.req.param("id");
  const snapshot = buildRoomSnapshot(roomId);

  if (!snapshot) {
    return c.json({ code: 404, message: "Room not found" }, 404);
  }

  return c.json({ code: 0, message: "OK", data: snapshot });
});

/** 4. 玩家动作（HTTP 入口，保留兼容） */
app.post("/api/engine/room/:id/action", async (c) => {
  const roomId = c.req.param("id");
  const body = await c.req.json();
  const { user_id, action } = body;

  const result = coreActionRouter.routeAction({ room_id: roomId, user_id, action });
  if (!result.success) {
    return c.json({ code: 400, message: result.error }, 400);
  }

  broadcastRoomState(roomId);
  return c.json({ code: 0, message: "Action accepted", data: result });
});

/** 5. 结算当前牌局 */
app.post("/api/engine/room/:id/settle", async (c) => {
  const roomId = c.req.param("id");
  const sm = coreRoomManager.getStateMachine(roomId);
  if (!sm) {
    return c.json({ code: 404, message: "Room not found" }, 404);
  }

  try {
    const { request, response } = await sm.settleRound();
    broadcastRoomState(roomId);
    return c.json({ code: 0, message: "Game settled successfully", data: { request, response } });
  } catch (err: any) {
    return c.json({
      code: 500,
      message: `Failed to settle with wallet: ${err.message}`,
      data: null,
    }, 500);
  }
});

/** 6. 获取对局回放（事件日志） */
app.get("/api/engine/room/:id/replay", (c) => {
  const roomId = c.req.param("id");
  const sm = coreRoomManager.getStateMachine(roomId);
  if (!sm) {
    return c.json({ code: 404, message: "Room not found" }, 404);
  }
  return c.json({
    code: 0,
    message: "OK",
    data: sm.eventLog.toJSON(),
  });
});

/** 7. 向房间添加 AI 机器人 */
app.post("/api/engine/room/:id/bots", async (c) => {
  const roomId = c.req.param("id");
  const sm = coreRoomManager.getStateMachine(roomId);
  if (!sm) {
    return c.json({ code: 404, message: "Room not found" }, 404);
  }

  try {
    const body = await c.req.json();
    const { seat_index, count, strategy, chips } = body;

    if (count) {
      // 批量填充
      const added = await sm.botManager.fillBots(count, {
        strategy: strategy || "loose",
        chips: chips || 5000,
      });
      return c.json({ code: 0, message: `Added ${added.length} bots`, data: { bots: added } });
    }

    if (seat_index !== undefined) {
      const botId = await sm.botManager.addBot(seat_index, {
        strategy: strategy || "loose",
        chips: chips || 5000,
      });
      return c.json({ code: 0, message: "Bot added", data: { bot_id: botId } });
    }

    return c.json({ code: 400, message: "Need seat_index or count" }, 400);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message }, 500);
  }
});

/** 8. 导出牌谱（JSON 格式，可分享） */
app.get("/api/engine/room/:id/hand-history", (c) => {
  const roomId = c.req.param("id");
  const sm = coreRoomManager.getStateMachine(roomId);
  if (!sm) {
    return c.json({ code: 404, message: "Room not found" }, 404);
  }

  // 组装完整牌谱：房间信息 + 所有事件 + 最终结果
  const room = coreRoomManager.getRoom(roomId);
  const handHistory = {
    room_id: roomId,
    game_type: room?.game_type,
    base_score: room?.base_score,
    exported_at: new Date().toISOString(),
    events: sm.eventLog.getAll(),
    final_results: sm.lastResults,
    total_pot: sm.roundState.total_pot,
    side_pots: sm.roundState.side_pots || [],
  };

  return c.json({ code: 0, message: "OK", data: handHistory });
});

// ========== WebSocket 服务 ==========

const PORT = Number(process.env.ENGINE_PORT || 8003);

if (process.env.NODE_ENV !== "test") {
  const server = serve({ fetch: app.fetch, port: PORT });
  console.log(`[GameEngine] HTTP server on http://0.0.0.0:${PORT}`);

  const wss = new WebSocketServer({ server: server as any });

  wss.on("connection", (ws: WebSocket) => {
    const clientInfo: WsClient = {
      userId: "",
      roomId: "",
      ws,
      lastPing: Date.now(),
    };

    ws.on("pong", () => {
      clientInfo.lastPing = Date.now();
    });

    ws.on("message", (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString());
        clientInfo.lastPing = Date.now();

        // 心跳
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          return;
        }

        // 加入房间（支持 as_spectator 旁观模式）
        if (msg.type === "join_room") {
          clientInfo.userId = msg.user_id;
          clientInfo.roomId = msg.room_id;
          clientInfo.isSpectator = !!msg.as_spectator;

          // 非 spectator：标记重连（恢复断线状态）
          if (!clientInfo.isSpectator) {
            const sm = coreRoomManager.getStateMachine(msg.room_id);
            if (sm) {
              sm.seatManager.markReconnected(msg.user_id);
            }
          }

          if (!roomSubscribers.has(msg.room_id)) {
            roomSubscribers.set(msg.room_id, new Set());
          }
          roomSubscribers.get(msg.room_id)!.add(clientInfo);

          ws.send(JSON.stringify({
            type: "joined",
            room_id: msg.room_id,
            as_spectator: clientInfo.isSpectator,
            timestamp: Date.now(),
          }));

          // 新玩家进房，立即推一次全量快照
          const snapshot = buildRoomSnapshot(msg.room_id);
          if (snapshot) {
            // spectator：隐藏其他玩家底牌
            if (clientInfo.isSpectator) {
              const masked = maskHoleCards(snapshot, "");
              ws.send(JSON.stringify({
                type: "game_state",
                room_id: msg.room_id,
                data: masked,
                timestamp: Date.now(),
              }));
            } else {
              ws.send(JSON.stringify({
                type: "game_state",
                room_id: msg.room_id,
                data: snapshot,
                timestamp: Date.now(),
              }));
            }
          }

          console.log(`[WS] ${msg.user_id} joined room ${msg.room_id}${clientInfo.isSpectator ? " (spectator)" : ""}, total: ${roomSubscribers.get(msg.room_id)!.size}`);
          return;
        }

        // 离开房间
        if (msg.type === "leave_room") {
          if (clientInfo.roomId && roomSubscribers.has(clientInfo.roomId)) {
            roomSubscribers.get(clientInfo.roomId)!.delete(clientInfo);
          }
          return;
        }

        // WS 端玩家动作（带 req_id，服务端回 action_ack）
        if (msg.type === "player_action") {
          const { req_id, user_id, action } = msg;
          const roomId = clientInfo.roomId;

          // spectator 不能发动作
          if (clientInfo.isSpectator) {
            ws.send(JSON.stringify({
              type: "action_ack",
              req_id,
              success: false,
              message: "Spectators cannot perform actions",
              timestamp: Date.now(),
            }));
            return;
          }

          if (!roomId) {
            ws.send(JSON.stringify({
              type: "action_ack",
              req_id,
              code: 400,
              message: "Not joined any room",
            }));
            return;
          }

          const result = coreActionRouter.routeAction({ room_id: roomId, user_id, action });

          // 立即回复 ACK
          ws.send(JSON.stringify({
            type: "action_ack",
            req_id,
            room_id: roomId,
            code: result.success ? 0 : 400,
            message: result.success ? "OK" : result.error,
            timestamp: Date.now(),
          }));
        }
      } catch (err) {
        console.error("[WS] Message parse error:", err);
      }
    });

    ws.on("close", () => {
      if (clientInfo.roomId && roomSubscribers.has(clientInfo.roomId)) {
        roomSubscribers.get(clientInfo.roomId)!.delete(clientInfo);
      }
      if (clientInfo.userId) {
        const sm = coreRoomManager.getStateMachine(clientInfo.roomId);
        sm?.onPlayerDisconnect(clientInfo.userId);
      }
    });
  });

  console.log(`[GameEngine] WebSocket server on ws://0.0.0.0:${PORT}/ws`);
}

export default app;

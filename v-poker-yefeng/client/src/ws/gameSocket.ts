/**
 * 游戏引擎客户端
 * HTTP API：发动作、创建房间、结算
 * WebSocket：实时接收房间状态推送
 *
 * v2 升级：
 *  - 服务端事件驱动推送（action_ack / turn_timer / player_status / auto_fold / phase_changed / round_result）
 *  - 支持通过 WS 发动作（带 req_id，等 action_ack 确认）
 *  - 事件回调可订阅（turn_timer / action_ack / notifications）
 */

import { config } from "../config";

// 房间状态类型
export interface RoomState {
  room: any;
  round_state: any;
  seats: any[];
  community_cards?: string[];
  turn_timer?: {
    seat_index: number | null;
    user_id: string | null;
    deadline_ms: number | null;
    remaining_ms: number | null;
  };
}

// 动作类型
export type ActionType =
  | "fold" | "check" | "call" | "raise" | "all_in"
  | "ready" | "view_cards" | "compare" | "bet";

export interface GameAction {
  action_type: ActionType;
  user_id: string;
  amount?: number;
  multiplier?: number;
}

// WebSocket 消息类型
interface WsMessage {
  type: string;
  room_id?: string;
  data?: any;
  timestamp?: number;
  req_id?: string;
  code?: number;
  message?: string;
}

// 回调类型
type StateUpdateCallback = (state: RoomState) => void;
type TurnTimerCallback = (info: {
  event: "start" | "tick" | "cancel" | "expired";
  seat_index: number;
  user_id?: string;
  deadline_ms?: number;
  remaining_ms?: number;
  timeout_ms?: number;
}) => void;
type ActionAckCallback = (ack: { reqId: string; success: boolean; message: string }) => void;
type NotificationCallback = (n: { type: "info" | "success" | "error" | "auto_fold"; message: string }) => void;

// 动作请求等待队列
interface PendingAction {
  reqId: string;
  resolve: (ack: { success: boolean; message: string }) => void;
  timer: ReturnType<typeof setTimeout>;
}

class GameClient {
  private baseUrl: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private stateCallbacks: Set<StateUpdateCallback> = new Set();
  private turnTimerCallbacks: Set<TurnTimerCallback> = new Set();
  private actionAckCallbacks: Set<ActionAckCallback> = new Set();
  private notificationCallbacks: Set<NotificationCallback> = new Set();
  private currentRoom: string = "";
  private currentUser: string = "";
  private pendingActions: Map<string, PendingAction> = new Map();
  private reqCounter: number = 0;

  constructor() {
    this.baseUrl = config.gameEngineHttp;
    this.wsUrl = config.gameEngineHttp.replace("http://", "ws://").replace("https://", "wss://");
  }

  /**
   * 连接 WebSocket 并加入房间
   */
  connect(roomId: string, userId: string, asSpectator = false) {
    this.currentRoom = roomId;
    this.currentUser = userId;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "join_room",
        room_id: roomId,
        user_id: userId,
        as_spectator: asSpectator,
      }));
      return;
    }

    this.ws = new WebSocket(`${this.wsUrl}/ws`);

    this.ws.onopen = () => {
      console.log("[WS] Connected to game engine");
      this.reconnectAttempts = 0;
      this.ws?.send(JSON.stringify({
        type: "join_room",
        room_id: roomId,
        user_id: userId,
        as_spectator: asSpectator,
      }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);
        this.handleWsMessage(msg);
      } catch (err) {
        console.error("[WS] Parse error:", err);
      }
    };

    this.ws.onclose = () => {
      console.log("[WS] Disconnected, reconnecting...");
      this.attemptReconnect();
    };

    this.ws.onerror = (err) => {
      console.error("[WS] Error:", err);
    };
  }

  /**
   * 处理服务端推送的各类消息
   */
  private handleWsMessage(msg: WsMessage) {
    // 房间状态全量同步
    if (msg.type === "game_state" && msg.data) {
      this.stateCallbacks.forEach((cb) => cb(msg.data));
      return;
    }

    // 回合倒计时事件
    if (msg.type === "turn_timer" && msg.data) {
      this.turnTimerCallbacks.forEach((cb) => cb(msg.data));
      return;
    }

    // 动作 ACK
    if (msg.type === "action_ack") {
      const reqId = msg.req_id || "";
      const pending = this.pendingActions.get(reqId);
      const ack = {
        reqId,
        success: msg.code === 0,
        message: msg.message || "",
      };

      // 通知等待的 Promise
      if (pending) {
        clearTimeout(pending.timer);
        pending.resolve(ack);
        this.pendingActions.delete(reqId);
      }

      this.actionAckCallbacks.forEach((cb) => cb(ack));
      return;
    }

    // 玩家状态变更（断线/重连）
    if (msg.type === "player_status" && msg.data) {
      const status = msg.data.status === "disconnected" ? "断线" : "重连";
      this.notificationCallbacks.forEach((cb) =>
        cb({ type: "info", message: `${msg.data.user_id} ${status}` })
      );
      return;
    }

    // 自动弃牌通知
    if (msg.type === "auto_fold" && msg.data) {
      const folded = msg.data.folded || [];
      this.notificationCallbacks.forEach((cb) =>
        cb({ type: "auto_fold", message: `超时自动弃牌: ${folded.map((f: any) => f.userId).join(", ")}` })
      );
      return;
    }

    // 阶段切换
    if (msg.type === "phase_changed" && msg.data) {
      this.notificationCallbacks.forEach((cb) =>
        cb({ type: "info", message: `阶段: ${msg.data.new_phase}` })
      );
      return;
    }

    // 一局结束
    if (msg.type === "round_result" && msg.data) {
      this.notificationCallbacks.forEach((cb) =>
        cb({ type: "success", message: "本局结束" })
      );
      return;
    }

    // pong
    if (msg.type === "pong") return;
    if (msg.type === "joined") return;
  }

  /**
   * 通过 WS 发送动作（带 req_id，等 action_ack）
   * 比 HTTP /action 更快，且有确认
   */
  sendAction(action: GameAction, timeoutMs: number = 5000): Promise<{ success: boolean; message: string }> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        // WS 没连上，降级到 HTTP
        return this.httpFallbackAction(action).then(resolve).catch(reject);
      }

      const reqId = `act_${++this.reqCounter}_${Date.now()}`;
      const timer = setTimeout(() => {
        this.pendingActions.delete(reqId);
        reject(new Error("Action ack timeout"));
      }, timeoutMs);

      this.pendingActions.set(reqId, { reqId, resolve, timer });

      this.ws.send(JSON.stringify({
        type: "player_action",
        req_id: reqId,
        user_id: action.user_id,
        action: action,
      }));
    });
  }

  /** HTTP 降级（WS 不可用时） */
  private async httpFallbackAction(action: GameAction): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`${this.baseUrl}/api/engine/room/${this.currentRoom}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: action.user_id,
        action: action,
      }),
    });
    const data = await res.json();
    return { success: data.code === 0, message: data.message || "" };
  }

  /** 自动重连（指数退避：1s→2s→4s→8s→16s→最大30s） */
  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[WS] Max reconnect attempts reached");
      return;
    }
    this.reconnectAttempts++;
    // 指数退避，最大 30 秒
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
    setTimeout(() => {
      if (this.currentRoom && this.currentUser) {
        console.log(`[WS] Reconnecting... attempt ${this.reconnectAttempts}, delay ${delay}ms`);
        this.connect(this.currentRoom, this.currentUser);
      }
    }, delay);
  }

  /** 断开连接 */
  disconnect() {
    if (this.ws) {
      this.ws.send(JSON.stringify({
        type: "leave_room",
        room_id: this.currentRoom
      }));
      this.ws.close();
      this.ws = null;
    }
    this.stateCallbacks.clear();
    this.turnTimerCallbacks.clear();
    this.actionAckCallbacks.clear();
    this.notificationCallbacks.clear();
    // 清理未完成的动作请求
    this.pendingActions.forEach((p) => {
      clearTimeout(p.timer);
      p.resolve({ success: false, message: "disconnected" });
    });
    this.pendingActions.clear();
  }

  // ========== 订阅接口 ==========

  onStateUpdate(callback: StateUpdateCallback) {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  onTurnTimer(callback: TurnTimerCallback) {
    this.turnTimerCallbacks.add(callback);
    return () => this.turnTimerCallbacks.delete(callback);
  }

  onActionAck(callback: ActionAckCallback) {
    this.actionAckCallbacks.add(callback);
    return () => this.actionAckCallbacks.delete(callback);
  }

  onNotification(callback: NotificationCallback) {
    this.notificationCallbacks.add(callback);
    return () => this.notificationCallbacks.delete(callback);
  }

  // ========== HTTP API 保留 ==========

  async createRoom(roomId: string, gameType: string = "texas_holdem", mode: string = "fixed", baseScore: number = 100) {
    const res = await fetch(`${this.baseUrl}/api/engine/room/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room_id: roomId,
        game_type: gameType,
        mode,
        base_score: baseScore
      })
    });
    return res.json();
  }

  async getRooms() {
    const res = await fetch(`${this.baseUrl}/api/engine/rooms`);
    return res.json();
  }

  async getRoomState(roomId: string): Promise<RoomState | null> {
    const res = await fetch(`${this.baseUrl}/api/engine/room/${roomId}`);
    const data = await res.json();
    if (data.code !== 0) return null;
    return data.data;
  }

  /** 执行玩家动作（HTTP，保留兼容） */
  async performAction(roomId: string, userId: string, action: GameAction) {
    const res = await fetch(`${this.baseUrl}/api/engine/room/${roomId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        action: action,
      })
    });
    return res.json();
  }

  async settleRound(roomId: string) {
    const res = await fetch(`${this.baseUrl}/api/engine/room/${roomId}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    return res.json();
  }
}

export const gameClient = new GameClient();

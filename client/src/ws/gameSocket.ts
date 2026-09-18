/**
 * 游戏引擎客户端
 * HTTP API：发动作、创建房间、结算
 * WebSocket：实时接收房间状态推送
 * 支持 500+ 并发连接
 */
import { config } from "../config";

// 房间状态类型
export interface RoomState {
  room: any;
  round_state: any;
  seats: any[];
  community_cards?: string[];
}

// 动作类型
export type ActionType =
  | "fold" | "check" | "call" | "raise" | "all_in"
  | "ready" | "view_cards" | "compare";

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
}

type StateUpdateCallback = (state: RoomState) => void;

class GameClient {
  private baseUrl: string;
  private wsUrl: string;
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private stateCallbacks: Set<StateUpdateCallback> = new Set();
  private currentRoom: string = "";
  private currentUser: string = "";

  constructor() {
    this.baseUrl = config.gameEngineHttp;
    // 把 http:// 换成 ws://
    this.wsUrl = config.gameEngineHttp.replace("http://", "ws://").replace("https://", "wss://");
  }

  /**
   * 连接 WebSocket 并加入房间
   */
  connect(roomId: string, userId: string) {
    this.currentRoom = roomId;
    this.currentUser = userId;

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: "join_room",
        room_id: roomId,
        user_id: userId
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
        user_id: userId
      }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: WsMessage = JSON.parse(event.data);

        if (msg.type === "game_state" && msg.data) {
          // 通知所有订阅者
          this.stateCallbacks.forEach((cb) => cb(msg.data));
        }
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
   * 自动重连
   */
  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("[WS] Max reconnect attempts reached");
      return;
    }

    this.reconnectAttempts++;
    setTimeout(() => {
      if (this.currentRoom && this.currentUser) {
        console.log(`[WS] Reconnecting... attempt ${this.reconnectAttempts}`);
        this.connect(this.currentRoom, this.currentUser);
      }
    }, this.reconnectDelay * this.reconnectAttempts);
  }

  /**
   * 断开连接
   */
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
  }

  /**
   * 订阅房间状态更新
   */
  onStateUpdate(callback: StateUpdateCallback) {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  /** 创建房间 */
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

  /** 获取房间列表 */
  async getRooms() {
    const res = await fetch(`${this.baseUrl}/api/engine/rooms`);
    return res.json();
  }

  /** 获取房间状态（HTTP 降级，首次加载用） */
  async getRoomState(roomId: string): Promise<RoomState | null> {
    const res = await fetch(`${this.baseUrl}/api/engine/room/${roomId}`);
    const data = await res.json();
    if (data.code !== 0) return null;
    return data.data;
  }

  /** 执行玩家动作（HTTP，因为是触发动作，不需要 WS） */
  async performAction(roomId: string, userId: string, action: GameAction) {
    const res = await fetch(`${this.baseUrl}/api/engine/room/${roomId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: userId,
        action: { ...action, user_id: userId }
      })
    });
    return res.json();
  }

  /** 结算牌局 */
  async settleRound(roomId: string) {
    const res = await fetch(`${this.baseUrl}/api/engine/room/${roomId}/settle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    return res.json();
  }
}

export const gameClient = new GameClient();

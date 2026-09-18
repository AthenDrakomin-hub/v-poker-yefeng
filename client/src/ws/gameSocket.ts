/**
 * 游戏引擎客户端（预览/演示版：HTTP 轮询，不用 WebSocket）
 * 生产 main 分支仍用 WebSocket；本分支为免费 PaaS 演示用。
 */
import { config } from "../config";

export interface RoomState {
  room: any;
  round_state: any;
  seats: any[];
  community_cards?: string[];
}

export type ActionType =
  | "fold" | "check" | "call" | "raise" | "all_in"
  | "ready" | "view_cards" | "compare";

export interface GameAction {
  action_type: ActionType;
  user_id: string;
  amount?: number;
  multiplier?: number;
}

type StateUpdateCallback = (state: RoomState) => void;

class GameClient {
  private baseUrl: string;
  private pollTimer: any = null;
  private stateCallbacks: Set<StateUpdateCallback> = new Set();
  private currentRoom: string = "";
  private pollIntervalMs = 1500;

  constructor() {
    this.baseUrl = config.gameEngineHttp;
  }

  /** 连接（演示版：启动 HTTP 轮询） */
  connect(roomId: string, _userId: string) {
    this.currentRoom = roomId;
    this.startPolling();
  }

  private startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(async () => {
      if (!this.currentRoom) return;
      try {
        const state = await this.getRoomState(this.currentRoom);
        if (state) this.stateCallbacks.forEach((cb) => cb(state));
      } catch (err) {
        // 演示版静默忽略轮询错误
      }
    }, this.pollIntervalMs);
  }

  private stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** 断开（停止轮询） */
  disconnect() {
    this.stopPolling();
    this.currentRoom = "";
    this.stateCallbacks.clear();
  }

  onStateUpdate(callback: StateUpdateCallback) {
    this.stateCallbacks.add(callback);
    return () => this.stateCallbacks.delete(callback);
  }

  /** 创建房间 */
  async createRoom(roomId: string, gameType: string = "texas_holdem", mode: string = "fixed", baseScore: number = 100) {
    const res = await fetch(`${this.baseUrl}/api/engine/room/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room_id: roomId, game_type: gameType, mode, base_score: baseScore })
    });
    return res.json();
  }

  /** 获取房间列表 */
  async getRooms() {
    const res = await fetch(`${this.baseUrl}/api/engine/rooms`);
    return res.json();
  }

  /** 获取房间状态（HTTP） */
  async getRoomState(roomId: string): Promise<RoomState | null> {
    const res = await fetch(`${this.baseUrl}/api/engine/room/${roomId}`);
    const data = await res.json();
    if (data.code !== 0) return null;
    return data.data;
  }

  /** 执行玩家动作 */
  async performAction(roomId: string, userId: string, action: GameAction) {
    const res = await fetch(`${this.baseUrl}/api/engine/room/${roomId}/action`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, action: { ...action, user_id: userId } })
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

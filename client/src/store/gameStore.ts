/**
 * 游戏状态 Store (Zustand)
 * 统一管理：当前房间状态、WS 连接状态、回合倒计时
 * 替代组件里散落的 useState + 手动订阅 gameSocket
 */

import { create } from "zustand";
import { gameClient, type RoomState } from "../ws/gameSocket";

export interface TurnTimerInfo {
  seat_index: number | null;
  user_id: string | null;
  deadline_ms: number | null;
  remaining_ms: number | null;
  event: "idle" | "start" | "tick" | "cancel" | "expired";
}

export interface GameNotification {
  id: number;
  type: "info" | "success" | "error" | "auto_fold";
  message: string;
}

interface GameState {
  roomState: RoomState | null;
  isConnected: boolean;
  turnTimer: TurnTimerInfo;
  notifications: GameNotification[];
  lastActionAck: { reqId: string; success: boolean; message: string; ts: number } | null;

  // actions
  connectRoom: (roomId: string, userId: string) => void;
  disconnectRoom: () => void;
  setRoomState: (state: RoomState) => void;
  setConnected: (connected: boolean) => void;
  updateTurnTimer: (info: Partial<TurnTimerInfo>) => void;
  pushNotification: (n: Omit<GameNotification, "id">) => void;
  removeNotification: (id: number) => void;
  setActionAck: (ack: { reqId: string; success: boolean; message: string }) => void;
  clearRoom: () => void;
}

let notifId = 0;

export const useGameStore = create<GameState>((set, get) => ({
  roomState: null,
  isConnected: false,
  turnTimer: { seat_index: null, user_id: null, deadline_ms: null, remaining_ms: null, event: "idle" },
  notifications: [],
  lastActionAck: null,

  connectRoom: (roomId, userId) => {
    gameClient.connect(roomId, userId);
    set({ isConnected: true });
  },

  disconnectRoom: () => {
    gameClient.disconnect();
    set({
      isConnected: false,
      roomState: null,
      turnTimer: { seat_index: null, user_id: null, deadline_ms: null, remaining_ms: null, event: "idle" },
    });
  },

  setRoomState: (state) => set({ roomState: state }),

  setConnected: (connected) => set({ isConnected: connected }),

  updateTurnTimer: (info) =>
    set((s) => ({ turnTimer: { ...s.turnTimer, ...info } })),

  pushNotification: (n) => {
    const id = ++notifId;
    set((s) => ({ notifications: [...s.notifications, { ...n, id }] }));
    // 3 秒后自动移除
    setTimeout(() => get().removeNotification(id), 3000);
  },

  removeNotification: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),

  setActionAck: (ack) =>
    set({ lastActionAck: { ...ack, ts: Date.now() } }),

  clearRoom: () =>
    set({
      roomState: null,
      turnTimer: { seat_index: null, user_id: null, deadline_ms: null, remaining_ms: null, event: "idle" },
    }),
}));

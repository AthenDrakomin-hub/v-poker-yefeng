/**
 * 平台核心动作路由器 (ActionRouter)
 * 将客户端发起的 WebSocket 指令安全分发给对应的房间状态机与插件
 * P0: 房间级互斥锁，防止并发action竞态
 */

import { GameAction } from "../shared/types.js";
import { coreRoomManager } from "./roomManager.js";

export interface ActionEnvelope {
  room_id: string;
  user_id: string;
  action: GameAction;
}

/** 房间级锁：同一房间同时只处理一个动作 */
const roomLocks = new Map<string, Promise<void>>();

async function withRoomLock<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
  const prev = roomLocks.get(roomId) || Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => { release = r; });
  roomLocks.set(roomId, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (roomLocks.get(roomId) === next) roomLocks.delete(roomId);
  }
}

export class ActionRouter {
  public async routeAction(envelope: ActionEnvelope): Promise<{ success: boolean; error?: string; newPhase?: string }> {
    const stateMachine = coreRoomManager.getStateMachine(envelope.room_id);
    if (!stateMachine) {
      return { success: false, error: `Room '${envelope.room_id}' not found.` };
    }

    const { action } = envelope;
    action.user_id = envelope.user_id;

    // 特殊流程控制动作
    if (action.action_type === "ready") {
      const seat = stateMachine.seatManager.findUserSeat(envelope.user_id);
      if (!seat) return { success: false, error: "Player not seated." };
      // P0 修复：只在牌局未开始时(WAITING)才覆写状态为 ready
      if (stateMachine.getPhase() === "WAITING") {
        seat.status = "ready";
      }
      return { success: true };
    }

    // 规则插件执行动作（带房间锁，await下注扣款）
    return withRoomLock(envelope.room_id, async () => {
      const res = await stateMachine.handleAction(action);
      return {
        ...res,
        newPhase: stateMachine.getPhase()
      };
    });
  }
}

export const coreActionRouter = new ActionRouter();

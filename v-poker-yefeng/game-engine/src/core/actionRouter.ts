/**
 * 平台核心动作路由器 (ActionRouter)
 * 将客户端发起的 WebSocket 指令安全分发给对应的房间状态机与插件
 */

import { GameAction } from "../shared/types.js";
import { coreRoomManager } from "./roomManager.js";

export interface ActionEnvelope {
  room_id: string;
  user_id: string;
  action: GameAction;
}

export class ActionRouter {
  public routeAction(envelope: ActionEnvelope): { success: boolean; error?: string; newPhase?: string } {
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
      // P0 修复：只在牌局未开始时(WAITING)才覆写状态为 ready。
      // 否则当 startRound 已 async 进行中（dealCards 已把座位置为 playing），
      // 迟到的 ready 请求会把 playing 覆写回 ready，导致该玩家被 isPhaseComplete
      // 判定为弃牌，直接跳到 SHOWDOWN 且不发公共牌。
      if (stateMachine.getPhase() === "WAITING") {
        seat.status = "ready";
      }
      return { success: true };
    }

    // 规则插件执行动作
    const res = stateMachine.handleAction(action);
    return {
      ...res,
      newPhase: stateMachine.getPhase()
    };
  }
}

export const coreActionRouter = new ActionRouter();

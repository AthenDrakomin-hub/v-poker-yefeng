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
      seat.status = "ready";
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

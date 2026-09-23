/**
 * 牌局事件日志 (EventLog)
 * 职责：追加记录一局内所有关键事件，局末落库到 game_replays.actions
 * 设计：事件溯源（Event Sourcing）模式——只追加不修改，可从事件流重建牌桌状态
 *
 * 事件类型：
 *  - round_start:  一局开始
 *  - cards_dealt:  发牌
 *  - blind:        大小盲自动下注
 *  - action:       玩家动作（fold/check/call/raise/bet/all_in/...）
 *  - community:    公共牌发出
 *  - phase:        阶段切换
 *  - showdown:     摊牌
 *  - settle:       结算
 *  - auto_fold:    超时自动弃牌
 *  - disconnect:   玩家断线
 *  - reconnect:    玩家重连
 */

import { Card, GameAction, RoundPhase } from "../shared/types.js";

export type GameEventType =
  | "round_start"
  | "cards_dealt"
  | "blind"
  | "action"
  | "community"
  | "phase"
  | "showdown"
  | "settle"
  | "auto_fold"
  | "disconnect"
  | "reconnect";

export interface GameEvent {
  seq: number;               // 局内序号
  ts: number;                 // 毫秒时间戳
  type: GameEventType;
  payload: Record<string, unknown>;
}

export class RoundEventLog {
  private events: GameEvent[] = [];
  private seq: number = 0;
  private roomId: string;
  private gameType: string;
  private roundNo: number;

  constructor(roomId: string, gameType: string, roundNo: number) {
    this.roomId = roomId;
    this.gameType = gameType;
    this.roundNo = roundNo;
  }

  /** 追加事件 */
  push(type: GameEventType, payload: Record<string, unknown> = {}): void {
    this.events.push({
      seq: ++this.seq,
      ts: Date.now(),
      type,
      payload,
    });
  }

  /** 玩家动作事件 */
  logAction(action: GameAction, result?: { success: boolean; error?: string }): void {
    this.push("action", {
      user_id: action.user_id,
      action_type: action.action_type,
      amount: action.amount,
      multiplier: action.multiplier,
      success: result?.success ?? true,
      error: result?.error,
    });
  }

  /** 阶段切换事件 */
  logPhase(prev: RoundPhase, next: RoundPhase): void {
    this.push("phase", { prev, next });
  }

  /** 发牌事件（只记数量，不记具体牌——手牌对其他人不可见） */
  logCardsDealt(players: Array<{ seat_index: number; count: number }>): void {
    this.push("cards_dealt", { players });
  }

  /** 公共牌事件（公开信息，记录具体牌） */
  logCommunity(cards: Card[], street: "flop" | "turn" | "river"): void {
    this.push("community", {
      street,
      cards: cards.map((c) => c.code),
    });
  }

  /** 摊牌事件（记录每个亮牌玩家的牌型） */
  logShowdown(results: Array<{
    user_id: string;
    hand_name: string;
    rank_level: number;
    net_amount: number;
  }>): void {
    this.push("showdown", { results });
  }

  /** 结算事件 */
  logSettle(totalPot: number, winners: string[], sidePots?: Array<{ amount: number }>): void {
    this.push("settle", {
      total_pot: totalPot,
      winners,
      side_pots: sidePots,
    });
  }

  /** 自动弃牌事件 */
  logAutoFold(userId: string, seatIndex: number, reason: string): void {
    this.push("auto_fold", { user_id: userId, seat_index: seatIndex, reason });
  }

  /** 断线/重连事件 */
  logDisconnect(userId: string): void {
    this.push("disconnect", { user_id: userId });
  }

  logReconnect(userId: string): void {
    this.push("reconnect", { user_id: userId });
  }

  /** 获取全部事件 */
  getAll(): GameEvent[] {
    return [...this.events];
  }

  /** 序列化为 JSONB 落库格式 */
  toJSON(): Record<string, unknown> {
    return {
      room_id: this.roomId,
      game_type: this.gameType,
      round_no: this.roundNo,
      events: this.events,
      total: this.events.length,
    };
  }

  clear(): void {
    this.events = [];
    this.seq = 0;
  }
}

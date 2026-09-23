/**
 * 十三水插件 (Thirteen Water / 十三道)
 * 每人13张牌，分三道：
 * - 头道（3张）：最小牌型
 * - 中道（5张）：中等牌型
 * - 尾道（5张）：最大牌型
 * 比牌：各道单独比，三局两胜
 */
import type { GamePlugin } from "../plugin.interface.js";
import type { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Seat } from "../../shared/types.js";
import { createStandardDeck, shuffleDeck } from "../texas_holdem/deck.js";
import { evaluate7Cards } from "../texas_holdem/evaluator.js";

export class ThirteenWaterPlugin implements GamePlugin {
  readonly game_type: GameType = "thirteen_water";
  readonly name = "十三水";
  readonly supported_modes: GameMode[] = ["normal"];

  initDeck(): Card[] {
    return shuffleDeck(createStandardDeck());
  }

  dealCards(state: any): void {
    // 每人发13张
    for (const seat of state.seats) {
      if (seat.status === "empty" || seat.status === "folded") continue;
      seat.hole_cards = state.deck.splice(0, 13);
    }
  }

  handleAction(state: any, action: GameAction): { success: boolean; error?: string } {
    const seatIdx = (action as any).seat_index ?? (action as any).seatIndex;
    const seat = state.seats[seatIdx];
    if (!seat || seat.status === "empty") return { success: false, error: "Invalid seat" };
    seat.has_acted = true;
    return { success: true };
  }

  /** 评估一道牌（3张或5张） */
  private evaluateRow(cards: Card[]) {
    if (cards.length === 3) {
      // 3张：对子/顺子/三条
      const ranks = cards.map(c => c.rank).sort((a, b) => a - b);
      const counts = new Map<number, number>();
      ranks.forEach(r => counts.set(r, (counts.get(r) || 0) + 1));
      const maxCount = Math.max(...counts.values());
      if (maxCount === 3) return { rank_name: "三条", rank_level: 8, score: 800, multiplier: 1 };
      if (maxCount === 2) return { rank_name: "对子", rank_level: 3, score: 300, multiplier: 1 };
      return { rank_name: "高牌", rank_level: 1, score: ranks[2], multiplier: 1 };
    }
    // 5张：用标准评估
    return evaluate7Cards(cards, []);
  }

  evaluateHand(cards: Card[], communityCards?: Card[]) {
    // 十三水返回尾道（最大道）作为主评估
    if (cards.length < 13) return { rank_name: "未分道", rank_level: 0, score: 0, multiplier: 1 };
    const front = this.evaluateRow(cards.slice(0, 3));
    const middle = this.evaluateRow(cards.slice(3, 8));
    const back = this.evaluateRow(cards.slice(8, 13));
    return back; // 返回最大道
  }

  compareHands(state: any) {
    const active = state.seats.filter((s: any) => s.status !== "empty" && s.status !== "folded");
    const rankings = active.map((seat: any) => ({
      user_id: seat.user_id,
      seat_index: seat.seat_index,
      evaluation: this.evaluateHand(seat.hole_cards || []),
    }));
    rankings.sort((a: any, b: any) => b.evaluation.score - a.evaluation.score);
    return { winner_user_ids: [rankings[0].user_id], rankings };
  }

  calculateNetScores(state: any): PlayerNetResult[] {
    const result = this.compareHands(state);
    const winner = result.rankings[0];
    const players = state.seats.filter((s: any) => s.status !== "empty");
    // 十三水：三局两胜，赢家赢3道×底分
    return players.map((seat: any) => ({
      user_id: seat.user_id,
      seat_index: seat.seat_index,
      net_amount: seat.user_id === winner.user_id ? state.total_pot : 0,
    }));
  }

  isPhaseComplete(state: any): boolean {
    return state.seats.every((s: any) => s.has_acted || s.status === "folded" || s.status === "empty");
  }

  getActionSeats(state: any): Seat[] {
    return state.seats.filter((s: any) => s.status !== "empty" && s.status !== "folded") as Seat[];
  }

  getNextPhase(state: any): RoundPhase {
    const order: RoundPhase[] = ["BETTING", "ACTION", "SHOWDOWN", "SETTLING", "FINISHED"];
    const idx = order.indexOf(state.phase);
    if (idx < 0 || idx >= order.length - 1) return "FINISHED";
    return order[idx + 1];
  }
}

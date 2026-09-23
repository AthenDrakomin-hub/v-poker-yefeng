/**
 * 百变双扣 (Double Kong)
 * 两副牌4人结对，类似掼蛋但节奏更快
 * 牌型: 单张/对子/顺子/炸弹/连对
 */
import type { GamePlugin } from "../plugin.interface.js";
import type { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Seat } from "../../shared/types.js";
import { createStandardDeck, shuffleDeck } from "../texas_holdem/deck.js";

export class DoubleKongPlugin implements GamePlugin {
  readonly game_type: GameType = "double_kong";
  readonly name = "百变双扣";
  readonly supported_modes: GameMode[] = ["normal"];

  initDeck(): Card[] {
    const d1 = createStandardDeck();
    const d2 = createStandardDeck();
    return shuffleDeck([...d1, ...d2]);
  }

  dealCards(state: any): void {
    for (const seat of state.seats) {
      if (seat.status === "empty" || seat.status === "folded") continue;
      seat.hole_cards = state.deck.splice(0, 27);
    }
  }

  handleAction(state: any, action: GameAction): { success: boolean; error?: string } {
    const seatIdx = (action as any).seat_index ?? (action as any).seatIndex;
    const seat = state.seats[seatIdx];
    if (!seat || seat.status === "empty") return { success: false, error: "Invalid seat" };
    seat.has_acted = true;
    return { success: true };
  }

  evaluateHand(cards: Card[], communityCards?: Card[]) {
    if (cards.length === 0) return { rank_name: "空", rank_level: 0, score: 0, multiplier: 1 };
    const ranks = cards.map(c => c.rank).sort((a, b) => a - b);
    const counts = new Map<number, number>();
    ranks.forEach(r => counts.set(r, (counts.get(r) || 0) + 1));
    const maxCount = Math.max(...counts.values());
    if (maxCount >= 4) return { rank_name: "炸弹", rank_level: 7, score: 700, multiplier: 2 };
    if (cards.length >= 5 && ranks.every((r, i) => i === 0 || r === ranks[i-1] + 1)) return { rank_name: "顺子", rank_level: 4, score: 400, multiplier: 1 };
    if (cards.length % 2 === 0 && counts.size === cards.length / 2) return { rank_name: "连对", rank_level: 3, score: 300, multiplier: 1 };
    if (cards.length === 2 && counts.size === 1) return { rank_name: "对子", rank_level: 2, score: 200, multiplier: 1 };
    return { rank_name: "单张", rank_level: 1, score: ranks[ranks.length - 1], multiplier: 1 };
  }

  compareHands(state: any) {
    const active = state.seats.filter((s: any) => s.status !== "empty" && s.status !== "folded");
    const rankings = active.map((seat: any) => ({
      user_id: seat.user_id, seat_index: seat.seat_index,
      evaluation: this.evaluateHand(seat.hole_cards || []),
    }));
    rankings.sort((a: any, b: any) => b.evaluation.score - a.evaluation.score);
    return { winner_user_ids: [rankings[0].user_id], rankings };
  }

  calculateNetScores(state: any): PlayerNetResult[] {
    const result = this.compareHands(state);
    const winner = result.rankings[0];
    const players = state.seats.filter((s: any) => s.status !== "empty");
    return players.map((seat: any) => ({
      user_id: seat.user_id, seat_index: seat.seat_index,
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

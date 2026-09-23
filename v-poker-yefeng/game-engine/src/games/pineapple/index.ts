/**
 * 菠萝扑克 (Pineapple / OFC)
 * 逐张发牌，按位置摆放
 * 前三道：上(3张)/中(5张)/下(5张)
 */
import type { GamePlugin } from "../plugin.interface.js";
import type { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Seat } from "../../shared/types.js";
import { createStandardDeck, shuffleDeck } from "../texas_holdem/deck.js";
import { evaluate7Cards } from "../texas_holdem/evaluator.js";

export class PineapplePlugin implements GamePlugin {
  readonly game_type: GameType = "pineapple";
  readonly name = "菠萝扑克";
  readonly supported_modes: GameMode[] = ["normal"];

  initDeck(): Card[] {
    return shuffleDeck(createStandardDeck());
  }

  dealCards(state: any): void {
    // 每人先发5张（OFC开局）
    for (const seat of state.seats) {
      if (seat.status === "empty" || seat.status === "folded") continue;
      seat.hole_cards = state.deck.splice(0, 5);
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
    if (cards.length <= 3) {
      const ranks = cards.map(c => c.rank).sort((a, b) => a - b);
      return { rank_name: "高牌", rank_level: 1, score: ranks[ranks.length - 1], multiplier: 1 };
    }
    return evaluate7Cards(cards, communityCards ?? []);
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

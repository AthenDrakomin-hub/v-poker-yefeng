/**
 * 奥马哈插件 (Omaha)
 * 4张底牌，必选2张 + 3张公共牌组合
 * 与德州扑克区别：必须用2张底牌，不能只用1张
 */
import type { GamePlugin } from "../plugin.interface.js";
import type { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Seat } from "../../shared/types.js";
import { createStandardDeck, shuffleDeck } from "../texas_holdem/deck.js";
import { evaluate7Cards } from "../texas_holdem/evaluator.js";

export class OmahaPlugin implements GamePlugin {
  readonly game_type: GameType = "omaha";
  readonly name = "奥马哈";
  readonly supported_modes: GameMode[] = ["normal"];

  initDeck(): Card[] {
    return shuffleDeck(createStandardDeck());
  }

  dealCards(state: any): void {
    // 每人发4张底牌（德州是2张）
    for (const seat of state.seats) {
      if (seat.status === "empty" || seat.status === "folded") continue;
      seat.hole_cards = [state.deck.pop()!, state.deck.pop()!, state.deck.pop()!, state.deck.pop()!];
    }
  }

  handleAction(state: any, action: GameAction): { success: boolean; error?: string } {
    const seatIdx = (action as any).seat_index ?? (action as any).seatIndex;
    const seat = state.seats[seatIdx];
    if (!seat || seat.status === "empty" || seat.status === "folded") return { success: false, error: "Invalid seat" };
    const amount = action.amount ?? 0;
    switch (action.action_type) {
      case "fold": seat.status = "folded"; seat.has_acted = true; break;
      case "check": seat.has_acted = true; break;
      case "call": {
        const need = state.current_highest_bet - seat.current_bet;
        seat.current_bet += need; state.total_pot += need; seat.has_acted = true; break;
      }
      case "raise":
      case "bet": {
        seat.current_bet += amount; state.total_pot += amount;
        state.current_highest_bet = Math.max(state.current_highest_bet, seat.current_bet);
        seat.has_acted = true; break;
      }
      case "all_in": {
        const allInAmount = seat.chips;
        seat.current_bet += allInAmount; state.total_pot += allInAmount;
        seat.chips = 0; seat.status = "all_in"; seat.has_acted = true; break;
      }
      default: return { success: false, error: "Unknown action" };
    }
    return { success: true };
  }

  /** 奥马哈特殊评估：必须从4张底牌中选2张 + 3张公共牌 */
  evaluateHand(cards: Card[], communityCards?: Card[]) {
    const comm = communityCards ?? [];
    if (cards.length < 4 || comm.length < 3) {
      return evaluate7Cards(cards, comm);
    }
    // 枚举所有 C(4,2) * C(5,3) = 6*10 = 60 种组合
    let best = { rank_name: "", rank_level: 0, score: 0, multiplier: 1 };
    for (let i = 0; i < 4; i++) {
      for (let j = i + 1; j < 4; j++) {
        const hole2 = [cards[i], cards[j]];
        for (let a = 0; a < comm.length; a++) {
          for (let b = a + 1; b < comm.length; b++) {
            for (let c = b + 1; c < comm.length; c++) {
              const comm3 = [comm[a], comm[b], comm[c]];
              const evalResult = evaluate7Cards(hole2, comm3);
              if (evalResult.score > best.score) best = evalResult;
            }
          }
        }
      }
    }
    return best;
  }

  compareHands(state: any) {
    const active = state.seats.filter((s: any) => s.status !== "empty" && s.status !== "folded");
    const rankings = active.map((seat: any) => ({
      user_id: seat.user_id,
      seat_index: seat.seat_index,
      evaluation: this.evaluateHand(seat.hole_cards || [], state.community_cards),
    }));
    rankings.sort((a: any, b: any) => b.evaluation.score - a.evaluation.score);
    return { winner_user_ids: [rankings[0].user_id], rankings };
  }

  calculateNetScores(state: any): PlayerNetResult[] {
    const result = this.compareHands(state);
    const winner = result.rankings[0];
    const players = state.seats.filter((s: any) => s.status !== "empty");
    return players.map((seat: any) => ({
      user_id: seat.user_id,
      seat_index: seat.seat_index,
      net_amount: seat.user_id === winner.user_id ? state.total_pot : 0,
    }));
  }

  isPhaseComplete(state: any): boolean {
    const active = state.seats.filter((s: any) => s.status !== "empty" && s.status !== "folded");
    return active.every((s: any) => s.has_acted);
  }

  getActionSeats(state: any): Seat[] {
    return state.seats.filter((s: any) => s.status !== "empty" && s.status !== "folded" && s.status !== "all_in") as Seat[];
  }

  getNextPhase(state: any): RoundPhase {
    const order: RoundPhase[] = ["BETTING", "ACTION", "SHOWDOWN", "SETTLING", "FINISHED"];
    const idx = order.indexOf(state.phase);
    if (idx < 0 || idx >= order.length - 1) return "FINISHED";
    return order[idx + 1];
  }
}

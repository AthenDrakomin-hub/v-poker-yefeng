/**
 * 短牌德州 (Short Deck / 6+)
 * 去掉2-5，只用6-A（36张牌）
 * 牌型变化：顺子更难，三条大于同花
 */
import type { GamePlugin } from "../plugin.interface.js";
import type { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Seat } from "../../shared/types.js";
import { createStandardDeck, shuffleDeck } from "../texas_holdem/deck.js";
import { evaluate7Cards } from "../texas_holdem/evaluator.js";

export class ShortDeckPlugin implements GamePlugin {
  readonly game_type: GameType = "short_deck";
  readonly name = "短牌德州";
  readonly supported_modes: GameMode[] = ["normal"];

  initDeck(): Card[] {
    // 短牌：去掉2-5，只保留6-A
    const fullDeck = createStandardDeck();
    const shortDeck = fullDeck.filter(c => c.rank >= 6);
    return shuffleDeck(shortDeck);
  }

  dealCards(state: any): void {
    for (const seat of state.seats) {
      if (seat.status === "empty" || seat.status === "folded") continue;
      seat.hole_cards = [state.deck.pop()!, state.deck.pop()!];
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

  evaluateHand(cards: Card[], communityCards?: Card[]) {
    // 短牌规则：三条 > 同花（与德州相反）
    const result = evaluate7Cards(cards, communityCards ?? []);
    // 短牌特殊：三条级别提升
    if (result.rank_level === 4) {
      return { ...result, rank_name: "三条(短牌)", rank_level: 5, score: result.score * 1.2 };
    }
    return result;
  }

  compareHands(state: any) {
    const active = state.seats.filter((s: any) => s.status !== "empty" && s.status !== "folded");
    const rankings = active.map((seat: any) => ({
      user_id: seat.user_id, seat_index: seat.seat_index,
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
      user_id: seat.user_id, seat_index: seat.seat_index,
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

/**
 * 炸弹 (Fight Bomb)
 * 3张牌比大小，使用炸金花评估器
 */
import { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Suit } from "../../shared/types.js";
import { ActionValidation, CompareResult, GamePlugin, HandEvaluation, PluginMeta, PluginRoundState, Seat } from "../plugin.interface.js";
import { evaluateZhaJinHua } from "../zha_jin_hua/evaluator.js";

export class FightBombPlugin implements GamePlugin {
  readonly game_type: GameType = "fight_bomb";
  readonly name = "炸弹";
  readonly supported_modes: GameMode[] = ["compare"];

  readonly meta: PluginMeta = {
    gameId: "fight_bomb", name: "炸弹", cardCount: 3,
    supportSidePot: false, exchangeBased: false, minPlayers: 2, maxSeats: 6,
  };

  validateAction(_state: PluginRoundState, _seat: Seat, _action: any): ActionValidation {
    return { valid: true };
  }

  initDeck(): Card[] {
    const suits: Suit[] = ["S", "H", "C", "D"];
    const deck: Card[] = [];
    for (const suit of suits) for (let rank = 1; rank <= 13; rank++) deck.push({ suit, rank, code: `${suit}-${rank}` });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  dealCards(state: PluginRoundState): void {
    const ante = state.room.base_score;
    const active = state.seats.filter((s) => s.status === "playing" || s.status === "ready");
    for (const seat of active) {
      seat.cards = [];
      seat.status = "playing";
      seat.current_bet = ante;
      state.total_pot += ante;
      for (let i = 0; i < 3; i++) if (state.deck.length > 0) seat.cards.push(state.deck.pop()!);
      seat.hand_result = this.evaluateHand(seat.cards);
    }
    state.current_highest_bet = ante;
    state.min_call_amount = ante;
    state.betting_round_count = 1;
  }

  handleAction(state: PluginRoundState, action: GameAction): { success: boolean; error?: string } {
    const seat = state.seats.find((s) => s.user_id === action.user_id);
    if (!seat) return { success: false, error: "Seat not found." };
    if (seat.status !== "playing") return { success: false, error: "Not playing." };
    if (action.action_type === "fold") { seat.status = "folded"; seat.has_acted = true; return { success: true }; }
    if (action.action_type === "check" || action.action_type === "call") { seat.has_acted = true; return { success: true }; }
    return { success: false, error: `Unknown: ${action.action_type}` };
  }

  evaluateHand(cards: Card[]): HandEvaluation {
    if (cards.length < 3) return { rank_name: "高牌", rank_level: 0, score: 0, multiplier: 1 };
    return evaluateZhaJinHua(cards);
  }

  compareHands(state: PluginRoundState): CompareResult {
    const alive = state.seats.filter((s) => s.status === "playing" && s.cards.length >= 3);
    const rankings = alive.map((s) => ({
      user_id: s.user_id!, seat_index: s.seat_index,
      evaluation: s.hand_result || this.evaluateHand(s.cards),
    }));
    rankings.sort((a, b) => b.evaluation.score - a.evaluation.score);
    return { winner_user_ids: rankings.length > 0 ? [rankings[0].user_id] : [], rankings };
  }

  calculateNetScores(state: PluginRoundState): PlayerNetResult[] {
    const comp = this.compareHands(state);
    const winnerId = comp.winner_user_ids[0];
    const pot = state.total_pot;
    const results: PlayerNetResult[] = [];
    for (const seat of state.seats) {
      if (!seat.user_id || seat.current_bet <= 0) continue;
      results.push({
        user_id: seat.user_id,
        net_amount: seat.user_id === winnerId ? pot - seat.current_bet : -seat.current_bet,
        hand_name: seat.hand_result?.rank_name || "未评估",
      });
    }
    return results;
  }

  getActionSeats(state: PluginRoundState): Seat[] {
    return state.seats.filter((s) => s.status === "playing").sort((a, b) => a.seat_index - b.seat_index);
  }

  isPhaseComplete(state: PluginRoundState): boolean {
    const alive = state.seats.filter((s) => s.status === "playing");
    if (alive.length <= 1) return true;
    return alive.every((s) => s.has_acted);
  }

  getNextPhase(state: PluginRoundState): RoundPhase {
    if (state.phase === "WAITING") return "DEALING";
    if (state.phase === "DEALING") return "BETTING";
    if (state.phase === "BETTING") return "SHOWDOWN";
    if (state.phase === "SHOWDOWN") return "SETTLING";
    if (state.phase === "SETTLING") return "FINISHED";
    return "FINISHED";
  }
}

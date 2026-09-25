/**
 * 简单扑克游戏基类：ante → 发牌 → 单轮下注 → 摊牌 → 结算
 * 各子游戏只需指定发牌数和牌堆
 */
import { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Seat, Suit } from "../shared/types.js";
import { CompareResult, GamePlugin, HandEvaluation, PluginRoundState } from "./plugin.interface.js";

export abstract class BaseSimpleGame implements GamePlugin {
  abstract readonly game_type: GameType;
  abstract readonly name: string;
  readonly supported_modes: GameMode[] = ["normal"];
  protected abstract cardsPerPlayer: number;

  initDeck(): Card[] {
    const suits: Suit[] = ["S", "H", "C", "D"];
    const deck: Card[] = [];
    for (const suit of suits) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({ suit, rank, code: `${suit}-${rank}` });
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  dealCards(state: PluginRoundState): void {
    const ante = state.room.base_score;
    const activeSeats = state.seats.filter((s) => s.status === "playing" || s.status === "ready");
    for (const seat of activeSeats) {
      seat.cards = [];
      for (let i = 0; i < this.cardsPerPlayer; i++) {
        if (state.deck.length > 0) seat.cards.push(state.deck.pop()!);
      }
      seat.status = "playing";
      seat.current_bet = ante;
      state.total_pot += ante;
      seat.hand_result = this.evaluateHand(seat.cards);
    }
    state.current_highest_bet = ante;
    state.min_call_amount = ante;
    state.betting_round_count = 1;
  }

  handleAction(state: PluginRoundState, action: GameAction): { success: boolean; error?: string } {
    const seat = state.seats.find((s) => s.user_id === action.user_id);
    if (!seat) return { success: false, error: "Seat not found." };
    if (seat.status !== "playing") return { success: false, error: "Not in play." };

    if (action.action_type === "fold") {
      seat.status = "folded";
      seat.has_acted = true;
      return { success: true };
    }
    if (action.action_type === "check") {
      seat.has_acted = true;
      return { success: true };
    }
    if (action.action_type === "call") {
      const need = state.current_highest_bet - seat.current_bet;
      if (need > 0) {
        seat.current_bet += need;
        state.total_pot += need;
      }
      seat.has_acted = true;
      return { success: true };
    }
    if (action.action_type === "bet" || action.action_type === "raise") {
      const add = action.amount || state.min_call_amount;
      seat.current_bet += add;
      state.total_pot += add;
      state.current_highest_bet = Math.max(state.current_highest_bet, seat.current_bet);
      seat.has_acted = true;
      return { success: true };
    }
    return { success: false, error: `Unknown action ${action.action_type}` };
  }

  evaluateHand(cards: Card[]): HandEvaluation {
    // 简单评估：最高分牌面
    let maxRank = 0;
    let sum = 0;
    for (const c of cards) {
      maxRank = Math.max(maxRank, c.rank);
      sum += c.rank;
    }
    return {
      rank_name: this.name,
      rank_level: maxRank,
      score: maxRank * 100 + sum,
      multiplier: 1,
    };
  }

  compareHands(state: PluginRoundState): CompareResult {
    const active = state.seats.filter((s) => s.status === "playing" && s.cards.length > 0);
    const rankings = active.map((s) => ({
      user_id: s.user_id!,
      seat_index: s.seat_index,
      evaluation: s.hand_result || this.evaluateHand(s.cards),
    }));
    rankings.sort((a, b) => b.evaluation.score - a.evaluation.score);
    return {
      winner_user_ids: rankings.length > 0 ? [rankings[0].user_id] : [],
      rankings,
    };
  }

  calculateNetScores(state: PluginRoundState): PlayerNetResult[] {
    const comp = this.compareHands(state);
    const winnerId = comp.winner_user_ids[0];
    const totalPot = state.total_pot;
    const results: PlayerNetResult[] = [];
    for (const seat of state.seats) {
      if (!seat.user_id || seat.current_bet <= 0) continue;
      if (seat.user_id === winnerId) {
        results.push({
          user_id: seat.user_id,
          net_amount: totalPot - seat.current_bet,
          hand_name: seat.hand_result?.rank_name || "Win",
        });
      } else {
        results.push({
          user_id: seat.user_id,
          net_amount: -seat.current_bet,
          hand_name: seat.hand_result?.rank_name || "Lose",
        });
      }
    }
    return results;
  }

  getActionSeats(state: PluginRoundState): Seat[] {
    return state.seats
      .filter((s) => s.status === "playing")
      .sort((a, b) => a.seat_index - b.seat_index);
  }

  isPhaseComplete(state: PluginRoundState): boolean {
    const alive = state.seats.filter((s) => s.status === "playing");
    if (alive.length <= 1) return true;
    return alive.every((s) => s.has_acted) && alive.every((s) => s.current_bet === alive[0].current_bet);
  }

  getNextPhase(state: PluginRoundState): RoundPhase {
    const alive = state.seats.filter((s) => s.status === "playing");
    if (alive.length <= 1) return "SHOWDOWN";
    if (state.phase === "WAITING") return "DEALING";
    if (state.phase === "DEALING") return "BETTING";
    if (state.phase === "BETTING") return "SHOWDOWN";
    if (state.phase === "SHOWDOWN") return "SETTLING";
    if (state.phase === "SETTLING") return "FINISHED";
    return "FINISHED";
  }
}

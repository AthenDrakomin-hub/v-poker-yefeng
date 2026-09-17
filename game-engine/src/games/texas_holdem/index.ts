/**
 * 德州扑克规则插件 (Texas Hold'em Plugin)
 * 流程：Preflop (2底牌) -> Flop (3公共牌) -> Turn (第4张) -> River (第5张) -> Showdown -> 算分
 * 严格遵循国际德州扑克规范与微服务零和净输赢原则。
 */

import { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Seat } from "../../shared/types.js";
import { CompareResult, GamePlugin, HandEvaluation, PluginRoundState } from "../plugin.interface.js";
import { evaluate7Cards, evaluate5Cards, compareEvaluations, getCombinations } from "./evaluator.js";
import { TexasHoldemDeck, createStandardDeck, shuffleDeck } from "./deck.js";

export { TexasHoldemDeck, createStandardDeck, shuffleDeck };
export { evaluate7Cards, evaluate5Cards, compareEvaluations, getCombinations };

export class TexasHoldemPlugin implements GamePlugin {
  readonly game_type: GameType = "texas_holdem";
  readonly name = "德州扑克";
  readonly supported_modes: GameMode[] = ["fixed"];

  initDeck(): Card[] {
    const deckManager = new TexasHoldemDeck();
    deckManager.shuffle();
    return deckManager.getRemainingCards();
  }

  dealCards(state: PluginRoundState): void {
    // 1. 发2张底牌给在局玩家 (正规轮流发牌机制)
    const activeSeats = state.seats.filter((s) => s.status === "playing" || s.status === "ready");
    activeSeats.forEach((seat) => {
      seat.cards = [];
      seat.status = "playing";
      seat.current_bet = 0;
      seat.has_acted = false;
    });

    // 第 1 轮发 1 张
    for (const seat of activeSeats) {
      if (state.deck.length > 0) {
        seat.cards.push(state.deck.pop()!);
      }
    }
    // 第 2 轮发 1 张 (每人共2张底牌)
    for (const seat of activeSeats) {
      if (state.deck.length > 0) {
        seat.cards.push(state.deck.pop()!);
      }
    }

    // 2. 扣除大小盲 (SB = base_score / 2, BB = base_score)
    const sb = Math.floor(state.room.base_score / 2);
    const bb = state.room.base_score;
    if (activeSeats.length >= 2) {
      activeSeats[0].current_bet = sb;
      activeSeats[1].current_bet = bb;
      state.total_pot = sb + bb;
      state.current_highest_bet = bb;
      state.min_call_amount = bb;
      // 两人对局首位行动者为小盲(Seat 0)，三人以上为枪口位(UTG，Seat 2)
      state.current_turn_seat_index = activeSeats.length > 2 ? activeSeats[2].seat_index : activeSeats[0].seat_index;
    }

    state.community_cards = [];
    state.betting_round_count = 1; // 1: Preflop, 2: Flop, 3: Turn, 4: River
  }

  dealCommunityCards(state: PluginRoundState): void {
    if (state.betting_round_count === 2) {
      // 翻牌圈 Flop (标准规则：烧1张，发3张公共牌)
      if (state.deck.length > 0) state.deck.pop(); // 烧牌
      for (let i = 0; i < 3; i++) {
        if (state.deck.length > 0) state.community_cards.push(state.deck.pop()!);
      }
    } else if (state.betting_round_count === 3) {
      // 转牌圈 Turn (标准规则：烧1张，发第4张公共牌)
      if (state.deck.length > 0) state.deck.pop(); // 烧牌
      if (state.deck.length > 0) state.community_cards.push(state.deck.pop()!);
    } else if (state.betting_round_count === 4) {
      // 河牌圈 River (标准规则：烧1张，发第5张公共牌)
      if (state.deck.length > 0) state.deck.pop(); // 烧牌
      if (state.deck.length > 0) state.community_cards.push(state.deck.pop()!);
    }

    // 重新评估所有未弃牌玩家的最佳牌型
    state.seats.forEach((seat) => {
      if (seat.status === "playing" && seat.cards.length === 2) {
        seat.hand_result = this.evaluateHand(seat.cards, state.community_cards);
      }
    });
  }

  handleAction(state: PluginRoundState, action: GameAction): { success: boolean; error?: string } {
    const seat = state.seats.find((s) => s.user_id === action.user_id);
    if (!seat) return { success: false, error: "Seat not found." };
    if (seat.status !== "playing") return { success: false, error: "Seat is not playing." };

    if (action.action_type === "fold") {
      seat.status = "folded";
      seat.has_acted = true;
      return { success: true };
    }

    if (action.action_type === "call") {
      const callDiff = state.current_highest_bet - seat.current_bet;
      if (callDiff > 0) {
        seat.current_bet += callDiff;
        state.total_pot += callDiff;
      }
      seat.has_acted = true;
      this.rotateTurn(state, seat.seat_index);
      return { success: true };
    }

    if (action.action_type === "check") {
      if (seat.current_bet < state.current_highest_bet) {
        return { success: false, error: "Cannot check when there is an active bet to call." };
      }
      seat.has_acted = true;
      this.rotateTurn(state, seat.seat_index);
      return { success: true };
    }

    if (action.action_type === "raise" || action.action_type === "bet") {
      let targetBet: number;
      if (action.amount !== undefined && action.amount > state.current_highest_bet) {
        targetBet = action.amount;
      } else if (action.amount !== undefined && action.amount > 0) {
        targetBet = state.current_highest_bet + action.amount;
      } else {
        targetBet = state.current_highest_bet + state.room.base_score;
      }
      const addOn = targetBet - seat.current_bet;
      seat.current_bet = targetBet;
      state.current_highest_bet = targetBet;
      state.total_pot += addOn;
      seat.has_acted = true;

      // 加注后，其余存活玩家必须重新响应跟注或弃牌
      state.seats.forEach((s) => {
        if (s.user_id !== action.user_id && (s.status === "playing" || s.status === "all_in")) {
          s.has_acted = false;
        }
      });
      this.rotateTurn(state, seat.seat_index);
      return { success: true };
    }

    if (action.action_type === "all_in") {
      seat.status = "all_in";
      const addOn = action.amount ?? 5000;
      seat.current_bet += addOn;
      if (seat.current_bet > state.current_highest_bet) {
        state.current_highest_bet = seat.current_bet;
      }
      state.total_pot += addOn;
      seat.has_acted = true;

      state.seats.forEach((s) => {
        if (s.user_id !== action.user_id && s.status === "playing") {
          s.has_acted = false;
        }
      });
      this.rotateTurn(state, seat.seat_index);
      return { success: true };
    }

    return { success: false, error: `Unsupported Texas action ${action.action_type}` };
  }

  private rotateTurn(state: PluginRoundState, currentSeatIndex: number): void {
    const aliveSeats = state.seats.filter((s) => s.status === "playing");
    if (aliveSeats.length > 0) {
      const sorted = [...aliveSeats].sort((a, b) => a.seat_index - b.seat_index);
      const nextSeat = sorted.find((s) => s.seat_index > currentSeatIndex) || sorted[0];
      state.current_turn_seat_index = nextSeat.seat_index;
    }
  }

  evaluateHand(cards: Card[], communityCards?: Card[]): HandEvaluation {
    return evaluate7Cards(cards, communityCards || []);
  }

  compareHands(state: PluginRoundState): CompareResult {
    const aliveSeats = state.seats.filter((s) => (s.status === "playing" || s.status === "all_in") && s.cards.length === 2);
    const rankings = aliveSeats.map((s) => ({
      user_id: s.user_id!,
      seat_index: s.seat_index,
      evaluation: s.hand_result || this.evaluateHand(s.cards, state.community_cards)
    }));

    rankings.sort((a, b) => b.evaluation.score - a.evaluation.score);

    return {
      winner_user_ids: rankings.length > 0 ? [rankings[0].user_id] : [],
      rankings
    };
  }

  calculateNetScores(state: PluginRoundState): PlayerNetResult[] {
    const comp = this.compareHands(state);
    if (comp.winner_user_ids.length === 0) return [];

    const winnerId = comp.winner_user_ids[0];
    const totalPot = state.total_pot;

    const results: PlayerNetResult[] = [];
    state.seats.forEach((seat) => {
      if (!seat.user_id || seat.current_bet <= 0) return;

      if (seat.user_id === winnerId) {
        results.push({
          user_id: seat.user_id,
          net_amount: totalPot - seat.current_bet,
          bet_total: seat.current_bet,
          gross_win: totalPot,
          hand_name: seat.hand_result?.rank_name || "德州胜出牌型"
        });
      } else {
        results.push({
          user_id: seat.user_id,
          net_amount: -seat.current_bet,
          bet_total: seat.current_bet,
          gross_win: 0,
          hand_name: seat.hand_result?.rank_name || (seat.status === "folded" ? "弃牌" : "比牌落败")
        });
      }
    });

    return results;
  }

  isPhaseComplete(state: PluginRoundState): boolean {
    const aliveSeats = state.seats.filter((s) => s.status === "playing");
    if (aliveSeats.length <= 1) return true;
    if (state.phase === "BETTING") {
      return aliveSeats.every((s) => s.has_acted && s.current_bet === state.current_highest_bet);
    }
    return true;
  }

  getNextPhase(state: PluginRoundState): RoundPhase {
    const aliveSeats = state.seats.filter((s) => s.status === "playing" || s.status === "all_in");
    if (aliveSeats.length <= 1) return "SHOWDOWN";

    if (state.phase === "WAITING") return "DEALING";
    if (state.phase === "DEALING") return "BETTING";

    if (state.phase === "BETTING") {
      if (state.betting_round_count < 4) {
        state.betting_round_count++;
        this.dealCommunityCards(state);
        // 重置本轮动作标记并重置当前首位行动者
        aliveSeats.forEach((s) => {
          s.has_acted = false;
        });
        const firstAlive = aliveSeats.find((s) => s.status === "playing");
        if (firstAlive) {
          state.current_turn_seat_index = firstAlive.seat_index;
        }
        return "BETTING";
      }
      return "SHOWDOWN";
    }

    if (state.phase === "SHOWDOWN") return "SETTLING";
    if (state.phase === "SETTLING") return "FINISHED";
    return "FINISHED";
  }
}

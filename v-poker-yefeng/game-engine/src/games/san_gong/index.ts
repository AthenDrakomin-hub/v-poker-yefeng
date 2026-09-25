/**
 * 三公规则插件 (支持模式: qiang_zhuang 抢庄三公, tong_bi 通比三公)
 */

import { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Seat, Suit } from "../../shared/types.js";
import { CompareResult, GamePlugin, HandEvaluation, PluginRoundState } from "../plugin.interface.js";
import { evaluateSanGong } from "./evaluator.js";

export class SanGongPlugin implements GamePlugin {
  readonly game_type: GameType = "san_gong";
  readonly name = "三公";
  readonly supported_modes: GameMode[] = ["banker", "free_compare"];

  initDeck(): Card[] {
    const suits: Suit[] = ["S", "H", "C", "D"];
    const deck: Card[] = [];
    for (const suit of suits) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({
          suit,
          rank,
          code: `${suit}-${rank}`
        });
      }
    }
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  dealCards(state: PluginRoundState): void {
    // 每人 3 张
    const activeSeats = state.seats.filter((s) => s.status === "playing" || s.status === "ready");
    activeSeats.forEach((seat) => {
      seat.cards = [];
      for (let i = 0; i < 3; i++) {
        if (state.deck.length > 0) {
          seat.cards.push(state.deck.pop()!);
        }
      }
      seat.status = "playing";
      seat.hand_result = this.evaluateHand(seat.cards);
    });
  }

  handleAction(state: PluginRoundState, action: GameAction): { success: boolean; error?: string } {
    const seat = state.seats.find((s) => s.user_id === action.user_id);
    if (!seat) return { success: false, error: "Seat not found for user." };

    if (action.action_type === "qiang_zhuang") {
      if (state.room.mode !== "qiang_zhuang") {
        return { success: false, error: "Current mode does not support qiang_zhuang." };
      }
      seat.banker_multiplier = action.multiplier ?? 0;
      seat.has_acted = true;
      return { success: true };
    }

    if (action.action_type === "bet") {
      if (state.room.mode === "banker" && seat.is_banker) {
        return { success: false, error: "Banker cannot bet." };
      }
      seat.bet_multiplier = action.multiplier ?? 1;
      seat.current_bet = (action.multiplier ?? 1) * state.room.base_score;
      seat.has_acted = true;
      return { success: true };
    }

    if (action.action_type === "view_cards" || action.action_type === "showdown") {
      seat.has_viewed_cards = true;
      seat.has_acted = true;
      return { success: true };
    }

    return { success: false, error: `Unsupported action ${action.action_type} for San Gong.` };
  }

  evaluateHand(cards: Card[]): HandEvaluation {
    return evaluateSanGong(cards);
  }

  compareHands(state: PluginRoundState): CompareResult {
    const activeSeats = state.seats.filter((s) => s.status === "playing" && s.cards.length === 3);
    const rankings = activeSeats.map((s) => ({
      user_id: s.user_id!,
      seat_index: s.seat_index,
      evaluation: s.hand_result || this.evaluateHand(s.cards)
    }));

    rankings.sort((a, b) => b.evaluation.score - a.evaluation.score);

    return {
      winner_user_ids: rankings.length > 0 ? [rankings[0].user_id] : [],
      rankings
    };
  }

  calculateNetScores(state: PluginRoundState): PlayerNetResult[] {
    const activeSeats = state.seats.filter((s) => s.status === "playing" && s.cards.length === 3);
    if (activeSeats.length < 2) return [];

    const baseScore = state.room.base_score;
    const results: Record<string, number> = {};
    activeSeats.forEach((s) => {
      results[s.user_id!] = 0;
    });

    if (state.room.mode === "banker") {
      // 庄家和闲家比牌
      let bankerSeat = activeSeats.find((s) => s.is_banker);
      if (!bankerSeat) {
        bankerSeat = [...activeSeats].sort((a, b) => b.banker_multiplier - a.banker_multiplier)[0];
        bankerSeat.is_banker = true;
      }

      const bankerEval = bankerSeat.hand_result || this.evaluateHand(bankerSeat.cards);
      const bankerMult = Math.max(1, bankerSeat.banker_multiplier || 1);

      activeSeats.forEach((seat) => {
        if (seat.user_id === bankerSeat!.user_id) return;

        const playerEval = seat.hand_result || this.evaluateHand(seat.cards);
        const playerBetMult = Math.max(1, seat.bet_multiplier || 1);

        const playerWins = playerEval.score > bankerEval.score;
        const winMult = playerWins ? playerEval.multiplier : bankerEval.multiplier;
        const exchangeAmount = baseScore * bankerMult * playerBetMult * winMult;

        if (playerWins) {
          results[seat.user_id!] += exchangeAmount;
          results[bankerSeat!.user_id!] -= exchangeAmount;
        } else {
          results[seat.user_id!] -= exchangeAmount;
          results[bankerSeat!.user_id!] += exchangeAmount;
        }
      });
    } else {
      // 通比三公模式：全场横向比牌
      const comp = this.compareHands(state);
      const winnerId = comp.winner_user_ids[0];
      const winMult = comp.rankings[0].evaluation.multiplier;

      activeSeats.forEach((seat) => {
        if (seat.user_id === winnerId) return;
        const lossAmount = baseScore * winMult;
        results[seat.user_id!] -= lossAmount;
        results[winnerId] += lossAmount;
      });
    }

    return Object.entries(results).map(([user_id, net_amount]) => {
      const seat = activeSeats.find((s) => s.user_id === user_id);
      return {
        user_id,
        net_amount,
        hand_name: seat?.hand_result?.rank_name || "未知"
      };
    });
  }

  /** 当前阶段需要行动的座位（抢庄：全员；下注：非庄家；ACTION：全员） */
  getActionSeats(state: PluginRoundState): Seat[] {
    const playing = state.seats.filter((s) => s.status === "playing").sort((a, b) => a.seat_index - b.seat_index);
    if (state.phase === "QIANG_ZHUANG") return playing;
    if (state.phase === "BETTING") return playing.filter((s) => !s.is_banker);
    if (state.phase === "ACTION") return playing;
    return [];
  }

  /** 抢庄结束后确定庄家：抢庄倍数最高者（并列取座位号最小） */
  private selectBanker(state: PluginRoundState): void {
    const players = state.seats.filter((s) => s.status === "playing");
    if (players.length === 0) return;
    players.forEach((s) => {
      s.is_banker = false;
    });
    const banker = [...players].sort(
      (a, b) => b.banker_multiplier - a.banker_multiplier || a.seat_index - b.seat_index
    )[0];
    banker.is_banker = true;
    state.banker_seat_index = banker.seat_index;
  }

  isPhaseComplete(state: PluginRoundState): boolean {
    const activeSeats = state.seats.filter((s) => s.status === "playing");
    if (state.phase === "QIANG_ZHUANG") {
      return activeSeats.every((s) => s.has_acted);
    }
    if (state.phase === "BETTING") {
      return activeSeats.filter((s) => !s.is_banker).every((s) => s.has_acted);
    }
    if (state.phase === "ACTION") {
      return activeSeats.every((s) => s.has_viewed_cards || s.has_acted);
    }
    return true;
  }

  getNextPhase(state: PluginRoundState): RoundPhase {
    if (state.phase === "WAITING") return "DEALING";
    if (state.phase === "DEALING") {
      return state.room.mode === "banker" ? "QIANG_ZHUANG" : "BETTING";
    }
    if (state.phase === "QIANG_ZHUANG") {
      // 抢庄结束 → 定庄 → 进入闲家下注
      this.selectBanker(state);
      // 重置闲家行动标记（抢庄时已置 true，否则下注阶段无人待行动）
      state.seats
        .filter((s) => s.status === "playing" && !s.is_banker)
        .forEach((s) => {
          s.has_acted = false;
        });
      return "BETTING";
    }
    if (state.phase === "BETTING") {
      // 进入看牌阶段：重置全员行动标记
      state.seats
        .filter((s) => s.status === "playing")
        .forEach((s) => {
          s.has_acted = false;
        });
      return "ACTION";
    }
    if (state.phase === "ACTION") return "SHOWDOWN";
    if (state.phase === "SHOWDOWN") return "SETTLING";
    if (state.phase === "SETTLING") return "FINISHED";
    return "FINISHED";
  }
}

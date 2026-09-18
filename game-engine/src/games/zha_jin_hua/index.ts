/**
 * 炸金花规则插件 (Zha Jin Hua Plugin)
 * 特色：暗注/明注机制 (闷牌跟注额是看牌的一半)、单挑比牌、底池争夺
 */

import { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Seat, Suit } from "../../shared/types.js";
import { CompareResult, GamePlugin, HandEvaluation, PluginRoundState } from "../plugin.interface.js";
import { evaluateZhaJinHua, compareZhaJinHua } from "./evaluator.js";

export class ZhaJinHuaPlugin implements GamePlugin {
  readonly game_type: GameType = "zha_jin_hua";
  readonly name = "炸金花";
  readonly supported_modes: GameMode[] = ["normal"];

  /** 是否启用 235 反转豹子规则（默认关闭） */
  private enable235Reversal: boolean = false;

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
    // 强制扣除底注 (Ante)
    const ante = state.room.base_score;
    const activeSeats = state.seats.filter((s) => s.status === "playing" || s.status === "ready");

    activeSeats.forEach((seat) => {
      seat.cards = [];
      for (let i = 0; i < 3; i++) {
        if (state.deck.length > 0) {
          seat.cards.push(state.deck.pop()!);
        }
      }
      seat.status = "playing";
      seat.has_viewed_cards = false;
      seat.current_bet = ante;
      state.total_pot += ante;
      seat.hand_result = this.evaluateHand(seat.cards);
    });

    state.min_call_amount = ante; // 当前暗注基准
    state.current_highest_bet = ante;
    state.betting_round_count = 1;
  }

  handleAction(state: PluginRoundState, action: GameAction): { success: boolean; error?: string } {
    const seat = state.seats.find((s) => s.user_id === action.user_id);
    if (!seat) return { success: false, error: "Seat not found." };
    if (seat.status !== "playing") return { success: false, error: "Seat is not in active play." };

    if (action.action_type === "view_cards") {
      seat.has_viewed_cards = true;
      return { success: true };
    }

    if (action.action_type === "fold") {
      seat.status = "folded";
      seat.has_acted = true;
      return { success: true };
    }

    if (action.action_type === "call" || action.action_type === "bet" || action.action_type === "raise") {
      // 算注：若已看牌，则下注额为暗注的2倍
      const baseCall = state.min_call_amount;
      let cost = seat.has_viewed_cards ? baseCall * 2 : baseCall;

      if (action.action_type === "raise" && action.amount) {
        cost = action.amount;
        state.min_call_amount = seat.has_viewed_cards ? Math.floor(cost / 2) : cost;
      }

      seat.current_bet += cost;
      state.total_pot += cost;
      seat.has_acted = true;
      return { success: true };
    }

    if (action.action_type === "compare") {
      // 比牌：指定对手比牌，输者 fold
      // 规则：必须第二轮下注后才能比牌
      if (state.betting_round_count < 2) {
        return { success: false, error: "比牌必须从第二轮下注开始" };
      }

      const targetUserId = action.target_user_id;
      const targetSeat = state.seats.find((s) => s.user_id === targetUserId && s.status === "playing");
      if (!targetSeat) return { success: false, error: "Valid target seat not found for compare." };

      // 比牌成本：看牌玩家双倍，闷牌玩家半价
      const cost = seat.has_viewed_cards ? state.min_call_amount * 2 : Math.floor(state.min_call_amount / 2);
      seat.current_bet += cost;
      state.total_pot += cost;

      const myEval = seat.hand_result || this.evaluateHand(seat.cards);
      const targetEval = targetSeat.hand_result || this.evaluateHand(targetSeat.cards);

      // 使用支持 235 反转的比较函数
      const compareResult = compareZhaJinHua(
        myEval,
        targetEval,
        seat.cards,
        targetSeat.cards,
        this.enable235Reversal
      );

      if (compareResult > 0) {
        targetSeat.status = "folded";
      } else if (compareResult < 0) {
        seat.status = "folded";
      } else {
        // 平局：主动比牌方输
        seat.status = "folded";
      }

      seat.has_acted = true;
      return { success: true };
    }

    return { success: false, error: `Invalid action ${action.action_type} for Zha Jin Hua.` };
  }

  evaluateHand(cards: Card[]): HandEvaluation {
    return evaluateZhaJinHua(cards);
  }

  compareHands(state: PluginRoundState): CompareResult {
    // 比较仍存活的玩家 (playing)
    const aliveSeats = state.seats.filter((s) => s.status === "playing" && s.cards.length === 3);
    const rankings = aliveSeats.map((s) => ({
      user_id: s.user_id!,
      seat_index: s.seat_index,
      evaluation: s.hand_result || this.evaluateHand(s.cards)
    }));

    // 使用支持 235 反转的比较函数排序
    rankings.sort((a, b) => {
      const seatA = aliveSeats.find((s) => s.user_id === a.user_id)!;
      const seatB = aliveSeats.find((s) => s.user_id === b.user_id)!;
      return compareZhaJinHua(
        a.evaluation,
        b.evaluation,
        seatA.cards,
        seatB.cards,
        this.enable235Reversal
      );
    });

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

    // 所有玩家净输赢：
    // 输家净输 = -自身投入的所有筹码 current_bet
    // 赢家净赢 = totalPot - 自身投入筹码
    const results: PlayerNetResult[] = [];
    state.seats.forEach((seat) => {
      if (!seat.user_id || seat.current_bet <= 0) return;

      if (seat.user_id === winnerId) {
        results.push({
          user_id: seat.user_id,
          net_amount: totalPot - seat.current_bet,
          bet_total: seat.current_bet,
          gross_win: totalPot,
          hand_name: seat.hand_result?.rank_name || "胜利牌型"
        });
      } else {
        results.push({
          user_id: seat.user_id,
          net_amount: -seat.current_bet,
          bet_total: seat.current_bet,
          gross_win: 0,
          hand_name: seat.hand_result?.rank_name || (seat.status === "folded" ? "弃牌" : "比牌负")
        });
      }
    });

    return results;
  }

  isPhaseComplete(state: PluginRoundState): boolean {
    const aliveSeats = state.seats.filter((s) => s.status === "playing");
    // 若只剩一人活，直接结束
    if (aliveSeats.length <= 1) return true;
    if (state.phase === "BETTING" || state.phase === "ACTION") {
      // 所有存活玩家都完成本轮动作，且下注额一致
      const allActed = aliveSeats.every((s) => s.has_acted);
      const allBetsEqual = aliveSeats.every((s) => s.current_bet === aliveSeats[0].current_bet);
      return allActed && allBetsEqual;
    }
    return true;
  }

  getNextPhase(state: PluginRoundState): RoundPhase {
    const aliveSeats = state.seats.filter((s) => s.status === "playing");
    if (aliveSeats.length <= 1) return "SHOWDOWN";

    if (state.phase === "WAITING") return "DEALING";
    if (state.phase === "DEALING") return "BETTING";

    if (state.phase === "BETTING") {
      // 多轮下注：最多 3 轮下注后强制摊牌
      if (state.betting_round_count < 3) {
        state.betting_round_count++;
        // 重置动作标记，开始下一轮
        aliveSeats.forEach((s) => {
          s.has_acted = false;
        });
        return "BETTING";
      }
      return "SHOWDOWN";
    }

    if (state.phase === "SHOWDOWN") return "SETTLING";
    if (state.phase === "SETTLING") return "FINISHED";
    return "FINISHED";
  }
}

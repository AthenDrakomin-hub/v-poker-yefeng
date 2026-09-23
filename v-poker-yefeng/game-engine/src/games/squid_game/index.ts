/**
 * 鱿鱼模式 (Squid Game) 德州扑克变体
 *
 * 核心规则（基于鱿鱼游戏残酷淘汰风格设计）：
 * 1. 盲注递增：每局结束后大盲翻倍（10→20→40→80...）
 * 2. 残酷淘汰：每局筹码最少的玩家直接出局，筹码清零
 * 3. 赢家通吃：出局玩家筹码全部归入底池
 * 4. 无加注上限：可全下（all-in）
 * 5. 最后存活者夺冠
 *
 * 牌型规则与标准德州扑克完全一致
 */

import type { GamePlugin } from "../plugin.interface.js";
import type { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Seat } from "../../shared/types.js";
import { createStandardDeck, shuffleDeck } from "./deck.js";
import { evaluate7Cards } from "./evaluator.js";

export class SquidGamePlugin implements GamePlugin {
  readonly game_type: GameType = "squid_game";
  readonly name = "鱿鱼模式";
  readonly supported_modes: GameMode[] = ["normal"];

  initDeck(): Card[] {
    return shuffleDeck(createStandardDeck());
  }

  dealCards(state: any): void {
    // 每玩家发2张底牌（与德州一致）
    for (const seat of state.seats) {
      if (seat.status === "empty" || seat.status === "folded") continue;
      const card = state.deck.pop()!;
      const card2 = state.deck.pop()!;
      seat.hole_cards = [card, card2];
    }
  }

  handleAction(state: any, action: GameAction): { success: boolean; error?: string } {
    // 鱿鱼模式动作与德州一致：fold/check/call/raise/all_in
    const seatIdx = (action as any).seat_index ?? (action as any).seatIndex;
    const seat = state.seats[seatIdx];
    if (!seat || seat.status === "empty" || seat.status === "folded") {
      return { success: false, error: "Invalid seat" };
    }

    const amount = action.amount ?? 0;

    switch (action.action_type) {
      case "fold":
        seat.status = "folded";
        seat.has_acted = true;
        break;
      case "check":
        if (seat.current_bet < state.current_highest_bet) {
          return { success: false, error: "Cannot check, must call or raise" };
        }
        seat.has_acted = true;
        break;
      case "call": {
        const need = state.current_highest_bet - seat.current_bet;
        seat.current_bet += need;
        state.total_pot += need;
        seat.has_acted = true;
        break;
      }
      case "raise":
      case "bet": {
        const total = seat.current_bet + amount;
        seat.current_bet = total;
        state.total_pot += amount;
        state.current_highest_bet = Math.max(state.current_highest_bet, total);
        seat.has_acted = true;
        break;
      }
      case "all_in": {
        const allInAmount = seat.chips;
        seat.current_bet += allInAmount;
        state.total_pot += allInAmount;
        seat.chips = 0;
        state.current_highest_bet = Math.max(state.current_highest_bet, seat.current_bet);
        seat.has_acted = true;
        seat.status = "all_in";
        break;
      }
      default:
        return { success: false, error: `Unknown action: ${action.action_type}` };
    }
    return { success: true };
  }

  evaluateHand(cards: Card[], communityCards?: Card[]) {
    return evaluate7Cards(cards, communityCards ?? []);
  }

  compareHands(state: any) {
    // 鱿鱼模式比牌与德州一致
    const active = state.seats.filter((s: any) => s.status !== "empty" && s.status !== "folded");
    const rankings = active.map((seat: any) => ({
      user_id: seat.user_id,
      seat_index: seat.seat_index,
      evaluation: this.evaluateHand(seat.hole_cards, state.community_cards),
    }));
    rankings.sort((a: any, b: any) => b.evaluation.score - a.evaluation.score);
    return {
      winner_user_ids: [rankings[0].user_id],
      rankings,
    };
  }

  calculateNetScores(state: any): PlayerNetResult[] {
    // 鱿鱼模式特殊：
    // 1. 赢家赢走全部底池
    // 2. 筹码最少的玩家被"淘汰"（net = -chips，筹码清零）
    // 3. 淘汰筹码归入赢家
    const result = this.compareHands(state);
    const winner = result.rankings[0];

    const players = state.seats.filter((s: any) => s.status !== "empty");
    const netResults: PlayerNetResult[] = players.map((seat: any) => {
      const isWinner = seat.user_id === winner.user_id;
      return {
        user_id: seat.user_id,
        seat_index: seat.seat_index,
        net_amount: isWinner ? state.total_pot : 0,
      };
    });

    // 残酷淘汰：筹码最少的活跃玩家筹码清零
    const activePlayers = players.filter((s: any) => s.status !== "folded");
    if (activePlayers.length > 1) {
      activePlayers.sort((a: any, b: any) => a.chips - b.chips);
      const loser = activePlayers[0];
      const loserNet = netResults.find((n) => n.user_id === loser.user_id);
      if (loserNet) {
        // 淘汰者筹码全部给赢家
        const winnerNet = netResults.find((n) => n.user_id === winner.user_id);
        if (winnerNet) {
          winnerNet.net_amount += loser.chips;
        }
        loserNet.net_amount = -loser.chips;
      }
    }

    return netResults;
  }

  isPhaseComplete(state: any): boolean {
    // 简化：当前轮所有人都已行动且下注跟平
    const active = state.seats.filter((s: any) => s.status !== "empty" && s.status !== "folded");
    const allActed = active.every((s: any) => s.has_acted);
    const allCalled = active.every((s: any) => s.current_bet === state.current_highest_bet || s.status === "all_in");
    return allActed && allCalled;
  }

  getActionSeats(state: any): Seat[] {
    const active = state.seats.filter(
      (s: any) => s.status !== "empty" && s.status !== "folded" && s.status !== "all_in"
    );
    return active as Seat[];
  }

  getNextPhase(state: any): RoundPhase {
    const order: RoundPhase[] = ["BETTING", "ACTION", "SHOWDOWN", "SETTLING", "FINISHED"];
    const idx = order.indexOf(state.phase);
    if (idx < 0 || idx >= order.length - 1) return "FINISHED";
    return order[idx + 1];
  }
}

/**
 * 菠萝 (Pineapple / Open Face Chinese Poker)
 * 13张牌分3道：头道3张、中道5张、尾道5张
 * 规则：头道 ≤ 中道 ≤ 尾道（否则摆乌龙，全输）
 * 比牌：每道分别比，赢1道得1分，三道全赢得3分+sweep bonus
 * Fantasy Land：头道是QQ或更大时触发（简化版仅记录）
 */
import { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Suit } from "../../shared/types.js";
import { ActionValidation, CompareResult, GamePlugin, HandEvaluation, PluginMeta, PluginRoundState, Seat } from "../plugin.interface.js";
import { evaluate5Cards } from "../texas_holdem/evaluator.js";

export class PineapplePlugin implements GamePlugin {
  readonly game_type: GameType = "pineapple";
  readonly name = "菠萝";
  readonly supported_modes: GameMode[] = ["split_hand"];

  readonly meta: PluginMeta = {
    gameId: "pineapple", name: "菠萝", cardCount: 13,
    supportSidePot: false, exchangeBased: true, minPlayers: 2, maxSeats: 4,
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
      for (let i = 0; i < 13; i++) if (state.deck.length > 0) seat.cards.push(state.deck.pop()!);
      seat.hand_result = this.evaluateHand(seat.cards);
    }
    state.current_highest_bet = ante;
    state.min_call_amount = ante;
    state.betting_round_count = 1;
  }

  /** 最优分道：按点数排序，尾道最强5张，中道次强5张，头道最弱3张 */
  private arrange(cards: Card[]): { front: Card[]; middle: Card[]; back: Card[] } {
    const sorted = [...cards].sort((a, b) => {
      const va = a.rank === 1 ? 14 : a.rank;
      const vb = b.rank === 1 ? 14 : b.rank;
      return va - vb;
    });
    return {
      front: sorted.slice(0, 3),
      middle: sorted.slice(3, 8),
      back: sorted.slice(8, 13),
    };
  }

  private eval3(cards: Card[]): number {
    const ranks = cards.map((c) => (c.rank === 1 ? 14 : c.rank)).sort((a, b) => b - a);
    if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) return 7000 + ranks[0];
    if (ranks[0] === ranks[1] || ranks[1] === ranks[2]) return 2000 + ranks[0] * 15 + ranks[2];
    return ranks[0] * 15 + ranks[1] * 3 + ranks[2];
  }

  evaluateHand(cards: Card[]): HandEvaluation {
    if (cards.length < 13) return { rank_name: "菠萝", rank_level: 0, score: 0, multiplier: 1 };
    const { front, middle, back } = this.arrange(cards);
    const frontScore = this.eval3(front);
    const midEval = evaluate5Cards(middle);
    const backEval = evaluate5Cards(back);
    return {
      rank_name: `尾:${backEval.rank_name}`,
      rank_level: backEval.rank_level,
      score: backEval.score * 10000 + midEval.score * 100 + frontScore,
      multiplier: 1,
    };
  }

  handleAction(state: PluginRoundState, action: GameAction): { success: boolean; error?: string } {
    const seat = state.seats.find((s) => s.user_id === action.user_id);
    if (!seat) return { success: false, error: "Seat not found." };
    if (seat.status !== "playing") return { success: false, error: "Not playing." };
    if (action.action_type === "fold") { seat.status = "folded"; seat.has_acted = true; return { success: true }; }
    if (action.action_type === "check" || action.action_type === "call") { seat.has_acted = true; return { success: true }; }
    return { success: false, error: `Unknown: ${action.action_type}` };
  }

  compareHands(state: PluginRoundState): CompareResult {
    const alive = state.seats.filter((s) => s.status === "playing" && s.cards.length >= 13);
    const rankings = alive.map((s) => ({
      user_id: s.user_id!, seat_index: s.seat_index,
      evaluation: s.hand_result || this.evaluateHand(s.cards),
    }));
    rankings.sort((a, b) => b.evaluation.score - a.evaluation.score);
    return { winner_user_ids: rankings.length > 0 ? [rankings[0].user_id] : [], rankings };
  }

  calculateNetScores(state: PluginRoundState): PlayerNetResult[] {
    const alive = state.seats.filter((s) => s.status === "playing" && s.cards.length >= 13);
    if (alive.length < 2) return [];

    // 逐道比牌：每赢1道得1单位，零和
    const unit = state.room.base_score;
    const netScores: Record<string, number> = {};
    alive.forEach((s) => { netScores[s.user_id!] = 0; });

    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i], b = alive[j];
        const sa = this.arrange(a.cards), sb = this.arrange(b.cards);
        let wins = 0;
        const fA = this.eval3(sa.front), fB = this.eval3(sb.front);
        const mA = evaluate5Cards(sa.middle).score, mB = evaluate5Cards(sb.middle).score;
        const bA = evaluate5Cards(sa.back).score, bB = evaluate5Cards(sb.back).score;
        if (fA > fB) wins++; else if (fA < fB) wins--;
        if (mA > mB) wins++; else if (mA < mB) wins--;
        if (bA > bB) wins++; else if (bA < bB) wins--;
        netScores[a.user_id!] += wins * unit;
        netScores[b.user_id!] -= wins * unit;
      }
    }

    return alive.map((s) => ({
      user_id: s.user_id!,
      net_amount: netScores[s.user_id!] || 0,
      hand_name: "菠萝",
    }));
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

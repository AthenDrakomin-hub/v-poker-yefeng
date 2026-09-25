/**
 * 十三水 (Chinese Poker / 十三道)
 * 每人13张牌，分3道：头道3张、中道5张、尾道5张
 * 规则：头道 ≤ 中道 ≤ 尾道（尾道最大）
 * 比牌：三道分别比，赢2道及以上获胜
 * 特殊牌型：四炸、同花顺、葫芦等有加成
 */
import { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Suit } from "../../shared/types.js";
import { CompareResult, GamePlugin, HandEvaluation, PluginRoundState, Seat } from "../plugin.interface.js";
import { evaluate5Cards } from "../texas_holdem/evaluator.js";

interface SplitHands {
  front: Card[];   // 头道 3张
  middle: Card[];  // 中道 5张
  back: Card[];    // 尾道 5张
}

export class ThirteenWaterPlugin implements GamePlugin {
  readonly game_type: GameType = "thirteen_water";
  readonly name = "十三水";
  readonly supported_modes: GameMode[] = ["split_hand"];

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
      // 自动分道
      const split = this.arrangeHands(seat.cards);
      seat.hand_result = this.evaluateSplit(split);
    }
    state.current_highest_bet = ante;
    state.min_call_amount = ante;
    state.betting_round_count = 1;
  }

  /** 最优分道：按点数排序后，尾道取最强5张，中道取次强5张，头道取最弱3张 */
  private arrangeHands(cards: Card[]): SplitHands {
    const sorted = [...cards].sort((a, b) => a.rank - b.rank);
    // 升序排列：前面小，后面大
    const front = sorted.slice(0, 3);   // 最小的3张 → 头道
    const middle = sorted.slice(3, 8);  // 中间5张 → 中道
    const back = sorted.slice(8, 13);   // 最大5张 → 尾道
    return { front, middle, back };
  }

  /** 评估一道3张牌（头道）：高牌/对子/三条 */
  private eval3Cards(cards: Card[]): HandEvaluation {
    const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
    if (ranks[0] === ranks[1] && ranks[1] === ranks[2]) {
      return { rank_name: "三条", rank_level: 7, score: 7000 + ranks[0], multiplier: 1 };
    }
    if (ranks[0] === ranks[1] || ranks[1] === ranks[2] || ranks[0] === ranks[2]) {
      const pairRank = ranks[0] === ranks[1] ? ranks[0] : ranks[1];
      const kicker = ranks.find((r) => r !== pairRank) || 0;
      return { rank_name: "对子", rank_level: 2, score: 2000 + pairRank * 15 + kicker, multiplier: 1 };
    }
    return { rank_name: "高牌", rank_level: 1, score: 1000 + ranks[0] * 15 + ranks[1] * 3 + ranks[2], multiplier: 1 };
  }

  private evaluateSplit(split: SplitHands): HandEvaluation {
    const frontEval = this.eval3Cards(split.front);
    const middleEval = evaluate5Cards(split.middle);
    const backEval = evaluate5Cards(split.back);
    // 综合分：尾道权重最高
    const total = backEval.score * 10000 + middleEval.score * 100 + frontEval.score;
    return {
      rank_name: `尾:${backEval.rank_name}`,
      rank_level: backEval.rank_level,
      score: total,
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

  evaluateHand(cards: Card[]): HandEvaluation {
    if (cards.length < 13) return { rank_name: "十三水", rank_level: 0, score: 0, multiplier: 1 };
    return this.evaluateSplit(this.arrangeHands(cards));
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

    // 逐道比牌：每赢1道得1分，赢3道(sweep)得3分
    // 零和：net_amount 是净输赢（赌注已由stateMachine退款）
    const unit = state.room.base_score;
    const netScores: Record<string, number> = {};
    alive.forEach((s) => { netScores[s.user_id!] = 0; });

    for (let i = 0; i < alive.length; i++) {
      for (let j = i + 1; j < alive.length; j++) {
        const a = alive[i];
        const b = alive[j];
        const splitA = this.arrangeHands(a.cards);
        const splitB = this.arrangeHands(b.cards);

        const frontA = this.eval3Cards(splitA.front);
        const frontB = this.eval3Cards(splitB.front);
        const midA = evaluate5Cards(splitA.middle);
        const midB = evaluate5Cards(splitB.middle);
        const backA = evaluate5Cards(splitA.back);
        const backB = evaluate5Cards(splitB.back);

        let winsA = 0;
        if (frontA.score > frontB.score) winsA++; else if (frontA.score < frontB.score) winsA--;
        if (midA.score > midB.score) winsA++; else if (midA.score < midB.score) winsA--;
        if (backA.score > backB.score) winsA++; else if (backA.score < backB.score) winsA--;

        // winsA > 0: A赢了winsA道；winsA < 0: B赢了-winsA道
        netScores[a.user_id!] += winsA * unit;
        netScores[b.user_id!] -= winsA * unit;
      }
    }

    const results: PlayerNetResult[] = [];
    alive.forEach((s) => {
      results.push({
        user_id: s.user_id!,
        net_amount: netScores[s.user_id!] || 0,
        hand_name: "十三水",
      });
    });
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

/**
 * 掼蛋 (Guandan)
 * 4人两副牌，组队升级游戏
 * 牌力评估：按炸弹数、同花顺、连对、顺子、大牌数量综合评分
 * 注：完整出牌流程需要出牌引擎，此处为底池模式下的牌力比大小
 */
import { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Suit } from "../../shared/types.js";
import { ActionValidation, CompareResult, GamePlugin, HandEvaluation, PluginMeta, PluginRoundState, Seat } from "../plugin.interface.js";

export class GuandanPlugin implements GamePlugin {
  readonly game_type: GameType = "guandan";
  readonly name = "掼蛋";
  readonly supported_modes: GameMode[] = ["trick_taking"];

  readonly meta: PluginMeta = {
    gameId: "guandan", name: "掼蛋", cardCount: 27,
    supportSidePot: false, exchangeBased: true, minPlayers: 4, maxSeats: 4,
  };

  validateAction(_state: PluginRoundState, _seat: Seat, _action: any): ActionValidation {
    return { valid: true };
  }

  initDeck(): Card[] {
    const suits: Suit[] = ["S", "H", "C", "D"];
    // 两副牌 = 108张
    const deck: Card[] = [];
    for (let d = 0; d < 2; d++) {
      for (const suit of suits) {
        for (let rank = 1; rank <= 13; rank++) {
          deck.push({ suit, rank, code: `${suit}-${rank}-${d}` });
        }
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
    const active = state.seats.filter((s) => s.status === "playing" || s.status === "ready");
    for (const seat of active) {
      seat.cards = [];
      seat.status = "playing";
      seat.current_bet = ante;
      state.total_pot += ante;
      // 每人27张（108/4=27）
      for (let i = 0; i < 27; i++) if (state.deck.length > 0) seat.cards.push(state.deck.pop()!);
      seat.hand_result = this.evaluateHand(seat.cards);
    }
    state.current_highest_bet = ante;
    state.min_call_amount = ante;
    state.betting_round_count = 1;
  }

  /** 掼蛋牌力评估：统计炸弹、同花顺、连对、顺子、大牌 */
  evaluateHand(cards: Card[]): HandEvaluation {
    if (cards.length === 0) return { rank_name: "无牌", rank_level: 0, score: 0, multiplier: 1 };

    // 按点数分组
    const byRank = new Map<number, Card[]>();
    for (const c of cards) {
      if (!byRank.has(c.rank)) byRank.set(c.rank, []);
      byRank.get(c.rank)!.push(c);
    }

    let bombs = 0;        // 炸弹（4张同点）
    let fiveBombs = 0;    // 5张同点（更大的炸弹）
    let straightFlushes = 0; // 同花顺
    let maxSingleBomb = 0;

    // 统计炸弹
    for (const [rank, group] of byRank) {
      if (group.length >= 5) {
        fiveBombs++;
        maxSingleBomb = Math.max(maxSingleBomb, rank);
      } else if (group.length === 4) {
        bombs++;
        maxSingleBomb = Math.max(maxSingleBomb, rank);
      }
    }

    // 统计同花顺（5张同花色连续）
    const bySuit = new Map<Suit, Card[]>();
    for (const c of cards) {
      if (!bySuit.has(c.suit)) bySuit.set(c.suit, []);
      bySuit.get(c.suit)!.push(c);
    }
    for (const [, suitCards] of bySuit) {
      const ranks = new Set(suitCards.map((c) => c.rank));
      // 找连续5张
      const sorted = [...ranks].sort((a, b) => a - b);
      let run = 1;
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === sorted[i - 1] + 1) {
          run++;
          if (run >= 5) straightFlushes++;
        } else {
          run = 1;
        }
      }
    }

    // 统计连对（3对以上连续）
    let consecutivePairs = 0;
    const pairRanks: number[] = [];
    for (const [rank, group] of byRank) {
      if (group.length >= 2) pairRanks.push(rank);
    }
    pairRanks.sort((a, b) => a - b);
    let pairRun = 1;
    for (let i = 1; i < pairRanks.length; i++) {
      if (pairRanks[i] === pairRanks[i - 1] + 1) {
        pairRun++;
        if (pairRun >= 3) consecutivePairs++;
      } else {
        pairRun = 1;
      }
    }

    // 大牌分（A=14, K=13, Q=12, J=11 权重高）
    let bigCardScore = 0;
    for (const c of cards) {
      if (c.rank === 1) bigCardScore += 14;
      else if (c.rank >= 11) bigCardScore += c.rank;
    }

    // 综合评分
    const score = fiveBombs * 50000 + bombs * 10000 + straightFlushes * 5000 + consecutivePairs * 500 + bigCardScore + maxSingleBomb;

    let rankName = "普通牌型";
    if (fiveBombs > 0) rankName = `${fiveBombs}个5张炸`;
    else if (bombs >= 2) rankName = `${bombs}个炸弹`;
    else if (bombs === 1) rankName = "1个炸弹";
    else if (straightFlushes > 0) rankName = "同花顺";
    else if (consecutivePairs > 0) rankName = "连对";

    return {
      rank_name: rankName,
      rank_level: fiveBombs * 100 + bombs * 50 + straightFlushes * 20 + consecutivePairs * 5,
      score,
      multiplier: 1 + bombs + fiveBombs * 2,
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
    const alive = state.seats.filter((s) => s.status === "playing" && s.cards.length > 0);
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

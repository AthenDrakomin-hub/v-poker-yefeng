/**
 * 斗地主 (Dou Di Zhu)
 * 3人游戏：1地主2农民，54张牌(含大小王)
 * 流程：发牌→叫分(抢地主)→地主得3底牌→轮流出牌→先出完者胜
 * 牌型：火箭(双王)>炸弹(4同点)>单张>对子>三张>三带一>三带二>顺子≥5
 * 倍数：每出一次炸弹/火箭翻倍
 */
import { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Suit } from "../../shared/types.js";
import { ActionValidation, CompareResult, GamePlugin, HandEvaluation, PluginMeta, PluginRoundState, Seat } from "../plugin.interface.js";

export class DoudizhuPlugin implements GamePlugin {
  readonly game_type: GameType = "doudizhu";
  readonly name = "斗地主";
  readonly supported_modes: GameMode[] = ["trick_taking"];
  readonly meta: PluginMeta = {
    gameId: "doudizhu", name: "斗地主", cardCount: 17,
    supportSidePot: false, exchangeBased: true, minPlayers: 3, maxSeats: 3,
  };

  validateAction(_state: PluginRoundState, _seat: Seat, _action: GameAction): ActionValidation {
    return { valid: true };
  }

  initDeck(): Card[] {
    const suits: Suit[] = ["S", "H", "C", "D"];
    const deck: Card[] = [];
    for (const suit of suits) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({ suit, rank, code: `${suit}-${rank}` });
      }
    }
    deck.push({ suit: "S", rank: 15, code: "BJ" }); // 小王
    deck.push({ suit: "S", rank: 16, code: "RJ" }); // 大王
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  dealCards(state: PluginRoundState): void {
    const active = state.seats.filter((s) => s.status === "playing" || s.status === "ready");
    for (const seat of active) {
      seat.cards = [];
      seat.status = "playing";
      seat.current_bet = 0;
      for (let i = 0; i < 17; i++) {
        if (state.deck.length > 0) seat.cards.push(state.deck.pop()!);
      }
      seat.hand_result = this.evaluateHand(seat.cards);
    }
    state.community_cards = state.deck.splice(0, 3);
    state.betting_round_count = 1;
    // 存储当前出牌数据
    (state as any).lastPlayed = null; // { seat_index, cards: Card[] }
    (state as any).bombCount = 0;
  }

  handleAction(state: PluginRoundState, action: GameAction): { success: boolean; error?: string } {
    const seat = state.seats.find((s) => s.user_id === action.user_id);
    if (!seat) return { success: false, error: "Seat not found." };

    // 叫分阶段
    if (state.phase === "QIANG_ZHUANG") {
      if (action.action_type === "qiang_zhuang") {
        if (state.banker_seat_index === null) {
          state.banker_seat_index = seat.seat_index;
          seat.is_banker = true;
          seat.cards = [...seat.cards, ...state.community_cards];
        }
        seat.has_acted = true;
        return { success: true };
      }
      if (action.action_type === "fold" || action.action_type === "pass") {
        seat.has_acted = true;
        return { success: true };
      }
    }

    // 出牌阶段
    if (state.phase === "BETTING") {
      // pass：不出牌
      if (action.action_type === "pass") {
        seat.has_acted = true;
        return { success: true };
      }
      // play：出牌，cards在action里
      if (action.action_type === "play" || action.action_type === "bet") {
        const playedCards = (action as any).cards as Card[] || [];
        if (playedCards.length === 0) return { success: false, error: "No cards played" };
        // 校验牌都在玩家手里
        for (const c of playedCards) {
          const idx = seat.cards.findIndex((sc) => sc.code === c.code);
          if (idx === -1) return { success: false, error: `Card ${c.code} not in hand` };
          seat.cards.splice(idx, 1);
        }
        // 记录
        (state as any).lastPlayed = { seat_index: seat.seat_index, cards: playedCards };
        // 炸弹计数
        if (this.isBomb(playedCards)) {
          (state as any).bombCount = ((state as any).bombCount || 0) + 1;
        }
        seat.has_acted = true;
        // 出完了？
        if (seat.cards.length === 0) {
          (state as any).winnerSeat = seat.seat_index;
        }
        return { success: true };
      }
    }

    return { success: false, error: `Unknown action: ${action.action_type}` };
  }

  private isBomb(cards: Card[]): boolean {
    if (cards.length === 4 && cards.every((c) => c.rank === cards[0].rank)) return true;
    if (cards.length === 2 && cards[0].rank === 15 && cards[1].rank === 16) return true; // 火箭
    return false;
  }

  evaluateHand(cards: Card[]): HandEvaluation {
    if (cards.length === 0) return { rank_name: "无牌", rank_level: 0, score: 0, multiplier: 1 };
    const byRank = new Map<number, number>();
    for (const c of cards) byRank.set(c.rank, (byRank.get(c.rank) || 0) + 1);
    let bombs = 0, rockets = 0;
    for (const [rank, count] of byRank) {
      if (count === 4) bombs++;
      if (rank === 15 && byRank.has(16)) rockets = 1;
    }
    return {
      rank_name: cards.length === 20 ? "地主20张" : `${cards.length}张`,
      rank_level: bombs * 10 + rockets * 20,
      score: cards.length,
      multiplier: 1 + bombs + rockets * 2,
    };
  }

  compareHands(state: PluginRoundState): CompareResult {
    const winner = (state as any).winnerSeat;
    if (winner !== undefined && winner !== null) {
      const s = state.seats[winner];
      return { winner_user_ids: [s.user_id!], rankings: [{ user_id: s.user_id!, seat_index: winner, evaluation: s.hand_result! }] };
    }
    // 兜底：剩牌最少的赢
    const alive = state.seats.filter((s) => s.status !== "empty");
    alive.sort((a, b) => a.cards.length - b.cards.length);
    return { winner_user_ids: [alive[0]?.user_id || ""], rankings: alive.map((s) => ({ user_id: s.user_id!, seat_index: s.seat_index, evaluation: s.hand_result! })) };
  }

  calculateNetScores(state: PluginRoundState): PlayerNetResult[] {
    const unit = state.room.base_score;
    const results: PlayerNetResult[] = [];
    const alive = state.seats.filter((s) => s.status !== "empty");
    const bombMult = Math.pow(2, (state as any).bombCount || 0);

    const landlord = alive.find((s) => s.is_banker);
    const farmers = alive.filter((s) => !s.is_banker);
    const winnerSeat = (state as any).winnerSeat;

    if (winnerSeat === undefined || winnerSeat === null) {
      // 没人出完（超时兜底），按剩牌少的
      const comp = this.compareHands(state);
      const winnerId = comp.winner_user_ids[0];
      for (const s of alive) {
        results.push({ user_id: s.user_id!, net_amount: s.user_id === winnerId ? unit : -unit, hand_name: "超时结算" });
      }
      return results;
    }

    const winner = state.seats[winnerSeat];
    if (landlord && winner.is_banker) {
      // 地主赢
      results.push({ user_id: winner.user_id!, net_amount: unit * farmers.length * bombMult, hand_name: "地主胜" });
      for (const f of farmers) results.push({ user_id: f.user_id!, net_amount: -unit * bombMult, hand_name: "农民负" });
    } else {
      // 农民赢
      results.push({ user_id: landlord!.user_id!, net_amount: -unit * farmers.length * bombMult, hand_name: "地主负" });
      for (const f of farmers) results.push({ user_id: f.user_id!, net_amount: unit * bombMult, hand_name: "农民胜" });
    }
    return results;
  }

  getActionSeats(state: PluginRoundState): Seat[] {
    // 地主先出牌
    if (state.phase === "BETTING") {
      const landlord = state.seats.find((s) => s.is_banker);
      if (landlord && !(state as any).lastPlayed) return [landlord];
      // 否则按座位顺序轮转（简化：返回所有未出完牌的）
      return state.seats.filter((s) => s.status === "playing" && s.cards.length > 0);
    }
    return state.seats.filter((s) => s.status === "playing").sort((a, b) => a.seat_index - b.seat_index);
  }

  isPhaseComplete(state: PluginRoundState): boolean {
    if (state.phase === "QIANG_ZHUANG") {
      const alive = state.seats.filter((s) => s.status === "playing");
      return alive.every((s) => s.has_acted || s.is_banker);
    }
    if (state.phase === "BETTING") {
      // 有人出完牌
      return (state as any).winnerSeat !== undefined && (state as any).winnerSeat !== null;
    }
    return true;
  }

  getNextPhase(state: PluginRoundState): RoundPhase {
    if (state.phase === "WAITING") return "DEALING";
    if (state.phase === "DEALING") return "QIANG_ZHUANG";
    if (state.phase === "QIANG_ZHUANG") return "BETTING";
    if (state.phase === "BETTING") return "SHOWDOWN";
    if (state.phase === "SHOWDOWN") return "SETTLING";
    if (state.phase === "SETTLING") return "FINISHED";
    return "FINISHED";
  }
}

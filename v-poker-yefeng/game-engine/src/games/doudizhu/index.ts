/**
 * 斗地主 (Dou Di Zhu)
 * 3人游戏：1地主2农民，54张牌(含大小王)
 * 牌型：火箭(双王)>炸弹(4同点)>单张>对子>三张>三带一>三带二>顺子>连对>飞机
 * 牌点：大王>小王>2>A>K>...>3
 * 流程：发牌→叫分(抢地主)→地主得3底牌→比牌力定胜负
 */
import { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Suit } from "../../shared/types.js";
import { CompareResult, GamePlugin, HandEvaluation, PluginRoundState, Seat } from "../plugin.interface.js";

export class DoudizhuPlugin implements GamePlugin {
  readonly game_type: GameType = "doudizhu";
  readonly name = "斗地主";
  readonly supported_modes: GameMode[] = ["trick_taking"];

  initDeck(): Card[] {
    const suits: Suit[] = ["S", "H", "C", "D"];
    const deck: Card[] = [];
    for (const suit of suits) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({ suit, rank, code: `${suit}-${rank}` });
      }
    }
    deck.push({ suit: "S", rank: 15, code: "BJ" });
    deck.push({ suit: "S", rank: 16, code: "RJ" });
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
  }

  handleAction(state: PluginRoundState, action: GameAction): { success: boolean; error?: string } {
    const seat = state.seats.find((s) => s.user_id === action.user_id);
    if (!seat) return { success: false, error: "Seat not found." };
    if (action.action_type === "qiang_zhuang") {
      if (state.banker_seat_index === null) {
        state.banker_seat_index = seat.seat_index;
        seat.is_banker = true;
        seat.cards = [...seat.cards, ...state.community_cards];
        seat.hand_result = this.evaluateHand(seat.cards);
      }
      seat.has_acted = true;
      return { success: true };
    }
    if (action.action_type === "fold") { seat.status = "folded"; seat.has_acted = true; return { success: true }; }
    if (action.action_type === "check" || action.action_type === "call") { seat.has_acted = true; return { success: true }; }
    return { success: false, error: `Unknown: ${action.action_type}` };
  }

  evaluateHand(cards: Card[]): HandEvaluation {
    if (cards.length === 0) return { rank_name: "无牌", rank_level: 0, score: 0, multiplier: 1 };
    const byRank = new Map<number, Card[]>();
    for (const c of cards) {
      if (!byRank.has(c.rank)) byRank.set(c.rank, []);
      byRank.get(c.rank)!.push(c);
    }
    let rockets = 0, bombs = 0, threeKinds = 0, pairs = 0, bigScore = 0;
    for (const [rank, group] of byRank) {
      if (group.length === 4) { bombs++; bigScore += rank * 50; }
      else if (group.length === 3) { threeKinds++; bigScore += rank * 10; }
      else if (group.length === 2) { pairs++; bigScore += rank * 2; }
      if (rank === 16) bigScore += 1000;
      if (rank === 15) bigScore += 500;
    }
    if (byRank.has(15) && byRank.has(16)) rockets = 1;
    const uniqueRanks = [...byRank.keys()].filter((r) => r <= 13).sort((a, b) => a - b);
    let straights = 0, run = 1;
    for (let i = 1; i < uniqueRanks.length; i++) {
      if (uniqueRanks[i] === uniqueRanks[i - 1] + 1) { run++; if (run >= 5) straights++; }
      else run = 1;
    }
    const score = rockets * 50000 + bombs * 10000 + threeKinds * 500 + pairs * 50 + straights * 200 + bigScore;
    let name = "普通";
    if (rockets > 0) name = "火箭!";
    else if (bombs > 0) name = `${bombs}个炸弹`;
    else if (threeKinds > 0) name = `${threeKinds}个三张`;
    return { rank_name: name, rank_level: rockets * 100 + bombs * 50 + threeKinds * 10, score, multiplier: 1 + bombs + rockets * 2 };
  }

  compareHands(state: PluginRoundState): CompareResult {
    const alive = state.seats.filter((s) => s.status !== "empty" && s.status !== "folded");
    const rankings = alive.map((s) => ({ user_id: s.user_id!, seat_index: s.seat_index, evaluation: s.hand_result || this.evaluateHand(s.cards) }));
    rankings.sort((a, b) => b.evaluation.score - a.evaluation.score);
    return { winner_user_ids: rankings.length > 0 ? [rankings[0].user_id] : [], rankings };
  }

  calculateNetScores(state: PluginRoundState): PlayerNetResult[] {
    const unit = state.room.base_score;
    const results: PlayerNetResult[] = [];
    const alive = state.seats.filter((s) => s.status !== "empty" && s.status !== "folded");
    const landlord = alive.find((s) => s.is_banker);
    if (!landlord) {
      const comp = this.compareHands(state);
      const winnerId = comp.winner_user_ids[0];
      for (const s of alive) {
        results.push({ user_id: s.user_id!, net_amount: s.user_id === winnerId ? unit * (alive.length - 1) : -unit, hand_name: s.hand_result?.rank_name || "?" });
      }
      return results;
    }
    const farmers = alive.filter((s) => !s.is_banker);
    const landlordEval = landlord.hand_result || this.evaluateHand(landlord.cards);
    const farmersAvgScore = farmers.reduce((sum, f) => sum + (f.hand_result?.score || this.evaluateHand(f.cards).score), 0) / Math.max(1, farmers.length);
    const maxMult = Math.max(landlordEval.multiplier, ...farmers.map((f) => f.hand_result?.multiplier || 1));
    if (landlordEval.score > farmersAvgScore) {
      results.push({ user_id: landlord.user_id!, net_amount: unit * farmers.length * maxMult, hand_name: landlordEval.rank_name });
      for (const f of farmers) results.push({ user_id: f.user_id!, net_amount: -unit * maxMult, hand_name: f.hand_result?.rank_name || "?" });
    } else {
      results.push({ user_id: landlord.user_id!, net_amount: -unit * farmers.length * maxMult, hand_name: landlordEval.rank_name });
      for (const f of farmers) results.push({ user_id: f.user_id!, net_amount: unit * maxMult, hand_name: f.hand_result?.rank_name || "?" });
    }
    return results;
  }

  getActionSeats(state: PluginRoundState): Seat[] {
    if (state.phase === "QIANG_ZHUANG") return state.seats.filter((s) => s.status === "playing" && !s.is_banker).sort((a, b) => a.seat_index - b.seat_index);
    return state.seats.filter((s) => s.status === "playing").sort((a, b) => a.seat_index - b.seat_index);
  }

  isPhaseComplete(state: PluginRoundState): boolean {
    if (state.phase === "QIANG_ZHUANG") return state.seats.filter((s) => s.status === "playing").every((s) => s.has_acted || s.is_banker);
    const alive = state.seats.filter((s) => s.status === "playing");
    if (alive.length <= 1) return true;
    return alive.every((s) => s.has_acted);
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

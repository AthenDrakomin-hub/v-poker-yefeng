/**
 * 红五 (Hong Wu / Red Five)
 * 升级类游戏，红桃5和方块5是特殊牌
 * 牌力：红五数量、炸弹、大牌综合评分
 */
import { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Suit } from "../../shared/types.js";
import { ActionValidation, CompareResult, GamePlugin, HandEvaluation, PluginMeta, PluginRoundState, Seat } from "../plugin.interface.js";

export class HongWuPlugin implements GamePlugin {
  readonly game_type: GameType = "hong_wu";
  readonly name = "红五";
  readonly supported_modes: GameMode[] = ["trick_taking"];

  readonly meta: PluginMeta = {
    gameId: "hong_wu", name: "红五", cardCount: 27,
    supportSidePot: false, exchangeBased: true, minPlayers: 4, maxSeats: 4,
  };

  validateAction(_state: PluginRoundState, _seat: Seat, _action: any): ActionValidation {
    return { valid: true };
  }

  initDeck(): Card[] {
    const suits: Suit[] = ["S", "H", "C", "D"];
    const deck: Card[] = [];
    for (let d = 0; d < 2; d++)
      for (const suit of suits)
        for (let rank = 1; rank <= 13; rank++)
          deck.push({ suit, rank, code: `${suit}-${rank}-${d}` });
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
      for (let i = 0; i < 27; i++) if (state.deck.length > 0) seat.cards.push(state.deck.pop()!);
      seat.hand_result = this.evaluateHand(seat.cards);
    }
    state.current_highest_bet = ante;
    state.min_call_amount = ante;
    state.betting_round_count = 1;
  }

  evaluateHand(cards: Card[]): HandEvaluation {
    if (cards.length === 0) return { rank_name: "无牌", rank_level: 0, score: 0, multiplier: 1 };
    // 红五 = 红桃5(H)和方块5(D)，是特殊大牌
    let redFives = 0;
    for (const c of cards) {
      if (c.rank === 5 && (c.suit === "H" || c.suit === "D")) redFives++;
    }
    const byRank = new Map<number, Card[]>();
    for (const c of cards) {
      if (!byRank.has(c.rank)) byRank.set(c.rank, []);
      byRank.get(c.rank)!.push(c);
    }
    let bombs = 0, threeKind = 0, pairs = 0;
    for (const [, g] of byRank) {
      if (g.length >= 4) bombs++;
      else if (g.length === 3) threeKind++;
      else if (g.length === 2) pairs++;
    }
    let bigScore = 0;
    for (const c of cards) if (c.rank === 1 || c.rank >= 11) bigScore += c.rank === 1 ? 14 : c.rank;

    const score = redFives * 8000 + bombs * 10000 + threeKind * 300 + pairs * 50 + bigScore;
    let name = "普通";
    if (redFives >= 2) name = `${redFives}个红五+${bombs}炸`;
    else if (redFives === 1) name = `1个红五+${bombs}炸`;
    else if (bombs > 0) name = `${bombs}个炸弹`;
    return { rank_name: name, rank_level: redFives * 50 + bombs * 40 + threeKind * 5, score, multiplier: 1 + redFives + bombs };
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

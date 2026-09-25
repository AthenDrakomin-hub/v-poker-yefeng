/**
 * 奥马哈扑克 (Omaha Hold'em)
 * 4张底牌，必须选2张 + 3张公共牌组合最佳5张
 */
import { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Seat, SidePot } from "../../shared/types.js";
import { ActionValidation, CompareResult, GamePlugin, HandEvaluation, PluginMeta, PluginRoundState, Seat } from "../plugin.interface.js";
import { evaluate5Cards, getCombinations } from "../texas_holdem/evaluator.js";
import { createStandardDeck, shuffleDeck } from "../texas_holdem/deck.js";

export class OmahaPlugin implements GamePlugin {
  readonly game_type: GameType = "omaha";
  readonly name = "奥马哈";
  readonly supported_modes: GameMode[] = ["fixed_limit"];

  readonly meta: PluginMeta = {
    gameId: "omaha", name: "奥马哈", cardCount: 4,
    supportSidePot: true, exchangeBased: false, minPlayers: 2, maxSeats: 9,
  };

  validateAction(_state: PluginRoundState, _seat: Seat, _action: any): ActionValidation {
    return { valid: true };
  }

  initDeck(): Card[] {
    return shuffleDeck(createStandardDeck());
  }

  dealCards(state: PluginRoundState): void {
    const activeSeats = state.seats.filter((s) => s.status === "playing" || s.status === "ready");
    activeSeats.forEach((seat) => {
      seat.cards = [];
      seat.status = "playing";
      seat.current_bet = 0;
      seat.has_acted = false;
    });
    // 每人4张底牌
    for (let r = 0; r < 4; r++) {
      for (const seat of activeSeats) {
        if (state.deck.length > 0) seat.cards.push(state.deck.pop()!);
      }
    }
    const sb = Math.floor(state.room.base_score / 2);
    const bb = state.room.base_score;
    if (activeSeats.length >= 2) {
      activeSeats[0].current_bet = sb;
      activeSeats[1].current_bet = bb;
      state.total_pot = sb + bb;
      state.current_highest_bet = bb;
      state.min_call_amount = bb;
      state.current_turn_seat_index = activeSeats.length > 2 ? activeSeats[2].seat_index : activeSeats[0].seat_index;
    }
    state.community_cards = [];
    state.betting_round_count = 1;
  }

  dealCommunityCards(state: PluginRoundState): void {
    if (state.betting_round_count === 2) {
      if (state.deck.length > 0) state.deck.pop();
      for (let i = 0; i < 3; i++) if (state.deck.length > 0) state.community_cards.push(state.deck.pop()!);
    } else if (state.betting_round_count === 3) {
      if (state.deck.length > 0) state.deck.pop();
      if (state.deck.length > 0) state.community_cards.push(state.deck.pop()!);
    } else if (state.betting_round_count === 4) {
      if (state.deck.length > 0) state.deck.pop();
      if (state.deck.length > 0) state.community_cards.push(state.deck.pop()!);
    }
    state.seats.forEach((seat) => {
      if (seat.status === "playing" && seat.cards.length === 4) {
        seat.hand_result = this.evaluateHand(seat.cards, state.community_cards);
      }
    });
  }

  handleAction(state: PluginRoundState, action: GameAction): { success: boolean; error?: string } {
    const seat = state.seats.find((s) => s.user_id === action.user_id);
    if (!seat) return { success: false, error: "Seat not found." };
    if (seat.status !== "playing") return { success: false, error: "Not playing." };
    if (action.action_type === "fold") { seat.status = "folded"; seat.has_acted = true; return { success: true }; }
    if (action.action_type === "call") {
      const diff = state.current_highest_bet - seat.current_bet;
      if (diff > 0) { seat.current_bet += diff; state.total_pot += diff; }
      seat.has_acted = true; return { success: true };
    }
    if (action.action_type === "check") {
      if (seat.current_bet < state.current_highest_bet) return { success: false, error: "Cannot check." };
      seat.has_acted = true; return { success: true };
    }
    if (action.action_type === "bet" || action.action_type === "raise") {
      const add = action.amount || state.min_call_amount;
      seat.current_bet += add; state.total_pot += add;
      state.current_highest_bet = Math.max(state.current_highest_bet, seat.current_bet);
      seat.has_acted = true; return { success: true };
    }
    if (action.action_type === "all_in") {
      const allIn = seat.chips;
      seat.current_bet += allIn; state.total_pot += allIn;
      seat.chips = 0; seat.status = "all_in";
      state.current_highest_bet = Math.max(state.current_highest_bet, seat.current_bet);
      seat.has_acted = true; return { success: true };
    }
    return { success: false, error: `Unknown action: ${action.action_type}` };
  }

  evaluateHand(cards: Card[], communityCards?: Card[]): HandEvaluation {
    const comm = communityCards || [];
    if (cards.length < 4 || comm.length < 3) {
      const all = [...cards, ...comm];
      if (all.length < 5) return { rank_name: "高牌", rank_level: 0, score: 0, multiplier: 1 };
      return this.best5(all);
    }
    // 枚举 C(4,2)*C(5,3)=60 种组合
    let best: HandEvaluation = { rank_name: "高牌", rank_level: 0, score: 0, multiplier: 1 };
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      for (let a = 0; a < comm.length; a++) for (let b = a + 1; b < comm.length; b++) for (let c = b + 1; c < comm.length; c++) {
        const r = evaluate5Cards([cards[i], cards[j], comm[a], comm[b], comm[c]]);
        if (r.score > best.score) best = r;
      }
    }
    return best;
  }

  private best5(cards: Card[]): HandEvaluation {
    let best: HandEvaluation = { rank_name: "高牌", rank_level: 0, score: 0, multiplier: 1 };
    for (const combo of getCombinations(cards, 5)) {
      const r = evaluate5Cards(combo);
      if (r.score > best.score) best = r;
    }
    return best;
  }

  compareHands(state: PluginRoundState): CompareResult {
    const alive = state.seats.filter((s) => (s.status === "playing" || s.status === "all_in") && s.cards.length === 4);
    const rankings = alive.map((s) => ({
      user_id: s.user_id!, seat_index: s.seat_index,
      evaluation: s.hand_result || this.evaluateHand(s.cards, state.community_cards),
    }));
    rankings.sort((a, b) => b.evaluation.score - a.evaluation.score);
    return { winner_user_ids: rankings.length > 0 ? [rankings[0].user_id] : [], rankings };
  }

  calculateNetScores(state: PluginRoundState): PlayerNetResult[] {
    const active = state.seats.filter((s) => s.user_id && s.current_bet > 0 && s.status !== "folded");
    if (active.length === 0) return [];
    const pots = this.calcSidePots(state);
    state.side_pots = pots;
    const nets: Record<string, number> = {};
    const bets: Record<string, number> = {};
    const names: Record<string, string> = {};
    active.forEach((s) => { nets[s.user_id!] = -s.current_bet; bets[s.user_id!] = s.current_bet; names[s.user_id!] = s.hand_result?.rank_name || "未评估"; });
    for (const pot of pots) {
      const contenders = active.filter((s) => pot.eligible_user_ids.includes(s.user_id!));
      if (contenders.length === 0) continue;
      contenders.sort((a, b) => {
        const ea = a.hand_result || this.evaluateHand(a.cards, state.community_cards);
        const eb = b.hand_result || this.evaluateHand(b.cards, state.community_cards);
        return eb.score - ea.score;
      });
      const top = (contenders[0].hand_result || this.evaluateHand(contenders[0].cards, state.community_cards)).score;
      const winners = contenders.filter((s) => {
        const ev = s.hand_result || this.evaluateHand(s.cards, state.community_cards);
        return ev.score === top;
      });
      const share = Math.floor(pot.amount / winners.length);
      const rem = pot.amount - share * winners.length;
      winners.forEach((w, i) => { nets[w.user_id!] += share + (i < rem ? 1 : 0); });
    }
    const results: PlayerNetResult[] = [];
    state.seats.forEach((s) => {
      if (!s.user_id || s.current_bet <= 0) return;
      results.push({
        user_id: s.user_id,
        net_amount: s.status === "folded" ? -s.current_bet : (nets[s.user_id] || 0),
        bet_total: bets[s.user_id] || s.current_bet,
        hand_name: names[s.user_id] || (s.status === "folded" ? "弃牌" : "未评估"),
      });
    });
    return results;
  }

  private calcSidePots(state: PluginRoundState): SidePot[] {
    const players = state.seats.filter((s) => s.user_id && s.current_bet > 0 && s.status !== "folded");
    if (players.length === 0) return [];
    const levels = [...new Set(players.map((p) => p.current_bet))].sort((a, b) => a - b);
    const pots: SidePot[] = [];
    let prev = 0;
    for (const level of levels) {
      const contributors = players.filter((p) => p.current_bet >= level);
      const amount = (level - prev) * contributors.length;
      if (amount > 0) pots.push({ amount, eligible_user_ids: contributors.map((c) => c.user_id!) });
      prev = level;
    }
    return pots;
  }

  getActionSeats(state: PluginRoundState): Seat[] {
    if (state.phase !== "BETTING") return [];
    return state.seats.filter((s) => s.status === "playing").sort((a, b) => a.seat_index - b.seat_index);
  }

  isPhaseComplete(state: PluginRoundState): boolean {
    const alive = state.seats.filter((s) => s.status === "playing");
    if (alive.length <= 1) return true;
    if (state.phase === "BETTING") return alive.every((s) => s.has_acted && s.current_bet === state.current_highest_bet);
    return true;
  }

  getNextPhase(state: PluginRoundState): RoundPhase {
    const alive = state.seats.filter((s) => s.status === "playing" || s.status === "all_in");
    if (alive.length <= 1) return "SHOWDOWN";
    if (state.phase === "WAITING") return "DEALING";
    if (state.phase === "DEALING") return "BETTING";
    if (state.phase === "BETTING") {
      if (state.betting_round_count < 4) {
        state.betting_round_count++;
        this.dealCommunityCards(state);
        alive.forEach((s) => { s.has_acted = false; });
        const first = alive.find((s) => s.status === "playing");
        if (first) state.current_turn_seat_index = first.seat_index;
        return "BETTING";
      }
      return "SHOWDOWN";
    }
    if (state.phase === "SHOWDOWN") return "SETTLING";
    if (state.phase === "SETTLING") return "FINISHED";
    return "FINISHED";
  }
}

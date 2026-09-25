/**
 * 掼蛋 (Guandan)
 * 4人两副牌(108张)，组队对抗(0&2 vs 1&3)
 * 流程：发牌→轮流出牌(play/pass)→先出完牌的一队胜
 * 牌型：单张/对子/三张/顺子/连对/三带二/炸弹(4张)/同花顺(5张)
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
    const active = state.seats.filter((s) => s.status === "playing" || s.status === "ready");
    for (const seat of active) {
      seat.cards = [];
      seat.status = "playing";
      seat.current_bet = 0;
      for (let i = 0; i < 27; i++) if (state.deck.length > 0) seat.cards.push(state.deck.pop()!);
      seat.hand_result = this.evaluateHand(seat.cards);
    }
    state.betting_round_count = 1;
    (state as any).lastPlayed = null;
    (state as any).bombCount = 0;
    (state as any).winnerSeat = null;
  }

  handleAction(state: PluginRoundState, action: GameAction): { success: boolean; error?: string } {
    const seat = state.seats.find((s) => s.user_id === action.user_id);
    if (!seat) return { success: false, error: "Seat not found." };
    if (seat.status !== "playing") return { success: false, error: "Not playing." };

    if (action.action_type === "pass") {
      seat.has_acted = true;
      return { success: true };
    }
    if (action.action_type === "play" || action.action_type === "bet") {
      const playedCards = (action as any).cards as Card[] || [];
      if (playedCards.length === 0) return { success: false, error: "No cards played" };
      for (const c of playedCards) {
        const idx = seat.cards.findIndex((sc) => sc.code === c.code);
        if (idx === -1) return { success: false, error: `Card ${c.code} not in hand` };
        seat.cards.splice(idx, 1);
      }
      (state as any).lastPlayed = { seat_index: seat.seat_index, cards: playedCards };
      if (this.isBomb(playedCards)) (state as any).bombCount++;
      seat.has_acted = true;
      if (seat.cards.length === 0) (state as any).winnerSeat = seat.seat_index;
      return { success: true };
    }
    return { success: false, error: `Unknown: ${action.action_type}` };
  }

  private isBomb(cards: Card[]): boolean {
    if (cards.length === 4 && cards.every((c) => c.rank === cards[0].rank)) return true;
    // 同花顺5张
    if (cards.length >= 5) {
      const suit = cards[0].suit;
      const ranks = cards.map((c) => c.rank).sort((a, b) => a - b);
      if (cards.every((c) => c.suit === suit)) {
        let straight = true;
        for (let i = 1; i < ranks.length; i++) if (ranks[i] !== ranks[i-1] + 1) straight = false;
        if (straight) return true;
      }
    }
    return false;
  }

  evaluateHand(cards: Card[]): HandEvaluation {
    if (cards.length === 0) return { rank_name: "无牌", rank_level: 0, score: 0, multiplier: 1 };
    const byRank = new Map<number, number>();
    for (const c of cards) byRank.set(c.rank, (byRank.get(c.rank) || 0) + 1);
    let bombs = 0;
    for (const [, count] of byRank) if (count >= 4) bombs++;
    return {
      rank_name: `${cards.length}张`,
      rank_level: bombs * 10,
      score: cards.length,
      multiplier: 1 + bombs,
    };
  }

  compareHands(state: PluginRoundState): CompareResult {
    const winner = (state as any).winnerSeat;
    if (winner !== null && winner !== undefined) {
      const s = state.seats[winner];
      return { winner_user_ids: [s.user_id!], rankings: [{ user_id: s.user_id!, seat_index: winner, evaluation: s.hand_result! }] };
    }
    const alive = state.seats.filter((s) => s.status === "playing" && s.cards.length > 0);
    alive.sort((a, b) => a.cards.length - b.cards.length);
    return { winner_user_ids: [alive[0]?.user_id || ""], rankings: alive.map((s) => ({ user_id: s.user_id!, seat_index: s.seat_index, evaluation: s.hand_result! })) };
  }

  calculateNetScores(state: PluginRoundState): PlayerNetResult[] {
    const unit = state.room.base_score;
    const results: PlayerNetResult[] = [];
    const alive = state.seats.filter((s) => s.status === "playing");
    const bombMult = Math.pow(2, (state as any).bombCount || 0);
    const winnerSeat = (state as any).winnerSeat;

    if (winnerSeat === null || winnerSeat === undefined) {
      const comp = this.compareHands(state);
      const winnerId = comp.winner_user_ids[0];
      for (const s of alive) {
        results.push({ user_id: s.user_id!, net_amount: s.user_id === winnerId ? unit : -unit, hand_name: "超时" });
      }
      return results;
    }

    // 组队：0&2一队，1&3一队
    const winnerTeam = winnerSeat % 2;
    for (const s of alive) {
      const isWinnerTeam = s.seat_index % 2 === winnerTeam;
      results.push({
        user_id: s.user_id!,
        net_amount: isWinnerTeam ? unit * bombMult : -unit * bombMult,
        hand_name: isWinnerTeam ? "胜" : "负",
      });
    }
    return results;
  }

  getActionSeats(state: PluginRoundState): Seat[] {
    return state.seats.filter((s) => s.status === "playing" && s.cards.length > 0);
  }

  isPhaseComplete(state: PluginRoundState): boolean {
    if (state.phase === "BETTING") {
      return (state as any).winnerSeat !== null && (state as any).winnerSeat !== undefined;
    }
    return true;
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

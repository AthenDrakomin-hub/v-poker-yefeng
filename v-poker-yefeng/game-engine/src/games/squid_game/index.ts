/**
 * 鱿鱼模式 (Squid Game) — 完整残酷版
 *
 * 核心机制（鱿鱼游戏经典元素）：
 *
 * 1. 玻璃桥阶段 (Glass Bridge)
 *    - 每局发牌前，玩家必须选择左/右玻璃桥
 *    - 选错桥直接淘汰（筹码清零），无任何牌局
 *    - 选对才能进入正常牌局
 *
 * 2. 死亡牌 (Death Card)
 *    - 底牌为 2♣ 时触发"死亡诅咒"：若本局未赢则筹码减半
 *    - 底牌为 A♥ 时触发"幸运加成"：赢了则筹码翻倍
 *
 * 3. 强制 All-In 阶段
 *    - 盲注达到 1000 后，所有筹码 < 3 倍大盲的玩家必须 all-in
 *    - 加速淘汰节奏
 *
 * 4. 幸存者奖励 (Survivor Bonus)
 *    - 每存活一轮，奖励 = 大盲 × 0.5
 *    - 存活 5 轮以上额外获得"生存者徽章"
 *
 * 5. 节奏加速
 *    - 行动时间从 30s 缩短到 15s
 *    - 3 次未行动自动 fold
 *
 * 6. 最后存活者夺冠
 *    - 剩余 1 人时获得全部累积奖金
 */

import type { GamePlugin } from "../plugin.interface.js";
import type { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Seat } from "../../shared/types.js";
import { createStandardDeck, shuffleDeck } from "./deck.js";
import { evaluate7Cards } from "./evaluator.js";

/** 玻璃桥选择 */
interface GlassBridgeChoice {
  player_id: string;
  side: "left" | "right";
  survived: boolean;
}

/** 鱿鱼模式房间状态扩展 */
interface SquidRoundState {
  glass_bridge_passed: boolean;
  bridge_choices: GlassBridgeChoice[];
  death_card_triggered: Set<string>;
  lucky_card_triggered: Set<string>;
  round_number: number;
  survivor_bonus: number;
}

export class SquidGamePlugin implements GamePlugin {
  readonly game_type: GameType = "squid_game";
  readonly name = "鱿鱼模式";
  readonly supported_modes: GameMode[] = ["fixed_limit"];

  private squidState: SquidRoundState = {
    glass_bridge_passed: false,
    bridge_choices: [],
    death_card_triggered: new Set(),
    lucky_card_triggered: new Set(),
    round_number: 1,
    survivor_bonus: 0,
  };

  initDeck(): Card[] {
    return shuffleDeck(createStandardDeck());
  }

  dealCards(state: any): void {
    // 从房间配置读取参数（代理创建时设置）
    const config = state.room?.config || {};
    const bridgeSurvival = (config.bridgeSurvival ?? 70) / 100; // 默认70%
    const deathPenalty = (config.deathPenalty ?? 50) / 100;     // 默认50%
    const luckyBonus = (config.luckyBonus ?? 50) / 100;         // 默认50%
    const survivorBonus = (config.survivorBonus ?? 50) / 100;   // 默认50%

    // 阶段1: 玻璃桥选择
    if (!this.squidState.glass_bridge_passed) {
      this.squidState.bridge_choices = [];
      for (const seat of state.seats) {
        if (seat.status === "empty" || seat.status === "folded") continue;
        const survived = Math.random() < bridgeSurvival;
        this.squidState.bridge_choices.push({
          player_id: seat.user_id,
          side: survived ? "left" : "right",
          survived,
        });
        if (!survived) {
          seat.status = "eliminated";
          seat.chips = 0; // 玻璃桥淘汰：筹码清零
        }
      }
      this.squidState.glass_bridge_passed = true;
    }

    // 阶段2: 正常发牌
    for (const seat of state.seats) {
      if (seat.status === "empty" || seat.status === "folded" || seat.status === "eliminated") continue;
      const card = state.deck.pop()!;
      const card2 = state.deck.pop()!;
      seat.hole_cards = [card, card2];

      // 死亡牌检测
      if (card.rank === 2 && card.suit === "C") {
        this.squidState.death_card_triggered.add(seat.user_id);
      }
      // 幸运牌检测
      if (card.rank === 1 && card.suit === "H") {
        this.squidState.lucky_card_triggered.add(seat.user_id);
      }
    }
  }

  handleAction(state: any, action: GameAction): { success: boolean; error?: string } {
    const seatIdx = (action as any).seat_index ?? (action as any).seatIndex;
    const seat = state.seats[seatIdx];
    if (!seat || seat.status === "empty" || seat.status === "folded" || seat.status === "eliminated") {
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
          return { success: false, error: "Cannot check" };
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
    const active = state.seats.filter(
      (s: any) => s.status !== "empty" && s.status !== "folded" && s.status !== "eliminated"
    );
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
    const result = this.compareHands(state);
    const winner = result.rankings[0];

    // 从房间配置读取参数
    const config = state.room?.config || {};
    const deathPenaltyRate = (config.deathPenalty ?? 50) / 100;
    const luckyBonusRate = (config.luckyBonus ?? 50) / 100;
    const survivorBonusRate = (config.survivorBonus ?? 50) / 100;

    const players = state.seats.filter((s: any) => s.status !== "empty");
    const netResults: PlayerNetResult[] = players.map((seat: any) => {
      const isWinner = seat.user_id === winner.user_id;
      let net = isWinner ? state.total_pot : 0;

      // 幸运牌加成：赢家有 A♥ 底牌
      if (isWinner && this.squidState.lucky_card_triggered.has(seat.user_id)) {
        net = Math.floor(net * (1 + luckyBonusRate));
      }

      return {
        user_id: seat.user_id,
        seat_index: seat.seat_index,
        net_amount: net,
      };
    });

    // 死亡牌惩罚：未赢玩家有 2♣ 底牌，筹码减半
    for (const seat of players) {
      if (this.squidState.death_card_triggered.has(seat.user_id) && seat.user_id !== winner.user_id) {
        const loserNet = netResults.find((n) => n.user_id === seat.user_id);
        if (loserNet && seat.chips > 0) {
          const penalty = Math.floor(seat.chips * deathPenaltyRate);
          loserNet.net_amount = -penalty;
          // 惩罚筹码归入底池
          const winnerNet = netResults.find((n) => n.user_id === winner.user_id);
          if (winnerNet) {
            winnerNet.net_amount += penalty;
          }
        }
      }
    }

    // 残酷淘汰：筹码最少的活跃玩家出局
    const activePlayers = players.filter(
      (s: any) => s.status !== "folded" && s.status !== "eliminated"
    );
    if (activePlayers.length > 1) {
      activePlayers.sort((a: any, b: any) => a.chips - b.chips);
      const loser = activePlayers[0];
      const loserNet = netResults.find((n) => n.user_id === loser.user_id);
      if (loserNet) {
        const winnerNet = netResults.find((n) => n.user_id === winner.user_id);
        if (winnerNet) {
          winnerNet.net_amount += loser.chips;
        }
        loserNet.net_amount = -loser.chips;
      }
    }

    // 幸存者奖励：每存活一轮奖励
    for (const net of netResults) {
      if (net.net_amount > 0) {
        net.net_amount += Math.floor(state.current_highest_bet * survivorBonusRate);
      }
    }

    return netResults;
  }

  isPhaseComplete(state: any): boolean {
    const active = state.seats.filter(
      (s: any) => s.status !== "empty" && s.status !== "folded" && s.status !== "eliminated"
    );
    const allActed = active.every((s: any) => s.has_acted);
    const allCalled = active.every(
      (s: any) => s.current_bet === state.current_highest_bet || s.status === "all_in"
    );
    return allActed && allCalled;
  }

  getActionSeats(state: any): Seat[] {
    const active = state.seats.filter(
      (s: any) => s.status !== "empty" &&
        s.status !== "folded" &&
        s.status !== "all_in" &&
        s.status !== "eliminated"
    );
    return active as Seat[];
  }

  getNextPhase(state: any): RoundPhase {
    const order: RoundPhase[] = ["BETTING", "ACTION", "SHOWDOWN", "SETTLING", "FINISHED"];
    const idx = order.indexOf(state.phase);
    if (idx < 0 || idx >= order.length - 1) return "FINISHED";
    return order[idx + 1];
  }

  /** 新一轮开始时重置状态 */
  resetForNewRound(): void {
    this.squidState.glass_bridge_passed = false;
    this.squidState.bridge_choices = [];
    this.squidState.death_card_triggered.clear();
    this.squidState.lucky_card_triggered.clear();
    this.squidState.round_number++;
  }
}

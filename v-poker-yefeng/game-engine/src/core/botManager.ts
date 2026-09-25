/**
 * AI 机器人管理器 (BotManager)
 * 用途：单人测试 / 填充座位 / 演示模式
 *
 * 设计：
 *  - bot 是虚拟玩家，userId 格式 "bot_{room}_{n}"
 *  - bot 下注不走 wallet-service（虚拟筹码）
 *  - bot 策略：简单规则——根据当前下注额和牌力做决策
 *  - bot 动作在 TurnTimer 触发前自动执行
 *
 * 启用方式：房间创建时加 bots_count 参数，或手动 addBot
 */

import { GameStateMachine } from "./stateMachine.js";
import { coreEventBus } from "./eventBus.js";
import { evaluate7Cards } from "../games/texas_holdem/evaluator.js";
import type { Card } from "../shared/types.js";

export type BotStrategy = "tight" | "loose" | "random";

export interface BotConfig {
  strategy: BotStrategy;
  /** 初始筹码（虚拟） */
  chips: number;
  /** 思考延迟毫秒（模拟真人思考时间） */
  thinkDelayMs: number;
}

const DEFAULT_CONFIG: BotConfig = {
  strategy: "loose",
  chips: 5000,
  thinkDelayMs: 1500,
};

export class BotManager {
  private roomId: string;
  private stateMachine: GameStateMachine;
  private bots: Map<string, BotConfig> = new Map(); // userId -> config
  private botTurnTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(roomId: string, stateMachine: GameStateMachine) {
    this.roomId = roomId;
    this.stateMachine = stateMachine;
  }

  /**
   * 添加 bot 到指定座位
   */
  async addBot(seatIndex: number, config: Partial<BotConfig> = {}): Promise<string> {
    const botUserId = `bot_${this.roomId}_${Date.now().toString(36)}`;
    const fullConfig = { ...DEFAULT_CONFIG, ...config };

    const result = await this.stateMachine.seatManager.sitDown(
      seatIndex,
      botUserId,
      fullConfig.chips,
      false
    );

    if (result.success) {
      this.bots.set(botUserId, fullConfig);
      console.log(`[BotManager] Bot ${botUserId} sat at seat ${seatIndex} in room ${this.roomId}`);
    }

    return botUserId;
  }

  /**
   * 批量填充 bot 直到座位满
   */
  async fillBots(minSeats: number, config: Partial<BotConfig> = {}): Promise<string[]> {
    const seats = this.stateMachine.seatManager.getSeats();
    const added: string[] = [];

    for (let i = 0; i < seats.length && added.length < minSeats; i++) {
      if (seats[i].status === "empty") {
        const botId = await this.addBot(i, config);
        added.push(botId);
      }
    }

    if (added.length > 0) {
      console.log(`[BotManager] Filled ${added.length} bots in room ${this.roomId}`);
    }
    return added;
  }

  /**
   * 检查某个玩家是否是 bot
   */
  isBot(userId: string): boolean {
    return this.bots.has(userId);
  }

  /**
   * 评估德州手牌强度 0~1
   * - 翻前：基于底牌质量（对子/高张/同花连子）
   * - 翻后：evaluate7Cards 评分归一化
   */
  private evaluateTexasHandStrength(holeCards: Card[], communityCards: Card[]): number {
    if (communityCards.length === 0) {
      // 翻前：底牌质量评估
      if (holeCards.length < 2) return 0.3;
      const [c1, c2] = holeCards;
      const r1 = c1.rank === 1 ? 14 : c1.rank;
      const r2 = c2.rank === 1 ? 14 : c2.rank;
      const high = Math.max(r1, r2);
      const low = Math.min(r1, r2);
      const isPair = r1 === r2;
      const isSuited = c1.suit === c2.suit;
      const gap = high - low;

      let strength = 0.2;
      if (isPair) {
        strength = 0.5 + (low - 2) * 0.035; // 22=0.5, AA=0.92
      } else {
        strength = 0.15 + (high - 2) * 0.025 + (low - 2) * 0.01;
        if (isSuited) strength += 0.08;
        if (gap <= 2 && gap > 0) strength += 0.05; // 连子
        if (high >= 13) strength += 0.05; // 人头牌
      }
      return Math.min(1, Math.max(0, strength));
    }

    // 翻后：7张牌评估
    const evalResult = evaluate7Cards(holeCards, communityCards);
    // score范围：高牌~100万，皇家同花顺~1000万+14
    // 归一化到0~1：对数缩放
    const rawScore = evalResult.score;
    if (rawScore <= 0) return 0.1;
    // 用对数压缩：100万→0.3, 500万→0.6, 1000万→0.85
    const normalized = Math.min(1, Math.log10(rawScore) / 7 - 0.55);
    return Math.max(0.05, normalized);
  }

  /**
   * 轮到 bot 行动时调用——延迟后自动执行
   */
  scheduleBotTurn(seatIndex: number, userId: string): void {
    if (!this.isBot(userId)) return;

    const config = this.bots.get(userId)!;
    const timer = setTimeout(() => {
      this.executeBotAction(seatIndex, userId);
    }, config.thinkDelayMs + Math.random() * 1000); // 1.5~2.5s 随机延迟

    this.botTurnTimers.set(userId, timer);
  }

  /**
   * 取消 bot 的待执行动作
   */
  cancelBotTurn(userId: string): void {
    const timer = this.botTurnTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.botTurnTimers.delete(userId);
    }
  }

  /**
   * 执行 bot 的决策动作
   * 简单策略：
   *  - 能 check 就 check（70% 概率）或 bet（30%）
   *  - 有下注要 call：投入低于总筹码 10% 就 call，否则 fold
   *  - 偶尔 raise（15% 概率）
   */
  private async executeBotAction(seatIndex: number, userId: string): Promise<void> {
    const seat = this.stateMachine.seatManager.getSeat(seatIndex);
    if (!seat || seat.user_id !== userId) return;

    // 只在 playing 状态行动
    if (seat.status !== "playing" && seat.status !== "all_in") return;

    const roundState = this.stateMachine.roundState;
    const gameType = roundState.room.game_type;
    const phase = roundState.phase;
    const highestBet = roundState.current_highest_bet;
    const myBet = seat.current_bet;
    const callAmount = highestBet - myBet;

    let action: "fold" | "check" | "call" | "raise" | "all_in" | "bet" | "qiang_zhuang" | "view_cards";
    let amount: number | undefined;
    let multiplier: number | undefined;

    const roll = Math.random();

    if (phase === "QIANG_ZHUANG") {
      // 抢庄牛牛 / 抢庄三公：随机抢庄倍数 0~4
      action = "qiang_zhuang";
      multiplier = Math.floor(Math.random() * 5);
    } else if (phase === "ACTION") {
      // 看牌阶段：看牌即完成本阶段动作
      action = "view_cards";
    } else if (phase === "BETTING" && (gameType === "niu_niu" || gameType === "san_gong")) {
      // 牛牛 / 三公：下注倍数 1~3
      action = "bet";
      multiplier = 1 + Math.floor(Math.random() * 3);
    } else if (phase === "BETTING" && gameType === "zha_jin_hua") {
      // 炸金花无 check 语义：跟注 / 加注 / 弃牌
      if (roll < 0.1) {
        action = "fold";
      } else if (roll < 0.85) {
        action = "call";
      } else {
        action = "raise";
        amount = Math.floor(roundState.min_call_amount * 3);
      }
    } else if (gameType === "texas_holdem" || gameType === "omaha" || gameType === "short_deck" || gameType === "squid_game") {
      // 德州系：基于手牌强度 + 底池赔率决策
      const holeCards: Card[] = (seat.cards || []) as Card[];
      const communityCards: Card[] = (roundState.community_cards || []) as Card[];
      const handStrength = this.evaluateTexasHandStrength(holeCards, communityCards);
      const pot = roundState.total_pot || 0;
      const myChips = seat.chips;
      const potOdds = callAmount > 0 ? callAmount / (pot + callAmount) : 0;

      if (callAmount <= 0) {
        // 无人下注：check / bet
        if (handStrength > 0.7 && roll < 0.7) {
          action = "bet";
          amount = Math.floor(pot * 0.6) || roundState.room.base_score * 2;
        } else if (handStrength > 0.5 && roll < 0.35) {
          action = "bet";
          amount = Math.floor(pot * 0.4) || roundState.room.base_score;
        } else {
          action = "check";
        }
      } else {
        // 需跟注：基于手牌强度 vs 底池赔率
        if (handStrength < 0.25 && potOdds > 0.15) {
          action = "fold";
        } else if (handStrength > 0.75) {
          // 强牌：raise 或 call
          if (roll < 0.5 && myChips > callAmount * 2) {
            action = "raise";
            amount = Math.floor(callAmount * 2.5 + pot * 0.5);
          } else {
            action = "call";
          }
        } else if (handStrength > 0.45) {
          // 中等牌：call 为主，偶尔 raise
          if (roll < 0.15 && myChips > callAmount * 3) {
            action = "raise";
            amount = Math.floor(callAmount * 2 + pot * 0.3);
          } else if (potOdds < handStrength * 0.8) {
            action = "call";
          } else {
            action = "fold";
          }
        } else {
          // 弱牌：只在底池赔率极好时 call
          if (potOdds < 0.08 && roll < 0.4) {
            action = "call";
          } else {
            action = "fold";
          }
        }
      }
    } else if (callAmount <= 0) {
      // 德州：没有人下注，可以 check 或 bet
      if (roll < 0.6) {
        action = "check";
      } else if (roll < 0.85) {
        action = "bet";
        amount = Math.floor(roundState.room.base_score * (1 + Math.random() * 2));
      } else {
        action = "raise";
        amount = Math.floor(highestBet + roundState.room.base_score * 2);
      }
    } else {
      // 德州：需要跟注
      const myChips = seat.chips;
      const callRatio = callAmount / Math.max(1, myChips);

      if (callRatio > 0.3) {
        action = "fold";
      } else if (roll < 0.7) {
        action = "call";
      } else if (roll < 0.85) {
        action = "raise";
        amount = Math.floor(highestBet + roundState.room.base_score * 2);
      } else {
        action = "all_in";
        amount = myChips;
      }
    }

    console.log(
      `[BotManager] Bot ${userId} at seat ${seatIndex} acts: ${action} ${amount ?? ""} ${multiplier != null ? "x" + multiplier : ""} (phase=${phase})`
    );

    // 通过状态机执行动作
    await this.stateMachine.handleAction({
      user_id: userId,
      action_type: action,
      amount,
      multiplier,
    });
  }

  /**
   * 房间销毁时清理所有 bot 定时器
   */
  destroy(): void {
    this.botTurnTimers.forEach((timer) => clearTimeout(timer));
    this.botTurnTimers.clear();
    this.bots.clear();
  }
}

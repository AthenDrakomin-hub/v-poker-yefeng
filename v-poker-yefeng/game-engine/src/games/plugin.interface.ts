/**
 * 游戏规则插件标准接口 (GamePlugin Interface)
 * 核心引擎负责：房间、座位、生命周期状态机、网络路由、调用钱包
 * 规则插件负责：卡牌初始化、发牌逻辑、动作规则验证、牌型评估、比牌与净分计算 (PlayerNetResult[])
 */

import { Card, GameAction, GameMode, GameRoom, GameType, PlayerNetResult, RoundPhase, Seat, SidePot } from "../shared/types.js";

export interface HandEvaluation {
  rank_name: string;        // 牌型中文名 (如 "同花顺", "牛牛", "大三公", "金花")
  rank_level: number;       // 牌型级别 (数值越大牌力越强，用于快速排序比较)
  score: number;            // 综合打分 (用于同牌型破平 tie-breaker)
  multiplier: number;       // 规则倍数 (如 牛牛3倍, 炸弹牛4倍, 暴头5倍)
  best_cards?: Card[];      // 构成本牌型的关键牌
}

export interface CompareResult {
  winner_user_ids: string[];
  rankings: Array<{
    user_id: string;
    seat_index: number;
    evaluation: HandEvaluation;
  }>;
}

export interface PluginRoundState {
  room: GameRoom;
  seats: Seat[];
  deck: Card[];
  community_cards: Card[];  // 公共牌 (德州专用)
  phase: RoundPhase;
  banker_seat_index: number | null;
  current_turn_seat_index: number | null;
  total_pot: number;
  current_highest_bet: number;
  min_call_amount: number;
  betting_round_count: number; // 当前轮次
  side_pots?: SidePot[];      // 边池 (德州 all-in 时拆分)
}

export interface GamePlugin {
  readonly game_type: GameType;
  readonly name: string;
  readonly supported_modes: GameMode[];

  /**
   * 初始化该游戏专属牌堆 (如德州52张、炸金花52张、牛牛52张无大小王)
   */
  initDeck(): Card[];

  /**
   * 发牌逻辑
   * 德州: 各发2张底牌；牛牛: 各发5张；三公: 各发3张；炸金花: 各发3张
   */
  dealCards(state: PluginRoundState): void;

  /**
   * 推进/执行游戏特定行为 (下注、跟注、加注、抢庄、比牌等)
   */
  handleAction(state: PluginRoundState, action: GameAction): { success: boolean; error?: string };

  /**
   * 评估单手牌型
   */
  evaluateHand(cards: Card[], communityCards?: Card[]): HandEvaluation;

  /**
   * 牌局多手牌比牌排序
   */
  compareHands(state: PluginRoundState): CompareResult;

  /**
   * 算分阶段：计算每个入局玩家的净输赢筹码 (net_amount)
   * 必须保证: sum(net_amount) === 0 (零和博弈，抽水由钱包微服务基于净盈利或总彩池统一扣除)
   */
  calculateNetScores(state: PluginRoundState): PlayerNetResult[];

  /**
   * 检查当前阶段是否已满足跃迁条件 (如所有人均已抢庄完成、或本轮加注跟平)
   */
  isPhaseComplete(state: PluginRoundState): boolean;

  /**
   * 当前阶段需要行动的座位（按 seat_index 升序）
   *
   * 核心引擎据此推进回合（current_turn_seat_index）并调度倒计时/机器人；
   * 返回空数组表示该阶段无需行动，可直接跃迁。
   * 约定：座位「已行动」= seat.has_acted === true（看牌等自由动作不计入）。
   */
  getActionSeats(state: PluginRoundState): Seat[];

  /**
   * 获取下一阶段流转状态
   */
  getNextPhase(state: PluginRoundState): RoundPhase;
}

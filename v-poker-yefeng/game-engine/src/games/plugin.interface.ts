/**
 * 游戏规则插件标准接口 (GamePlugin Interface)
 *
 * 核心原则：插件只做【纯规则计算】，不操作资金/DB/Redis。
 * - 输入：只读的 PluginRoundState
 * - 输出：结算数值（PlayerNetResult[]），由引擎统一执行钱包转账
 * - 禁止：插件不能调用 walletClient、不能修改 total_pot、不能直接扣款
 */

import { Card, GameAction, GameMode, GameRoom, GameType, PlayerNetResult, RoundPhase, Seat, SidePot } from "../shared/types.js";

export interface HandEvaluation {
  rank_name: string;
  rank_level: number;
  score: number;
  multiplier: number;
  best_cards?: Card[];
}

export interface CompareResult {
  winner_user_ids: string[];
  rankings: Array<{
    user_id: string;
    seat_index: number;
    evaluation: HandEvaluation;
  }>;
}

/** 插件元信息 */
export interface PluginMeta {
  gameId: GameType;
  name: string;
  /** 每人发牌数 */
  cardCount: number;
  /** 是否支持边池（德州/奥马哈 all-in 分池） */
  supportSidePot: boolean;
  /** 是否为交换型（庄闲直接转账，否则底池型） */
  exchangeBased: boolean;
  /** 最少开局人数 */
  minPlayers: number;
  /** 最大座位数 */
  maxSeats: number;
}

export interface PluginRoundState {
  room: GameRoom;
  seats: Seat[];
  deck: Card[];
  community_cards: Card[];
  phase: RoundPhase;
  banker_seat_index: number | null;
  current_turn_seat_index: number | null;
  total_pot: number;
  current_highest_bet: number;
  min_call_amount: number;
  betting_round_count: number;
  side_pots?: SidePot[];
}

/** 动作校验结果 */
export interface ActionValidation {
  valid: boolean;
  reason?: string;
}

/**
 * 所有游戏插件必须实现此接口。
 * 加载时插件校验器会检查所有方法存在，缺失即拒绝加载。
 */
export interface GamePlugin {
  /** 插件元信息（必填） */
  readonly meta: PluginMeta;

  /** 兼容字段：game_type = meta.gameId */
  readonly game_type: GameType;
  readonly name: string;
  readonly supported_modes: GameMode[];

  /** 初始化牌堆（含洗牌） */
  initDeck(): Card[];

  /** 发牌：给每个玩家发初始手牌 */
  dealCards(state: PluginRoundState): void;

  /** 处理玩家动作（只修改state，不操作钱包） */
  handleAction(state: PluginRoundState, action: GameAction): { success: boolean; error?: string };

  /** 校验动作合法性（如：没看牌不能开比、非地主不能当地主） */
  validateAction(state: PluginRoundState, seat: Seat, action: GameAction): ActionValidation;

  /** 评估单手牌型 */
  evaluateHand(cards: Card[], communityCards?: Card[]): HandEvaluation;

  /** 比牌排序 */
  compareHands(state: PluginRoundState): CompareResult;

  /**
   * 结算：返回每个玩家净输赢（零和，sum=0）。
   * 只返回数值，不操作钱包。引擎收到后统一执行退款+转账。
   */
  calculateNetScores(state: PluginRoundState): PlayerNetResult[];

  /** 当前阶段是否完成（可推进到下阶段） */
  isPhaseComplete(state: PluginRoundState): boolean;

  /** 当前阶段需要行动的座位 */
  getActionSeats(state: PluginRoundState): Seat[];

  /** 获取下一阶段 */
  getNextPhase(state: PluginRoundState): RoundPhase;

  /** 获取指定阶段的倒计时（毫秒），默认30s */
  getPhaseTimeout?(phase: RoundPhase): number;
}

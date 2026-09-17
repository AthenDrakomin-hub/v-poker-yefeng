/**
 * 游戏引擎共享类型与契约定义
 * 遵循全局契约字典规范：snake_case、整数金额（筹码）、毫秒时间戳
 */

export type Suit = "S" | "H" | "C" | "D"; // 黑桃(Spade), 红桃(Heart), 梅花(Club), 方块(Diamond)

export interface Card {
  suit: Suit;
  rank: number; // 1(A), 2..10, 11(J), 12(Q), 13(K)
  code: string; // 如 "S-14", "H-10"
}

export type GameType = "texas_holdem" | "zha_jin_hua" | "niu_niu" | "san_gong";

export type GameMode =
  | "fixed"          // 德州固定/无限制
  | "normal"         // 炸金花标准
  | "qiang_zhuang"   // 抢庄牛牛 / 抢庄三公
  | "tong_bi";       // 通比牛牛 / 通比三公

export type RoomStatus = "waiting" | "playing" | "settling" | "closed";

export type RoundPhase =
  | "WAITING"
  | "DEALING"
  | "QIANG_ZHUANG"   // 抢庄阶段 (牛牛/三公)
  | "BETTING"        // 下注阶段 (德州 Preflop/Flop/Turn/River, 炸金花, 闲家下注)
  | "ACTION"         // 玩家操作 (看牌/比牌/摊牌)
  | "SHOWDOWN"       // 比牌/亮牌阶段
  | "SETTLING"       // 钱包结算阶段
  | "FINISHED";      // 本局结束

export interface Seat {
  seat_index: number;
  user_id: string | null;
  chips: number;               // 携带筹码
  current_bet: number;         // 本轮下注/本局累计下注
  status: "empty" | "ready" | "playing" | "folded" | "all_in" | "out";
  cards: Card[];               // 手牌
  is_banker: boolean;          // 是否为庄家 (抢庄模式适用)
  banker_multiplier: number;   // 抢庄倍数 (0=不抢, 1, 2, 3, 4)
  bet_multiplier: number;      // 闲家下注倍数 (1, 2, 3, 5, etc.)
  has_acted: boolean;          // 本动作轮是否已行动
  has_viewed_cards: boolean;   // 是否已看牌 (炸金花/牛牛)
  hand_result?: {
    rank_name: string;
    rank_level: number;
    score: number;
    multiplier: number;
    best_cards?: Card[];
  };
}

export interface GameRoom {
  room_id: string;
  game_type: GameType;
  mode: GameMode;
  base_score: number;             // 底分 (如 100 筹码)
  max_seats: number;              // 最大席位数 (2-9)
  min_players_to_start: number;   // 最少开始人数
  platform_fee_rate: number;      // 平台抽水比例 (默认 0.0500 即 5%)
  agent_commission_rate: number;  // 代理返佣比例 (默认 0.0300 即 3%)
  agent_ids: string[];            // 归属代理链 [room_agent, sub_agent, top_agent]
  status: RoomStatus;
  current_round_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface PlayerNetResult {
  user_id: string;
  net_amount: number;             // 净赢或净输筹码 (整数，可正可负，总和扣除抽水前必须为0)
  gross_win?: number;
  bet_total?: number;
  hand_name?: string;
}

/**
 * 统一钱包微服务结算请求契约 (POST /api/wallet/game_settle)
 */
export interface GameSettleRequest {
  transaction_id: string;         // 全局唯一流水号 (round_{room_id}_{timestamp}_{uuid})
  game_type: string;              // 游戏标识
  room_id: string;                // 房间号
  total_pot: number;              // 本局总彩池/总流水筹码
  platform_fee_rate: number;      // 平台抽水比例 (如 0.0500)
  agent_commission_rate: number;  // 代理分佣比例 (如 0.0300)
  agent_ids: string[];            // 代理分成名单
  player_results: PlayerNetResult[]; // 各玩家净输赢
}

export interface GameAction {
  action_type:
    | "ready"
    | "bet"
    | "call"
    | "check"
    | "raise"
    | "fold"
    | "all_in"
    | "qiang_zhuang"
    | "view_cards"
    | "compare"
    | "showdown";
  user_id: string;
  amount?: number;
  multiplier?: number;
  target_user_id?: string;        // 炸金花指定比牌对象
}

export interface RoundLog {
  timestamp: number;
  phase: RoundPhase;
  actor?: string;
  message: string;
}

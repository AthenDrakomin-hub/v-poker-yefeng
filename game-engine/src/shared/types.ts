/**
 * 游戏引擎共享类型与契约定义
 * 遵循全局契约字典：snake_case、整数金额（筹码）、毫秒时间戳
 */

export type Suit = "S" | "H" | "C" | "D";
export type CardCode = string; // 如 "S-14", "H-10"

export interface Card {
  suit: Suit;
  rank: number;
  code: CardCode;
}

export type GameType = "texas_holdem" | "zha_jin_hua" | "niu_niu" | "san_gong";

export type GameMode = "fixed" | "normal" | "qiang_zhuang" | "tong_bi";

export type RoomStatus = "waiting" | "playing" | "settling" | "closed";

export type RoundPhase =
  | "WAITING" | "DEALING" | "QIANG_ZHUANG" | "BETTING"
  | "ACTION" | "SHOWDOWN" | "SETTLING" | "FINISHED";

export interface Seat {
  seat_index: number;
  user_id: string | null;
  chips: number;
  current_bet: number;
  status: "empty" | "ready" | "playing" | "folded" | "all_in" | "out";
  cards: Card[];
  is_banker: boolean;
  banker_multiplier: number;
  bet_multiplier: number;
  has_acted: boolean;
  has_viewed_cards: boolean;
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
  base_score: number;
  max_seats: number;
  min_players_to_start: number;
  platform_fee_rate: number;
  agent_commission_rate: number;
  agent_ids: string[];
  status: RoomStatus;
  current_round_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface PlayerNetResult {
  user_id: string;
  net_amount: number;
  gross_win?: number;
  bet_total?: number;
  hand_name?: string;
}

/**
 * 统一钱包微服务结算请求契约 (POST /api/wallet/game_settle)
 * 对齐全局契约字典：winner_ids + agent_ids
 */
export interface GameSettleRequest {
  transaction_id: string;
  room_id: string;
  total_pot: number;
  winner_ids: string[];
  platform_fee_rate: number;
  agent_commission_rate: number;
  agent_ids: string[];
}

export interface GameAction {
  action_type:
    | "ready" | "bet" | "call" | "check" | "raise" | "fold" | "all_in"
    | "qiang_zhuang" | "view_cards" | "compare" | "showdown";
  user_id: string;
  amount?: number;
  multiplier?: number;
  target_user_id?: string;
}

export interface RoundLog {
  timestamp: number;
  phase: RoundPhase;
  actor?: string;
  message: string;
}

/**
 * 边池结构 (Side Pot)
 * 德州扑克 all-in 时拆分多个底池，每个底池由参与了该金额下注的玩家竞争
 */
export interface SidePot {
  amount: number;
  eligible_user_ids: string[];
}

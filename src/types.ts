/**
 * 全局契约字典与系统前端共享类型定义
 */

export interface Wallet {
  wallet_id: string;
  user_id: string;
  user_type: "admin" | "support" | "agent" | "player";
  balance: number;
  frozen_balance: number;
  updated_at: number;
}

export interface Transaction {
  transaction_id: string;
  from_wallet_id: string | null;
  to_wallet_id: string;
  amount: number;
  fee: number;
  fee_recipient: string;
  type: "mint" | "transfer" | "game_settle";
  status: "pending" | "success" | "failed";
  remark: string | null;
  created_at: number;
}

export interface FeePool {
  pool_id: string;
  balance: number;
  updated_at: number;
}

export interface Agent {
  agent_id: string;
  parent_id: string | null;
  level: number;
  r_ratio: number;
  commission_balance: number;
  status: "active" | "frozen";
}

export interface GameRecord {
  transaction_id: string;
  room_id: string;
  total_flow: number;
  player_count: number;
  created_at: number;
  settlement_status: "settled" | "failed";
}

export interface SettlementLog {
  settlement_id: string;
  transaction_id: string;
  agent_id: string;
  level: number;
  commission_amount: number;
  platform_revenue: number;
  created_at: number;
}

export interface AuditMetrics {
  total_minted: number;
  wallets_balance_sum: number;
  fee_pool_balance: number;
  total_system_assets: number;
  difference: number;
  is_conserved: boolean;
  wallets_count: number;
  audit_time: number;
}

export interface TestCaseResult {
  id: string;
  name: string;
  description: string;
  status: "idle" | "running" | "passed" | "failed";
  durationMs: number;
  logs: string[];
  details?: Record<string, any>;
}

// ================= 游戏引擎与契约字典扩展 =================

export type Suit = "S" | "H" | "C" | "D"; // 黑桃(Spade), 红桃(Heart), 梅花(Club), 方块(Diamond)

export interface Card {
  suit: Suit;
  rank: number; // 1(A), 2..10, 11(J), 12(Q), 13(K)
  code: string;
}

export type GameType = "texas_holdem" | "zha_jin_hua" | "niu_niu" | "san_gong";

export type GameMode =
  | "fixed"          // 德州扑克固定
  | "normal"         // 炸金花标准
  | "qiang_zhuang"   // 抢庄牛牛 / 抢庄三公
  | "tong_bi";       // 通比牛牛 / 通比三公

export interface GameRoomRecord {
  room_id: string;
  game_type: GameType;
  mode: GameMode;
  base_score: number;
  max_seats: number;
  platform_fee_rate: number;
  agent_commission_rate: number;
  status: "waiting" | "playing" | "settling" | "closed";
  created_at: number;
}

export interface PlayerNetResult {
  user_id: string;
  net_amount: number;
  gross_win?: number;
  bet_total?: number;
  hand_name?: string;
}

export interface GameSettleRequest {
  transaction_id: string;
  game_type: string;
  room_id: string;
  total_pot: number;
  platform_fee_rate: number;
  agent_commission_rate: number;
  agent_ids: string[];
  player_results: PlayerNetResult[];
}

export interface GameSeatUI {
  seat_index: number;
  user_id: string;
  user_name: string;
  avatar: string;
  chips: number;
  current_bet: number;
  status: "ready" | "playing" | "folded" | "all_in";
  cards: Card[];
  is_banker: boolean;
  banker_multiplier: number;
  bet_multiplier: number;
  has_acted: boolean;
  has_viewed_cards: boolean;
  hand_name?: string;
  score?: number;
}

// ================= BFF 调试命名空间与服务注册表类型 =================

export interface ServiceEndpointDef {
  method: "GET" | "POST" | "PUT" | "DELETE" | "WS";
  path: string;
  summary: string;
  sampleBody?: any;
  sampleParams?: Record<string, string>;
}

export interface DebugServiceItem {
  name: string;
  label: string;
  category: "core" | "business" | "game" | "gateway";
  env: string;
  baseUrl: string;
  healthPath: string;
  openapiPath: string;
  headers: Record<string, string>;
  enabled: boolean;
  version: string;
  description: string;
  endpoints: ServiceEndpointDef[];
}

export interface DebugLogItem {
  id: string;
  service: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  timestamp: string;
  traceId: string;
  message: string;
  payload?: any;
}

export interface DebugProxyResponse {
  _proxy: {
    dispatched_by: string;
    target_service: string;
    target_url: string;
    method: string;
    trace_id: string;
    latency_ms: number;
    env: string;
  };
  code: number;
  message: string;
  data?: any;
  request_echo?: any;
}

export interface InteropVerificationStep {
  step: number;
  title: string;
  target: string;
  endpoint: string;
  status: "success" | "failed";
  latencyMs: number;
  details: any;
  traceId?: string;
}

export interface InteropVerificationReport {
  success: boolean;
  sharedTraceId: string;
  steps: InteropVerificationStep[];
  traceLogs: DebugLogItem[];
  summary: string;
}



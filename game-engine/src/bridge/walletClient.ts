/**
 * 钱包服务桥接客户端 (WalletClient)
 * 职责：在游戏事件发生时，以原子幂等方式调用 wallet-service
 *  - 玩家下注/跟注/加注/all_in → POST /api/wallet/bet (玩家钱包 → 牌桌钱包)
 *  - 一局结束 → POST /api/wallet/game_settle (牌桌钱包 → 赢家+平台+代理)
 *  - 玩家中途退出/房间解散 → POST /api/wallet/refund (牌桌钱包 → 玩家)
 */

import { GameSettleRequest } from "../shared/types.js";

// ============================================================
// 请求/响应类型定义
// ============================================================

export interface BetRequest {
  transaction_id: string;
  room_id: string;
  user_id: string;
  amount: number;
  remark?: string;
}

export interface RefundItem {
  user_id: string;
  amount: number;
}

export interface RefundRequest {
  transaction_id: string;
  room_id: string;
  refunds: RefundItem[];
  remark?: string;
}

export interface WalletApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

export interface BetResponseData {
  transaction_id: string;
  room_id: string;
  user_id: string;
  amount: number;
  player_balance: number;
  room_balance: number;
  created_at: number;
}

export interface RefundResponseData {
  transaction_id: string;
  room_id: string;
  total_refund: number;
  room_balance_after: number;
  refunds: Array<{ user_id: string; amount: number; player_balance: number }>;
  created_at: number;
}

export interface SettleResponseData {
  transaction_id: string;
  room_id: string;
  total_pot: number;
  total_rake: number;
  agent_pool: number;
  platform_revenue: number;
  winners_payout: number;
  winners_detail: Array<{ user_id: string; wallet_id: string; amount: number }>;
  agent_shares: Array<{ agent_id: string; level: number; r_ratio: number; commission_amount: number }>;
  created_at: number;
}

// ============================================================
// 补偿队列：wallet-service 不可用时暂存待补偿操作
// ============================================================

interface PendingOperation {
  type: "bet" | "settle" | "refund";
  payload: any;
  retries: number;
  maxRetries: number;
  nextRetryAt: number;
}

// ============================================================
// WalletClient 主类
// ============================================================

export class WalletClient {
  private walletServiceUrl: string;
  private pendingQueue: PendingOperation[] = [];
  private heartbeatTimer: NodeJS.Timeout | null = null;

  constructor(url = process.env.WALLET_SERVICE_URL || "http://127.0.0.1:8001") {
    this.walletServiceUrl = url;
  }

  // ----------------------------------------------------------
  // 幂等流水号生成
  // ----------------------------------------------------------

  /** 下注流水号: bet_{roomId}_{userId}_{round}_{timestamp}_{nonce} */
  public generateBetTxId(roomId: string, userId: string, round: number): string {
    const ts = Date.now();
    const nonce = Math.random().toString(36).substring(2, 8);
    return `bet_${roomId}_${userId}_r${round}_${ts}_${nonce}`;
  }

  /** 结算流水号: settle_{roomId}_{timestamp}_{nonce} */
  public generateSettleTxId(roomId: string): string {
    const ts = Date.now();
    const nonce = Math.random().toString(36).substring(2, 8);
    return `settle_${roomId}_${ts}_${nonce}`;
  }

  /** 退款流水号: refund_{roomId}_{timestamp}_{nonce} */
  public generateRefundTxId(roomId: string): string {
    const ts = Date.now();
    const nonce = Math.random().toString(36).substring(2, 8);
    return `refund_${roomId}_${ts}_${nonce}`;
  }

  // ----------------------------------------------------------
  // 1. 下注：玩家钱包 → 牌桌钱包
  // ----------------------------------------------------------

  public async betChips(
    request: BetRequest,
    maxRetries = 3
  ): Promise<WalletApiResponse<BetResponseData>> {
    const url = `${this.walletServiceUrl}/api/wallet/bet`;

    try {
      const response = await this.fetchWithRetry(url, request, maxRetries);
      const data = (await response.json()) as WalletApiResponse<BetResponseData>;
      return data;
    } catch (err: any) {
      // 余额不足等业务错误直接抛出，不进补偿队列
      if (err?.statusCode === 400 || err?.statusCode === 404) {
        throw err;
      }
      // 网络错误等进补偿队列
      this.enqueuePending("bet", request);
      throw new Error(`Bet failed and queued for retry: ${err?.message}`);
    }
  }

  // ----------------------------------------------------------
  // 2. 结算：牌桌钱包 → 赢家 + 平台 + 代理
  // ----------------------------------------------------------

  public async settleGame(
    request: GameSettleRequest,
    maxRetries = 3
  ): Promise<WalletApiResponse<SettleResponseData>> {
    const url = `${this.walletServiceUrl}/api/wallet/game_settle`;

    try {
      const response = await this.fetchWithRetry(url, request, maxRetries);
      const data = (await response.json()) as WalletApiResponse<SettleResponseData>;
      return data;
    } catch (err: any) {
      // 结算失败必须进补偿队列（资金安全）
      this.enqueuePending("settle", request);
      throw new Error(`Settle failed and queued for retry: ${err?.message}`);
    }
  }

  // ----------------------------------------------------------
  // 3. 退款：牌桌钱包 → 玩家
  // ----------------------------------------------------------

  public async refundChips(
    request: RefundRequest,
    maxRetries = 3
  ): Promise<WalletApiResponse<RefundResponseData>> {
    const url = `${this.walletServiceUrl}/api/wallet/refund`;

    try {
      const response = await this.fetchWithRetry(url, request, maxRetries);
      const data = (await response.json()) as WalletApiResponse<RefundResponseData>;
      return data;
    } catch (err: any) {
      this.enqueuePending("refund", request);
      throw new Error(`Refund failed and queued for retry: ${err?.message}`);
    }
  }

  // ----------------------------------------------------------
  // 内部：带重试的 fetch
  // ----------------------------------------------------------

  private async fetchWithRetry(url: string, payload: any, maxRetries: number): Promise<Response> {
    let lastError: any = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errorText = await response.text();
          const err: any = new Error(`Wallet service HTTP ${response.status}: ${errorText}`);
          err.statusCode = response.status;
          throw err;
        }

        return response;
      } catch (err: any) {
        lastError = err;
        console.warn(`[WalletClient] Attempt ${attempt}/${maxRetries} failed:`, err.message);
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 200));
        }
      }
    }

    throw lastError;
  }

  // ----------------------------------------------------------
  // 补偿队列
  // ----------------------------------------------------------

  private enqueuePending(type: PendingOperation["type"], payload: any): void {
    this.pendingQueue.push({
      type,
      payload,
      retries: 0,
      maxRetries: 10,
      nextRetryAt: Date.now() + 5000 // 5秒后重试
    });
    console.warn(`[WalletClient] Operation queued. Queue size: ${this.pendingQueue.length}`);
  }

  /** 启动补偿队列心跳（每 10 秒扫描一次待补偿操作） */
  public startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(async () => {
      await this.flushPending();
    }, 10000);
  }

  /** 手动触发补偿队列刷新 */
  public async flushPending(): Promise<void> {
    if (this.pendingQueue.length === 0) return;

    const now = Date.now();
    const ready = this.pendingQueue.filter((op) => op.nextRetryAt <= now);

    for (const op of ready) {
      try {
        const url =
          op.type === "bet"
            ? `${this.walletServiceUrl}/api/wallet/bet`
            : op.type === "settle"
            ? `${this.walletServiceUrl}/api/wallet/game_settle`
            : `${this.walletServiceUrl}/api/wallet/refund`;

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(op.payload)
        });

        if (response.ok) {
          this.pendingQueue = this.pendingQueue.filter((p) => p !== op);
          console.log(`[WalletClient] Pending ${op.type} succeeded.`);
        } else {
          op.retries++;
          op.nextRetryAt = now + Math.pow(2, op.retries) * 1000;
          if (op.retries >= op.maxRetries) {
            this.pendingQueue = this.pendingQueue.filter((p) => p !== op);
            console.error(`[WalletClient] Pending ${op.type} permanently failed:`, op.payload);
          }
        }
      } catch (err) {
        op.retries++;
        op.nextRetryAt = now + Math.pow(2, op.retries) * 1000;
      }
    }
  }

  public getPendingCount(): number {
    return this.pendingQueue.length;
  }
}

// 单例导出
export const walletClient = new WalletClient();

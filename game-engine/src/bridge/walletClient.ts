/**
 * 钱包服务桥接客户端 (WalletClient)
 * 职责：在每局 Showdown 结束时，将房间各玩家净输赢 (player_results)
 * 组装为 GameSettleRequest，以原子幂等方式调用 wallet-service
 */

import { GameSettleRequest, PlayerNetResult } from "../shared/types.js";

export interface SettleResponse {
  code: number;
  message: string;
  data: {
    transaction_id: string;
    total_pot: number;
    platform_revenue: number;
    agent_pool: number;
    settled_at: number;
  };
}

export class WalletClient {
  private walletServiceUrl: string;

  constructor(url = process.env.WALLET_SERVICE_URL || "http://127.0.0.1:8001") {
    this.walletServiceUrl = url;
  }

  /**
   * 生成规范唯一幂等流水号: round_{roomId}_{timestamp}_{randomHex}
   */
  public generateRoundTxId(roomId: string): string {
    const ts = Date.now();
    const nonce = Math.random().toString(36).substring(2, 8);
    return `round_${roomId}_${ts}_${nonce}`;
  }

  /**
   * 发起原子结算请求 POST /api/wallet/game_settle
   */
  public async settleGame(
    request: GameSettleRequest,
    maxRetries = 3
  ): Promise<SettleResponse> {
    const url = `${this.walletServiceUrl}/api/wallet/game_settle`;

    let lastError: any = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(request)
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Wallet service returned HTTP ${response.status}: ${errorText}`);
        }

        const data = (await response.json()) as SettleResponse;
        return data;
      } catch (err) {
        lastError = err;
        console.warn(`[WalletClient] Settle attempt ${attempt}/${maxRetries} failed:`, err);
        if (attempt < maxRetries) {
          // 指数退避重试 (100ms, 200ms...)
          await new Promise((resolve) => setTimeout(resolve, attempt * 100));
        }
      }
    }

    throw new Error(`Failed to settle game after ${maxRetries} attempts: ${lastError?.message || lastError}`);
  }
}

export const walletClient = new WalletClient();

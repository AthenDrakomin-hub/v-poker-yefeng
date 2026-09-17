/**
 * 德州扑克开源引擎 (lhz960904/texas-holdem) 桥接客户端
 * 作用：在每手牌局 (Hand) 结束时，将牌桌底池、抽水及赢家数据原子上报至 wallet-service 进行结算分账
 */

export interface WinnerPayout {
  userId: string;
  weight?: number; // 默认权重1，平分底池
}

export interface GameSettlementPayload {
  roomId: string;
  totalPot: number; // 本局总底池 (筹码整数)
  playerCount: number;
  winners: WinnerPayout[];
  platformFeeRate?: number; // 如 0.0500 (5%)
  agentCommissionRate?: number; // 如 0.0300 (3%)
  roomAgentId?: string; // 该桌所属开房代理
}

export interface SettlementResult {
  transactionId: string;
  totalPot: number;
  totalRake: number;
  agentPool: number;
  platformRevenue: number;
  winnersPayout: number;
}

export class TexasSettlementBridge {
  private walletServiceUrl: string;

  constructor(walletServiceUrl = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001") {
    this.walletServiceUrl = walletServiceUrl;
  }

  /**
   * 生成全局唯一幂等流水号 (格式: stl_{roomId}_{handNumber}_{timestamp})
   */
  public generateTxId(roomId: string, handNumber: number): string {
    return `stl_${roomId}_h${handNumber}_${Date.now()}`;
  }

  /**
   * 调用钱包微服务 /api/wallet/game_settle
   * 包含自动指数退避重试，防止网络抖动导致的掉账
   */
  public async settleHand(
    handNumber: number,
    payload: GameSettlementPayload,
    maxRetries = 3
  ): Promise<SettlementResult> {
    const txId = this.generateTxId(payload.roomId, handNumber);

    const body = {
      transaction_id: txId,
      room_id: payload.roomId,
      total_pot: Math.floor(payload.totalPot),
      player_count: payload.playerCount,
      winners: payload.winners.map((w) => ({
        user_id: w.userId,
        weight: w.weight || 1
      })),
      platform_fee_rate: (payload.platformFeeRate ?? 0.05).toFixed(4),
      agent_commission_rate: (payload.agentCommissionRate ?? 0.03).toFixed(4),
      room_agent_id: payload.roomAgentId || "agt_room_03"
    };

    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const response = await fetch(`${this.walletServiceUrl}/api/wallet/game_settle`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Wallet service HTTP ${response.status}: ${errText}`);
        }

        const resJson = await response.json();
        if (resJson.code !== 0) {
          throw new Error(`Settlement API error [code ${resJson.code}]: ${resJson.message}`);
        }

        const data = resJson.data;
        return {
          transactionId: data.transaction_id,
          totalPot: data.total_pot,
          totalRake: data.total_rake,
          agentPool: data.agent_pool,
          platformRevenue: data.platform_revenue,
          winnersPayout: data.winners_payout
        };
      } catch (error) {
        attempt++;
        console.error(`[SettlementBridge] Hand #${handNumber} settle attempt ${attempt} failed:`, error);
        if (attempt >= maxRetries) {
          // 记录落盘应急告警日志，便于人工对账
          console.error(`[CRITICAL] Settlement failed after ${maxRetries} attempts. TxId: ${txId}`);
          throw error;
        }
        // 退避 500ms, 1000ms...
        await new Promise((r) => setTimeout(r, attempt * 500));
      }
    }

    throw new Error("Unexpected settlement execution branch.");
  }
}

// 导出单例
export const settlementBridge = new TexasSettlementBridge();

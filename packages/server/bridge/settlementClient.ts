/**
 * 德州扑克开源引擎桥接客户端 (settlementClient.ts)
 * 在每手牌局结束时，将牌桌底池、抽水及赢家数据上报至 wallet-service 结算分账
 * 对齐全局契约：winner_ids + agent_ids
 */

export interface GameSettlementPayload {
  room_id: string;
  total_pot: number;
  winner_ids: string[];
  platform_fee_rate?: number;
  agent_commission_rate?: number;
  agent_ids?: string[];
}

export interface SettlementResult {
  transaction_id: string;
  total_pot: number;
  total_rake: number;
  agent_pool: number;
  platform_revenue: number;
  winners_payout: number;
}

export class TexasSettlementBridge {
  private walletServiceUrl: string;

  constructor(walletServiceUrl = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001") {
    this.walletServiceUrl = walletServiceUrl;
  }

  /** 生成全局唯一幂等流水号 */
  public generateTxId(roomId: string, handNumber: number): string {
    return `stl_${roomId}_h${handNumber}_${Date.now()}`;
  }

  /**
   * 调用 wallet-service /api/wallet/game_settle
   * 含指数退避重试
   */
  public async settleHand(
    handNumber: number,
    payload: GameSettlementPayload,
    maxRetries = 3
  ): Promise<SettlementResult> {
    const txId = this.generateTxId(payload.room_id, handNumber);

    const body = {
      transaction_id: txId,
      room_id: payload.room_id,
      total_pot: Math.floor(payload.total_pot),
      winner_ids: payload.winner_ids,
      platform_fee_rate: (payload.platform_fee_rate ?? 0.05).toFixed(4),
      agent_commission_rate: (payload.agent_commission_rate ?? 0.03).toFixed(4),
      agent_ids: payload.agent_ids ?? ["agt_room_03", "agt_sub_02", "agt_top_01"]
    };

    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const response = await fetch(`${this.walletServiceUrl}/api/wallet/game_settle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
          transaction_id: data.transaction_id,
          total_pot: data.total_pot,
          total_rake: data.total_rake,
          agent_pool: data.agent_pool,
          platform_revenue: data.platform_revenue,
          winners_payout: data.winners_payout
        };
      } catch (error) {
        attempt++;
        console.error(`[SettlementBridge] Hand #${handNumber} settle attempt ${attempt} failed:`, error);
        if (attempt >= maxRetries) {
          console.error(`[CRITICAL] Settlement failed after ${maxRetries} attempts. TxId: ${txId}`);
          throw error;
        }
        await new Promise((r) => setTimeout(r, attempt * 500));
      }
    }

    throw new Error("Unexpected settlement execution branch.");
  }
}

export const settlementBridge = new TexasSettlementBridge();

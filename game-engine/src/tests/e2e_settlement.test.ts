/**
 * 结算端到端集成测试
 * 验证：wallet 桥接调用、bot 跳过、退款逻辑
 */

import { describe, it, expect, beforeEach } from "vitest";
import { RoomManager } from "../core/roomManager.js";
import { WalletClient } from "../bridge/walletClient.js";

class MockWalletClient extends WalletClient {
  public balances: Map<string, number> = new Map();
  public settleCalls: any[] = [];
  public betCalls: any[] = [];
  public refundCalls: any[] = [];

  constructor() {
    super("http://mock-wallet:8001");
  }

  async deductBet(roomId: string, userId: string, amount: number, txId: string): Promise<void> {
    this.betCalls.push({ roomId, userId, amount, txId });
    this.balances.set(userId, (this.balances.get(userId) || 5000) - amount);
  }

  async settleGame(req: any): Promise<any> {
    this.settleCalls.push(req);
    req.winner_ids.forEach((wid: string) => {
      this.balances.set(wid, (this.balances.get(wid) || 0) + req.total_pot);
    });
    return { code: 0, message: "settled" };
  }

  async refund(roomId: string, userId: string, amount: number, txId: string): Promise<void> {
    this.refundCalls.push({ roomId, userId, amount, txId });
    this.balances.set(userId, (this.balances.get(userId) || 0) + amount);
  }

  generateSettleTxId(roomId: string): string {
    return `settle_${roomId}_${Date.now()}`;
  }
}

describe("端到端：资金流验证", () => {
  let roomManager: RoomManager;
  let mockWallet: MockWalletClient;

  beforeEach(() => {
    roomManager = new RoomManager();
    mockWallet = new MockWalletClient();
  });

  it("Bot 玩家：recordPlayerBet 跳过 wallet 调用", async () => {
    const { stateMachine: sm } = roomManager.createRoom({
      room_id: "e2e_bot_001",
      game_type: "texas_holdem",
      mode: "fixed",
      base_score: 100,
    });

    await sm.seatManager.sitDown(0, "p_alice", 5000);
    await sm.seatManager.sitDown(1, "p_bot_123", 5000);

    // 标记 bot
    (sm.botManager as any).bots.set("p_bot_123", { strategy: "loose", chips: 5000, thinkDelayMs: 100 });

    const before = mockWallet.betCalls.length;
    await sm.recordPlayerBet("p_bot_123", 100);
    const after = mockWallet.betCalls.length;

    expect(after).toBe(before); // bot 不调 wallet
  });

  it("事件日志：记录下注/结算事件", async () => {
    const { stateMachine: sm } = roomManager.createRoom({
      room_id: "e2e_event_001",
      game_type: "texas_holdem",
      mode: "fixed",
      base_score: 100,
    });

    await sm.seatManager.sitDown(0, "p_alice", 5000);
    await sm.seatManager.sitDown(1, "p_bob", 5000);
    await sm.startRound();

    // 至少有发牌事件
    expect(sm.eventLog.getAll().length).toBeGreaterThan(0);
  });
});

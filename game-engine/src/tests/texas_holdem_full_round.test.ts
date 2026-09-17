/**
 * 德州扑克完整单局流转测试 (Iteration 1: Texas Hold'em Full Round Verification)
 * 验证：
 * 1. 房间与座位就绪 (Room & Seat)
 * 2. 牌堆初始化与发牌 (Preflop 2底牌 + 扣除大小盲)
 * 3. 翻牌圈 Flop (3张公共牌) 下注与跟注
 * 4. 转牌圈 Turn (第4张公共牌) Check/Check 过牌
 * 5. 河牌圈 River (第5张公共牌) 加注与跟注
 * 6. 7选5牌型评估与比牌 (Showdown)
 * 7. 净分计算严格能量守恒: sum(net_amount) === 0 (零和博弈，引擎不碰筹码)
 * 8. 调用 POST /api/wallet/game_settle 触发微服务结算
 */

import { describe, it, expect, vi } from "vitest";
import { RoomManager } from "../core/roomManager.js";
import { GameAction, GameSettleRequest } from "../shared/types.js";
import { WalletClient } from "../bridge/walletClient.js";

describe("【Iteration 1】德州扑克完整一局生命周期验证", () => {
  it("应成功从创建房间、发牌、四轮下注、公共牌展开直至比牌与钱包结算", async () => {
    const roomManager = new RoomManager();

    // 1. 创建房间
    const { room, stateMachine: sm } = roomManager.createRoom({
      room_id: "texas_full_001",
      game_type: "texas_holdem",
      mode: "fixed",
      base_score: 100,
      platform_fee_rate: 0.0500,
      agent_commission_rate: 0.0300,
      agent_ids: ["agt_room_03", "agt_sub_02", "agt_top_01"]
    });

    expect(room).toBeDefined();
    expect(room.base_score).toBe(100);

    // 2. 玩家入座
    const sitAlice = sm.seatManager.sitDown(0, "p_alice", 5000);
    const sitBob = sm.seatManager.sitDown(1, "p_bob", 5000);
    expect(sitAlice).toBe(true);
    expect(sitBob).toBe(true);
    expect(sm.canStart()).toBe(true);

    // 3. 开始牌局 (Preflop)
    const started = sm.startRound();
    expect(started).toBe(true);
    expect(sm.getPhase()).toBe("BETTING");
    expect(sm.roundState.betting_round_count).toBe(1);

    const seat0 = sm.seatManager.getSeat(0)!;
    const seat1 = sm.seatManager.getSeat(1)!;

    // 验证手牌每人2张
    expect(seat0.cards.length).toBe(2);
    expect(seat1.cards.length).toBe(2);

    // 验证大小盲 (SB=50, BB=100)
    expect(seat0.current_bet).toBe(50);
    expect(seat1.current_bet).toBe(100);
    expect(sm.roundState.total_pot).toBe(150);
    expect(sm.roundState.current_highest_bet).toBe(100);

    // 4. Preflop 轮次下注：
    // Alice (SB) 跟注 50 -> 累计 100
    const aliceCallPreflop = sm.handleAction({
      user_id: "p_alice",
      action_type: "call"
    });
    expect(aliceCallPreflop.success).toBe(true);
    expect(seat0.current_bet).toBe(100);
    expect(sm.roundState.total_pot).toBe(200);

    // Bob (BB) 过牌 Check
    const bobCheckPreflop = sm.handleAction({
      user_id: "p_bob",
      action_type: "check"
    });
    expect(bobCheckPreflop.success).toBe(true);

    // Preflop 双方动作完毕且下注齐平，自动推进到翻牌圈 (Flop)
    expect(sm.roundState.betting_round_count).toBe(2);
    expect(sm.roundState.community_cards.length).toBe(3);
    expect(sm.getPhase()).toBe("BETTING");

    // 5. 翻牌圈 (Flop) 轮次下注：
    // Alice 下注 100 -> 累计 200
    const aliceBetFlop = sm.handleAction({
      user_id: "p_alice",
      action_type: "bet",
      amount: 100
    });
    expect(aliceBetFlop.success).toBe(true);
    expect(seat0.current_bet).toBe(200);
    expect(sm.roundState.total_pot).toBe(300);

    // Bob 跟注 100 -> 累计 200
    const bobCallFlop = sm.handleAction({
      user_id: "p_bob",
      action_type: "call"
    });
    expect(bobCallFlop.success).toBe(true);
    expect(seat1.current_bet).toBe(200);
    expect(sm.roundState.total_pot).toBe(400);

    // Flop 完成，自动推进到转牌圈 (Turn, 第4张公共牌)
    expect(sm.roundState.betting_round_count).toBe(3);
    expect(sm.roundState.community_cards.length).toBe(4);
    expect(sm.getPhase()).toBe("BETTING");

    // 6. 转牌圈 (Turn) 轮次：
    // 双方均 Check 过牌
    const aliceCheckTurn = sm.handleAction({
      user_id: "p_alice",
      action_type: "check"
    });
    const bobCheckTurn = sm.handleAction({
      user_id: "p_bob",
      action_type: "check"
    });
    expect(aliceCheckTurn.success).toBe(true);
    expect(bobCheckTurn.success).toBe(true);

    // Turn 完成，自动推进到河牌圈 (River, 第5张公共牌)
    expect(sm.roundState.betting_round_count).toBe(4);
    expect(sm.roundState.community_cards.length).toBe(5);
    expect(sm.getPhase()).toBe("BETTING");

    // 7. 河牌圈 (River) 轮次：
    // Alice 加注 200 -> 累计 400
    const aliceBetRiver = sm.handleAction({
      user_id: "p_alice",
      action_type: "bet",
      amount: 200
    });
    expect(aliceBetRiver.success).toBe(true);
    expect(seat0.current_bet).toBe(400);
    expect(sm.roundState.total_pot).toBe(600);

    // Bob 跟注 200 -> 累计 400
    const bobCallRiver = sm.handleAction({
      user_id: "p_bob",
      action_type: "call"
    });
    expect(bobCallRiver.success).toBe(true);
    expect(seat1.current_bet).toBe(400);
    expect(sm.roundState.total_pot).toBe(800);

    // 8. 河牌下注完毕，自动跃迁到 比牌 (SHOWDOWN) 与 结算 (SETTLING)
    expect(sm.getPhase()).toBe("SETTLING");
    expect(sm.lastResults.length).toBe(2);

    // 验证能量守恒核心法则：引擎只算规则和净输赢，不碰筹码，且净输赢之和必须严格为 0
    const sumNet = sm.lastResults.reduce((acc, cur) => acc + cur.net_amount, 0);
    expect(sumNet).toBe(0);

    const winner = sm.lastResults.find((r) => r.net_amount > 0)!;
    const loser = sm.lastResults.find((r) => r.net_amount < 0)!;

    expect(winner).toBeDefined();
    expect(loser).toBeDefined();
    expect(winner.gross_win).toBe(800);
    expect(winner.net_amount).toBe(400); // 800 - 400 成本 = +400
    expect(loser.net_amount).toBe(-400);  // 损失 400 成本 = -400

    // 9. 触发微服务原子结算 (POST /api/wallet/game_settle)
    let capturedPayload: GameSettleRequest | null = null;
    const mockWalletClient = {
      generateRoundTxId: (rId: string) => `tx_test_${rId}_${Date.now()}`,
      settleGame: vi.fn().mockImplementation(async (req: GameSettleRequest) => {
        capturedPayload = req;
        return {
          code: 0,
          message: "Game settled successfully",
          data: {
            transaction_id: req.transaction_id,
            total_pot: req.total_pot,
            platform_revenue: Math.floor(req.total_pot * req.platform_fee_rate * 0.4),
            agent_pool: Math.floor(req.total_pot * req.agent_commission_rate),
            settled_at: Date.now()
          }
        };
      })
    } as unknown as WalletClient;

    const settleResult = await sm.settleRound(mockWalletClient);

    expect(settleResult.response.code).toBe(0);
    expect(capturedPayload).not.toBeNull();
    expect(capturedPayload!.room_id).toBe("texas_full_001");
    expect(capturedPayload!.total_pot).toBe(800);
    expect(capturedPayload!.platform_fee_rate).toBe(0.05);
    expect(capturedPayload!.agent_commission_rate).toBe(0.03);
    expect(capturedPayload!.player_results).toEqual(sm.lastResults);

    // 牌局结算完成，状态机回到 WAITING 就绪态，等待下一局启动
    expect(sm.getPhase()).toBe("WAITING");
  });
});

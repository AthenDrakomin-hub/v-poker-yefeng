/**
 * 炸金花完整单局流转测试
 * 验证：
 * 1. 房间创建 + 玩家入座
 * 2. 发牌（每人 3 张）+ 底注扣除
 * 3. 看牌动作（view_cards）
 * 4. 跟注/加注
 * 5. 比牌（compare）
 * 6. 净分计算零和守恒
 */

import { describe, it, expect, vi } from "vitest";
import { RoomManager } from "../core/roomManager.js";
import { GameAction } from "../shared/types.js";

describe("【炸金花】完整一局生命周期验证", () => {
  it("应完成：入座→发牌→看牌→跟注→比牌→结算", async () => {
    const roomManager = new RoomManager();

    // 1. 创建炸金花房间
    const { room, stateMachine: sm } = roomManager.createRoom({
      room_id: "zjh_test_001",
      game_type: "zha_jin_hua",
      mode: "normal",
      base_score: 100,
    });

    expect(room.game_type).toBe("zha_jin_hua");

    // 2. 两个玩家入座
    const sitAlice = await sm.seatManager.sitDown(0, "p_alice", 5000);
    const sitBob = await sm.seatManager.sitDown(1, "p_bob", 5000);
    expect(sitAlice.success).toBe(true);
    expect(sitBob.success).toBe(true);

    // 3. 开始牌局
    const started = await sm.startRound();
    expect(started).toBe(true);

    // 4. 验证发牌：每人 3 张
    const seat0 = sm.seatManager.getSeat(0)!;
    const seat1 = sm.seatManager.getSeat(1)!;
    expect(seat0.cards.length).toBe(3);
    expect(seat1.cards.length).toBe(3);

    // 5. 验证底注已扣
    expect(seat0.current_bet).toBe(100);
    expect(seat1.current_bet).toBe(100);
    expect(sm.roundState.total_pot).toBe(200);

    // 6. Alice 看牌
    const viewResult = sm.plugin.handleAction(sm.roundState, {
      user_id: "p_alice",
      action_type: "view_cards",
    });
    expect(viewResult.success).toBe(true);
    expect(seat0.has_viewed_cards).toBe(true);

    // 7. Alice 跟注（看牌后双倍 = 200）
    const callResult = sm.plugin.handleAction(sm.roundState, {
      user_id: "p_alice",
      action_type: "call",
    });
    expect(callResult.success).toBe(true);
    expect(seat0.current_bet).toBe(300); // 100 + 200

    // 8. Bob 跟注（闷牌 = 100）
    const bobCall = sm.plugin.handleAction(sm.roundState, {
      user_id: "p_bob",
      action_type: "call",
    });
    expect(bobCall.success).toBe(true);
    expect(seat1.current_bet).toBe(200); // 100 + 100

    // 9. 验证牌型评估已生成
    expect(seat0.hand_result).toBeDefined();
    expect(seat0.hand_result!.rank_name).toBeTruthy();

    // 10. 净分计算零和守恒
    const netScores = sm.plugin.calculateNetScores(sm.roundState);
    const sum = netScores.reduce((acc, r) => acc + r.net_amount, 0);
    expect(sum).toBe(0);
  });

  it("比牌动作：输者应被 fold", async () => {
    const roomManager = new RoomManager();
    const { stateMachine: sm } = roomManager.createRoom({
      room_id: "zjh_test_002",
      game_type: "zha_jin_hua",
      mode: "normal",
      base_score: 100,
    });

    await sm.seatManager.sitDown(0, "p_alice", 5000);
    await sm.seatManager.sitDown(1, "p_bob", 5000);
    await sm.startRound();

    // 第二轮下注后才能比牌
    sm.roundState.betting_round_count = 2;

    const seat0 = sm.seatManager.getSeat(0)!;
    seat0.has_acted = false;
    const seat1 = sm.seatManager.getSeat(1)!;
    seat1.has_acted = false;

    // Alice 比 Bob
    const compareResult = sm.plugin.handleAction(sm.roundState, {
      user_id: "p_alice",
      action_type: "compare",
      target_user_id: "p_bob",
    });

    expect(compareResult.success).toBe(true);
    // 必有一人被 fold
    expect(
      seat0.status === "folded" || seat1.status === "folded"
    ).toBe(true);
  });

  it("只有一人存活时直接结束", async () => {
    const roomManager = new RoomManager();
    const { stateMachine: sm } = roomManager.createRoom({
      room_id: "zjh_test_003",
      game_type: "zha_jin_hua",
      mode: "normal",
      base_score: 100,
    });

    await sm.seatManager.sitDown(0, "p_alice", 5000);
    await sm.seatManager.sitDown(1, "p_bob", 5000);
    await sm.startRound();

    // Bob 弃牌
    sm.plugin.handleAction(sm.roundState, {
      user_id: "p_bob",
      action_type: "fold",
    });

    // 只剩 Alice，阶段应完成
    expect(sm.plugin.isPhaseComplete(sm.roundState)).toBe(true);
  });
});

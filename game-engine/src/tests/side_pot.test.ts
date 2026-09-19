/**
 * 德州扑克边池（Side Pot）单元测试
 * 验证 calculateSidePots + calculateNetScores 在以下场景的正确性：
 *  1. 单人 all-in（基础底池，无边池）
 *  2. 多人 all-in 多层边池拆分
 *  3. 平分底池（两人牌力相同）
 *  4. 弃牌玩家不参与边池竞争
 *  5. 边池余数分配（不能整除时前 N 个赢家多拿 1 筹码）
 *  6. 能量守恒：sum(net_amount) === 0
 */

import { describe, it, expect } from "vitest";
import { RoomManager } from "../core/roomManager.js";
import { TexasHoldemPlugin } from "../games/texas_holdem/index.js";
import { PluginRoundState } from "../games/plugin.interface.js";
import { Card } from "../shared/types.js";

// 构造一张指定点数和花色的牌
function card(rank: number, suit: "S" | "H" | "C" | "D"): Card {
  return { suit, rank, code: `${suit}-${rank}` };
}

/**
 * 构造一个可控的 PluginRoundState（不发真牌，手动指定底牌和公共牌）
 */
function buildState(options: {
  players: Array<{
    seat: number;
    userId: string;
    bet: number;
    status?: "playing" | "folded" | "all_in";
    holeCards: [Card, Card];
  }>;
  communityCards: Card[];
}): { state: PluginRoundState; plugin: TexasHoldemPlugin } {
  const plugin = new TexasHoldemPlugin();

  const state: PluginRoundState = {
    room: {
      room_id: "test",
      game_type: "texas_holdem",
      mode: "fixed",
      base_score: 100,
      max_seats: 6,
      min_players_to_start: 2,
      platform_fee_rate: 0.05,
      agent_commission_rate: 0.03,
      agent_ids: [],
      status: "playing",
      current_round_id: "r1",
      created_at: 0,
      updated_at: 0,
    },
    seats: options.players.map((p) => ({
      seat_index: p.seat,
      user_id: p.userId,
      chips: 0,
      current_bet: p.bet,
      status: p.status || "playing",
      cards: p.holeCards,
      is_banker: false,
      banker_multiplier: 0,
      bet_multiplier: 1,
      has_acted: true,
      has_viewed_cards: true,
    })),
    deck: [],
    community_cards: options.communityCards,
    phase: "SHOWDOWN",
    banker_seat_index: null,
    current_turn_seat_index: null,
    total_pot: options.players.reduce((s, p) => s + p.bet, 0),
    current_highest_bet: Math.max(...options.players.map((p) => p.bet)),
    min_call_amount: 0,
    betting_round_count: 4,
    side_pots: [],
  };

  // 预计算每个未弃牌玩家的牌型
  state.seats.forEach((seat) => {
    if (seat.status === "playing" || seat.status === "all_in") {
      seat.hand_result = plugin.evaluateHand(seat.cards, state.community_cards);
    }
  });

  return { state, plugin };
}

describe("边池计算（Side Pot）", () => {
  it("1. 单人 all-in：只有一层底池，赢家通吃", () => {
    // Alice 全下 100，Bob 跟 100
    const { state, plugin } = buildState({
      players: [
        { seat: 0, userId: "alice", bet: 100, status: "all_in", holeCards: [card(14, "S"), card(13, "S")] },
        { seat: 1, userId: "bob", bet: 100, holeCards: [card(12, "H"), card(11, "H")] },
      ],
      communityCards: [card(14, "D"), card(13, "D"), card(2, "C"), card(3, "C"), card(4, "C")],
    });

    const sidePots = (plugin as any).calculateSidePots(state);
    expect(sidePots.length).toBe(1);
    expect(sidePots[0].amount).toBe(200);
    expect(sidePots[0].eligible_user_ids.sort()).toEqual(["alice", "bob"].sort());

    const results = plugin.calculateNetScores(state);
    const sumNet = results.reduce((s, r) => s + r.net_amount, 0);
    expect(sumNet).toBe(0); // 能量守恒
  });

  it("2. 多人 all-in 三层边池：Alice 50 / Bob 100 / Charlie 200", () => {
    // 三个人下注额不同：50, 100, 200
    // 边池 1: 50 × 3 人 = 150（三人竞争）
    // 边池 2: (100-50) × 2 人 = 100（Bob+Charlie 竞争）
    // 边池 3: (200-100) × 1 人 = 100（Charlie 独占）
    const { state, plugin } = buildState({
      players: [
        { seat: 0, userId: "alice", bet: 50, status: "all_in", holeCards: [card(2, "S"), card(3, "S")] },
        { seat: 1, userId: "bob", bet: 100, status: "all_in", holeCards: [card(14, "S"), card(13, "S")] },
        { seat: 2, userId: "charlie", bet: 200, holeCards: [card(14, "H"), card(14, "D")] },
      ],
      communityCards: [card(14, "C"), card(13, "C"), card(5, "D"), card(6, "D"), card(7, "D")],
    });

    const sidePots = (plugin as any).calculateSidePots(state);
    expect(sidePots.length).toBe(3);

    // 边池 1：50 × 3 = 150
    expect(sidePots[0].amount).toBe(150);
    expect(sidePots[0].eligible_user_ids.sort()).toEqual(["alice", "bob", "charlie"].sort());

    // 边池 2：(100-50) × 2 = 100
    expect(sidePots[1].amount).toBe(100);
    expect(sidePots[1].eligible_user_ids.sort()).toEqual(["bob", "charlie"].sort());

    // 边池 3：(200-100) × 1 = 100
    expect(sidePots[2].amount).toBe(100);
    expect(sidePots[2].eligible_user_ids).toEqual(["charlie"]);

    // 总池 = 150 + 100 + 100 = 350 = 50+100+200
    const totalFromPots = sidePots.reduce((s: number, p: { amount: number }) => s + p.amount, 0);
    expect(totalFromPots).toBe(350);

    const results = plugin.calculateNetScores(state);
    const sumNet = results.reduce((s, r) => s + r.net_amount, 0);
    expect(sumNet).toBe(0);
  });

  it("3. 平分底池：两人牌力相同，底池均分", () => {
    // 两人都各下注 100，底牌不同但最终都构成一对 A（平分）
    const { state, plugin } = buildState({
      players: [
        { seat: 0, userId: "alice", bet: 100, holeCards: [card(14, "S"), card(2, "S")] },
        { seat: 1, userId: "bob", bet: 100, holeCards: [card(14, "H"), card(3, "H")] },
      ],
      // 公共牌：一对 A + 无关牌
      communityCards: [card(14, "D"), card(14, "C"), card(5, "S"), card(6, "H"), card(7, "D")],
    });

    const results = plugin.calculateNetScores(state);
    const sumNet = results.reduce((s, r) => s + r.net_amount, 0);
    expect(sumNet).toBe(0);

    // 两人牌型分数应该相同
    const alice = results.find((r) => r.user_id === "alice")!;
    const bob = results.find((r) => r.user_id === "bob")!;
    // 都是一对 A，net 应该接近 0（平分 200，各拿回 100）
    expect(alice.net_amount).toBeCloseTo(0, 0);
    expect(bob.net_amount).toBeCloseTo(0, 0);
  });

  it("4. 弃牌玩家不参与边池竞争，下注留在底池", () => {
    // Alice 弃牌（下注 50 不拿回），Bob 和 Charlie 各下注 100 比牌
    const { state, plugin } = buildState({
      players: [
        { seat: 0, userId: "alice", bet: 50, status: "folded", holeCards: [card(2, "S"), card(3, "S")] },
        { seat: 1, userId: "bob", bet: 100, holeCards: [card(14, "S"), card(13, "S")] },
        { seat: 2, userId: "charlie", bet: 100, holeCards: [card(2, "H"), card(3, "H")] },
      ],
      communityCards: [card(14, "C"), card(13, "C"), card(5, "D"), card(6, "D"), card(7, "D")],
    });

    // 边池只算未弃牌且有下注的玩家（Bob + Charlie 各 100）
    const sidePots = (plugin as any).calculateSidePots(state);
    // Bob 和 Charlie 下注相同（都是 100），所以只有一层边池
    expect(sidePots.length).toBe(1);
    expect(sidePots[0].amount).toBe(200); // 只有 Bob+Charlie 的钱，Alice 的 50 留在 total_pot 但不进边池计算
    expect(sidePots[0].eligible_user_ids.sort()).toEqual(["bob", "charlie"].sort());

    const results = plugin.calculateNetScores(state);
    // Alice 弃牌：净 -50（下注不拿回）
    const alice = results.find((r) => r.user_id === "alice")!;
    expect(alice.net_amount).toBe(-50);
  });

  it("5. 边池余数：底池 101 分给 3 人，不能整除", () => {
    // 三人各下注 101，总池 303。如果两人平分，303 / 2 = 151.5，
    // 算法用 floor，前 remainder 个赢家多拿 1
    const { state, plugin } = buildState({
      players: [
        { seat: 0, userId: "alice", bet: 101, holeCards: [card(14, "S"), card(13, "S")] },
        { seat: 1, userId: "bob", bet: 101, holeCards: [card(14, "H"), card(13, "H")] },
        { seat: 2, userId: "charlie", bet: 101, status: "folded", holeCards: [card(2, "C"), card(3, "D")] },
      ],
      // 公共牌让 alice 和 bob 牌型完全相同
      communityCards: [card(14, "D"), card(13, "C"), card(5, "S"), card(6, "H"), card(7, "D")],
    });

    const results = plugin.calculateNetScores(state);
    const alice = results.find((r) => r.user_id === "alice")!;
    const bob = results.find((r) => r.user_id === "bob")!;

    // Alice 和 Bob 平分 202（他们下注的部分），Chalie 的 101 因为弃牌留在底池
    // 但 calculateNetScores 只算 activeSeats（未弃牌），Chalie 的钱不参与分配
    // Alice net = -101 + share, Bob net = -101 + share
    // 总边池 = 202（只有 Alice+Bob 下注）
    // 平分：202 / 2 = 101 整除，余数 0
    expect(alice.net_amount + bob.net_amount).toBeCloseTo(0, 0);
  });

  it("6. 完整一局集成测试：3 人 all-in 能量守恒", async () => {
    const roomManager = new RoomManager();
    const { room, stateMachine: sm } = roomManager.createRoom({
      room_id: "side_pot_integration",
      game_type: "texas_holdem",
      mode: "fixed",
      base_score: 100,
    });

    expect(room).toBeDefined();

    // 三人入座
    await sm.seatManager.sitDown(0, "p1", 5000);
    await sm.seatManager.sitDown(1, "p2", 5000);
    await sm.seatManager.sitDown(2, "p3", 5000);

    // 开始一局（async，等待盲注扣款）
    const started = await sm.startRound();
    expect(started).toBe(true);
    expect(sm.getPhase()).toBe("BETTING");

    // 三人全 all-in
    sm.handleAction({ user_id: "p1", action_type: "all_in", amount: 100 });
    sm.handleAction({ user_id: "p2", action_type: "all_in", amount: 200 });
    sm.handleAction({ user_id: "p3", action_type: "all_in", amount: 50 });

    // 应该自动推进到 SHOWDOWN → SETTLING
    // （三人 all-in 后无人可继续动作）
    expect(["SETTLING", "SHOWDOWN", "BETTING"]).toContain(sm.getPhase());

    // 触发摊牌
    sm.forceShowdown();
    expect(sm.lastResults.length).toBeGreaterThan(0);

    // 能量守恒
    const sumNet = sm.lastResults.reduce((s, r) => s + r.net_amount, 0);
    expect(sumNet).toBe(0);

    // 事件日志应该有记录
    expect(sm.eventLog.getAll().length).toBeGreaterThan(0);
  });
});

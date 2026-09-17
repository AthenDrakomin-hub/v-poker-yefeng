/**
 * 德州扑克牌型评估器单元测试 (Texas Hold'em Hand Evaluator Test)
 * 验证：
 * 1. 10 种国际标准牌型级别判定 (Royal Flush -> High Card)
 * 2. 顺子轮转 (Broadway 10-J-Q-K-A vs Wheel A-2-3-4-5)
 * 3. 基数-15 严格踢脚牌比对体系 (无倒挂，大踢脚牌严格优先)
 * 4. 7 选 5 最佳组合算法 (遍历 21 种组合选出最优 5 张)
 * 5. 比牌函数 compareEvaluations 排序与平手判定
 */

import { describe, it, expect } from "vitest";
import {
  evaluate5Cards,
  evaluate7Cards,
  compareEvaluations
} from "../games/texas_holdem/evaluator.js";
import { TexasHoldemDeck } from "../games/texas_holdem/deck.js";
import { Card } from "../shared/types.js";

function parseCards(codes: string[]): Card[] {
  return codes.map((c) => TexasHoldemDeck.parseCard(c));
}

describe("【德州扑克核心】牌型评估器 (Hand Evaluator)", () => {
  it("应准确识别 皇家同花顺 (Royal Flush)", () => {
    const cards = parseCards(["S-1", "S-13", "S-12", "S-11", "S-10"]);
    const res = evaluate5Cards(cards);

    expect(res.rank_level).toBe(10);
    expect(res.rank_name).toBe("皇家同花顺");
    expect(res.score).toBeGreaterThan(10000000);
  });

  it("应准确识别 普通同花顺 与 轮转同花顺 (Wheel Straight Flush)", () => {
    // 9 高同花顺
    const sf9 = parseCards(["H-9", "H-8", "H-7", "H-6", "H-5"]);
    const res9 = evaluate5Cards(sf9);
    expect(res9.rank_level).toBe(9);
    expect(res9.rank_name).toContain("同花顺");

    // A-2-3-4-5 轮转同花顺 (5 高)
    const wheelSf = parseCards(["D-1", "D-2", "D-3", "D-4", "D-5"]);
    const resWheel = evaluate5Cards(wheelSf);
    expect(resWheel.rank_level).toBe(9);
    expect(resWheel.rank_name).toBe("同花顺(5高)");

    // 9高同花顺应胜过 5高轮转同花顺
    expect(compareEvaluations(res9, resWheel)).toBeGreaterThan(0);
  });

  it("应准确识别 四条 (Four of a Kind) 并正确对比单张踢脚牌", () => {
    // 4个K + 1个A
    const quadKA = parseCards(["S-13", "H-13", "C-13", "D-13", "S-1"]);
    const resKA = evaluate5Cards(quadKA);
    expect(resKA.rank_level).toBe(8);
    expect(resKA.rank_name).toBe("四条(K)");

    // 4个K + 1个Q
    const quadKQ = parseCards(["S-13", "H-13", "C-13", "D-13", "S-12"]);
    const resKQ = evaluate5Cards(quadKQ);
    expect(resKQ.rank_level).toBe(8);

    // 同为四条K，带A踢脚牌者胜出
    expect(compareEvaluations(resKA, resKQ)).toBeGreaterThan(0);
  });

  it("应准确识别 葫芦 (Full House) 并遵循三条优先、对子破平规则", () => {
    // 3个K + 2个2
    const fhK2 = parseCards(["S-13", "H-13", "C-13", "S-2", "H-2"]);
    const resK2 = evaluate5Cards(fhK2);
    expect(resK2.rank_level).toBe(7);
    expect(resK2.rank_name).toBe("葫芦(K带2)");

    // 3个Q + 2个A
    const fhQA = parseCards(["S-12", "H-12", "C-12", "S-1", "H-1"]);
    const resQA = evaluate5Cards(fhQA);
    expect(resQA.rank_level).toBe(7);
    expect(resQA.rank_name).toBe("葫芦(Q带A)");

    // 三条更大者胜出 (K > Q，即使对子是 A)
    expect(compareEvaluations(resK2, resQA)).toBeGreaterThan(0);
  });

  it("应准确识别 同花 (Flush) 并在同花色下依次逐张比对点数", () => {
    // A-K-Q-J-9 同花
    const flush1 = parseCards(["S-1", "S-13", "S-12", "S-11", "S-9"]);
    const res1 = evaluate5Cards(flush1);
    expect(res1.rank_level).toBe(6);

    // A-K-Q-J-8 同花
    const flush2 = parseCards(["S-1", "S-13", "S-12", "S-11", "S-8"]);
    const res2 = evaluate5Cards(flush2);
    expect(res2.rank_level).toBe(6);

    // 第5张踢脚 9 严格胜过 8
    expect(compareEvaluations(res1, res2)).toBeGreaterThan(0);
  });

  it("应准确识别 顺子 (Straight)，包括 A-K-Q-J-10 与 A-2-3-4-5", () => {
    // 10-J-Q-K-A (Broadway 顺子，A高)
    const broadway = parseCards(["S-10", "H-11", "C-12", "D-13", "S-1"]);
    const resBroadway = evaluate5Cards(broadway);
    expect(resBroadway.rank_level).toBe(5);
    expect(resBroadway.rank_name).toBe("顺子(A高)");

    // A-2-3-4-5 (Wheel 顺子，5高)
    const wheel = parseCards(["S-1", "H-2", "C-3", "D-4", "S-5"]);
    const resWheel = evaluate5Cards(wheel);
    expect(resWheel.rank_level).toBe(5);
    expect(resWheel.rank_name).toBe("顺子(5高)");

    expect(compareEvaluations(resBroadway, resWheel)).toBeGreaterThan(0);
  });

  it("应准确识别 三条、两对、一对 与 高牌", () => {
    // 三条: 3个8 + A + K
    const trips = parseCards(["S-8", "H-8", "C-8", "D-1", "S-13"]);
    const resTrips = evaluate5Cards(trips);
    expect(resTrips.rank_level).toBe(4);
    expect(resTrips.rank_name).toBe("三条(8)");

    // 两对: A和K + 踢脚Q
    const twoPairAQ = parseCards(["S-1", "H-1", "C-13", "D-13", "S-12"]);
    const resTwoPairAQ = evaluate5Cards(twoPairAQ);
    expect(resTwoPairAQ.rank_level).toBe(3);
    expect(resTwoPairAQ.rank_name).toBe("两对(A与K)");

    // 两对: A和K + 踢脚J
    const twoPairAJ = parseCards(["S-1", "H-1", "C-13", "D-13", "S-11"]);
    const resTwoPairAJ = evaluate5Cards(twoPairAJ);
    expect(compareEvaluations(resTwoPairAQ, resTwoPairAJ)).toBeGreaterThan(0);

    // 一对: 对A + K, Q, J
    const onePair = parseCards(["S-1", "H-1", "C-13", "D-12", "S-11"]);
    const resOnePair = evaluate5Cards(onePair);
    expect(resOnePair.rank_level).toBe(2);
    expect(resOnePair.rank_name).toBe("一对(A)");

    // 高牌
    const highCard = parseCards(["S-1", "H-13", "C-11", "D-9", "S-7"]);
    const resHigh = evaluate5Cards(highCard);
    expect(resHigh.rank_level).toBe(1);
    expect(resHigh.rank_name).toBe("高牌(A大)");
  });

  it("7 选 5 评估 (7-card Evaluation)：应从 2 底牌 + 5 公共牌中挑出最强的 5 张组合", () => {
    // 底牌: 黑桃A, 黑桃K
    const hole = parseCards(["S-1", "S-13"]);
    // 公共牌: 黑桃Q, 黑桃J, 黑桃10, 红桃2, 方块3
    const community = parseCards(["S-12", "S-11", "S-10", "H-2", "D-3"]);

    const best = evaluate7Cards(hole, community);

    // 应自动挑出 5 张黑桃构成皇家同花顺，舍弃红桃2与方块3
    expect(best.rank_level).toBe(10);
    expect(best.rank_name).toBe("皇家同花顺");
    expect(best.best_cards?.length).toBe(5);

    const bestCodes = best.best_cards!.map((c) => c.code);
    expect(bestCodes).toContain("S-1");
    expect(bestCodes).toContain("S-13");
    expect(bestCodes).toContain("S-12");
    expect(bestCodes).toContain("S-11");
    expect(bestCodes).toContain("S-10");
  });

  it("牌数不足 5 张时，优雅返回牌数不足", () => {
    const hole = parseCards(["S-1", "S-13"]);
    const res = evaluate7Cards(hole, []);
    expect(res.rank_level).toBe(0);
    expect(res.rank_name).toBe("牌数不足");
  });
});

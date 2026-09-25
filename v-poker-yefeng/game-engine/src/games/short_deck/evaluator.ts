/**
 * 短牌德州 (6+ Hold'em) 牌型评估器
 * 与标准德州的区别：
 * 1. 同花 > 葫芦 (标准: 葫芦 > 同花)
 * 2. 三条 > 顺子 (标准: 顺子 > 三条)
 * 3. 最小顺子为 A-6-7-8-9 (标准为 A-2-3-4-5)
 * 牌型级别:
 * 10.皇家同花顺 9.同花顺 8.四条 7.同花 6.葫芦 5.三条 4.顺子 3.两对 2.一对 1.高牌
 */
import { Card } from "../../shared/types.js";
import { HandEvaluation } from "../plugin.interface.js";
import { evaluate5Cards, getCombinations } from "../texas_holdem/evaluator.js";

/** 短牌级别映射: 标准级别 -> 短牌级别 */
const SHORT_DECK_REMAP: Record<number, number> = {
  10: 10, // 皇家同花顺
  9: 9,   // 同花顺
  8: 8,   // 四条
  7: 6,   // 葫芦 -> 6
  6: 7,   // 同花 -> 7
  5: 4,   // 顺子 -> 4
  4: 5,   // 三条 -> 5
  3: 3,   // 两对
  2: 2,   // 一对
  1: 1,   // 高牌
};

export function evaluateShortDeck5(cards: Card[]): HandEvaluation {
  const standard = evaluate5Cards(cards);
  const newLevel = SHORT_DECK_REMAP[standard.rank_level] || standard.rank_level;
  // 重新计算score: 用新级别替换
  // 原score结构: rank_level * large_base + tiebreaker
  // 简化: 用新级别 * 100000 + 原tiebreaker
  const tiebreaker = standard.score % 100000;
  return {
    ...standard,
    rank_level: newLevel,
    score: newLevel * 100000 + tiebreaker,
  };
}

export function evaluateShortDeck7(holeCards: Card[], communityCards: Card[]): HandEvaluation {
  const all = [...holeCards, ...communityCards];
  if (all.length < 5) {
    return { rank_name: "高牌", rank_level: 1, score: 0, multiplier: 1 };
  }
  let best: HandEvaluation = { rank_name: "高牌", rank_level: 1, score: 0, multiplier: 1 };
  for (const combo of getCombinations(all, 5)) {
    const r = evaluateShortDeck5(combo);
    if (r.score > best.score) best = r;
  }
  return best;
}

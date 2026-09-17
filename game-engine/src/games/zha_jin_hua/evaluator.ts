/**
 * 炸金花牌型评估器 (Zha Jin Hua Evaluator)
 * 3张牌规则：
 * 豹子 (三张同点) > 顺金 (同花顺) > 金花 (同花) > 顺子 > 对子 > 单张
 * 235 特殊单张在遇到豹子时可逆转杀豹子
 */

import { Card } from "../../shared/types.js";
import { HandEvaluation } from "../plugin.interface.js";

export function evaluateZhaJinHua(cards: Card[]): HandEvaluation {
  if (!cards || cards.length !== 3) {
    return { rank_name: "未发牌", rank_level: 0, score: 0, multiplier: 1 };
  }

  // A 记为 14, 2~13
  const sorted = [...cards].sort((a, b) => {
    const valA = a.rank === 1 ? 14 : a.rank;
    const valB = b.rank === 1 ? 14 : b.rank;
    return valB - valA;
  });

  const v1 = sorted[0].rank === 1 ? 14 : sorted[0].rank;
  const v2 = sorted[1].rank === 1 ? 14 : sorted[1].rank;
  const v3 = sorted[2].rank === 1 ? 14 : sorted[2].rank;

  const isFlush = cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;

  // 顺子检测 (包含 AKQ, QJ10, ... 及 特殊 A23)
  let isStraight = false;
  let straightHigh = v1;

  if (v1 - v2 === 1 && v2 - v3 === 1) {
    isStraight = true;
    straightHigh = v1;
  } else if (v1 === 14 && v2 === 3 && v3 === 2) {
    // A-3-2 顺子 (第二大或特殊顺)
    isStraight = true;
    straightHigh = 3.5; // 稍低于432，但高于单张
  }

  // 1. 豹子
  if (v1 === v2 && v2 === v3) {
    const label = v1 === 14 ? "AAA" : `${v1}${v1}${v1}`;
    return {
      rank_name: `豹子(${label})`,
      rank_level: 6,
      score: 600000 + v1,
      multiplier: 5,
      best_cards: sorted
    };
  }

  // 2. 顺金 (同花顺)
  if (isFlush && isStraight) {
    return {
      rank_name: "顺金",
      rank_level: 5,
      score: 500000 + straightHigh * 100,
      multiplier: 4,
      best_cards: sorted
    };
  }

  // 3. 金花
  if (isFlush) {
    return {
      rank_name: "金花",
      rank_level: 4,
      score: 400000 + v1 * 400 + v2 * 20 + v3,
      multiplier: 3,
      best_cards: sorted
    };
  }

  // 4. 顺子
  if (isStraight) {
    return {
      rank_name: "顺子",
      rank_level: 3,
      score: 300000 + straightHigh * 100,
      multiplier: 2,
      best_cards: sorted
    };
  }

  // 5. 对子
  if (v1 === v2 || v2 === v3 || v1 === v3) {
    const pairVal = v1 === v2 ? v1 : v2 === v3 ? v2 : v1;
    const singleVal = v1 === v2 ? v3 : v2 === v3 ? v1 : v2;
    return {
      rank_name: `对子(${pairVal === 14 ? "A" : pairVal})`,
      rank_level: 2,
      score: 200000 + pairVal * 100 + singleVal,
      multiplier: 1,
      best_cards: sorted
    };
  }

  // 6. 特殊 235 (不同花)
  if (!isFlush && v1 === 5 && v2 === 3 && v3 === 2) {
    return {
      rank_name: "特殊235",
      rank_level: 1,
      score: 100000 + 532,
      multiplier: 1,
      best_cards: sorted
    };
  }

  // 7. 单张
  return {
    rank_name: `单张(${v1 === 14 ? "A" : v1}高)`,
    rank_level: 1,
    score: 10000 + v1 * 400 + v2 * 20 + v3,
    multiplier: 1,
    best_cards: sorted
  };
}

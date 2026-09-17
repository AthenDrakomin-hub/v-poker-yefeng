/**
 * 三公牌型评估器 (San Gong Evaluator)
 * 3张牌规则：
 * - J, Q, K 为公牌，计为 0 点
 * - A 为 1 点，2~10 依面值计点
 * - 点数 = (p1 + p2 + p3) % 10
 * 牌型层级：
 * 1. 大三公: 3张相同公牌 (KKK, QQQ, JJJ) -> 5倍 (最高)
 * 2. 小三公: 3张相同非公牌 (999, 888 ... AAA) -> 4倍
 * 3. 混三公: 3张公牌但不全同 (如 KQJ, KKQ) -> 3倍
 * 4. 点数牌: 9点、8点 (2倍), 7点 ~ 0点 (1倍)
 */

import { Card } from "../../shared/types.js";
import { HandEvaluation } from "../plugin.interface.js";

export function getSanGongPoint(rank: number): number {
  if (rank >= 10) return 0; // 10, J, Q, K 均算0点
  return rank; // A=1, 2..9
}

export function evaluateSanGong(cards: Card[]): HandEvaluation {
  if (!cards || cards.length !== 3) {
    return { rank_name: "未发牌", rank_level: 0, score: 0, multiplier: 1 };
  }

  // 排序：从大到小
  const sorted = [...cards].sort((a, b) => {
    const valA = a.rank === 1 ? 14 : a.rank;
    const valB = b.rank === 1 ? 14 : b.rank;
    return valB - valA;
  });

  const faceCardsCount = cards.filter((c) => c.rank >= 11).length; // J, Q, K
  const points = (getSanGongPoint(cards[0].rank) + getSanGongPoint(cards[1].rank) + getSanGongPoint(cards[2].rank)) % 10;

  const isAllSameRank = cards[0].rank === cards[1].rank && cards[1].rank === cards[2].rank;

  // 1. 大三公 (KKK, QQQ, JJJ)
  if (isAllSameRank && cards[0].rank >= 11) {
    const rankName = cards[0].rank === 13 ? "大三公(暴头K)" : cards[0].rank === 12 ? "大三公(Q)" : "大三公(J)";
    return {
      rank_name: rankName,
      rank_level: 100,
      score: 100000 + cards[0].rank,
      multiplier: 5,
      best_cards: sorted
    };
  }

  // 2. 小三公 (AAA, 999.. 222, 10-10-10)
  if (isAllSameRank) {
    const rVal = cards[0].rank === 1 ? 14 : cards[0].rank;
    return {
      rank_name: `小三公(${cards[0].rank === 1 ? "A" : cards[0].rank})`,
      rank_level: 80,
      score: 80000 + rVal,
      multiplier: 4,
      best_cards: sorted
    };
  }

  // 3. 混三公 (3张全部是公牌 JQK)
  if (faceCardsCount === 3) {
    return {
      rank_name: "混三公",
      rank_level: 60,
      score: 60000 + sorted[0].rank * 10 + sorted[1].rank,
      multiplier: 3,
      best_cards: sorted
    };
  }

  // 4. 点数牌：9点 ~ 0点
  // 综合打分：点数 * 1000 + 公牌数 * 100 + 最大单张大小 * 4 + 最大花色权重
  const maxCard = sorted[0];
  const maxCardVal = maxCard.rank === 1 ? 14 : maxCard.rank;
  const suitWeight = maxCard.suit === "S" ? 4 : maxCard.suit === "H" ? 3 : maxCard.suit === "C" ? 2 : 1;
  const score = points * 1000 + faceCardsCount * 100 + maxCardVal * 4 + suitWeight;

  const multiplier = points >= 8 ? 2 : 1;
  const rank_name = `${points}点 (${faceCardsCount}公)`;

  return {
    rank_name,
    rank_level: points,
    score,
    multiplier,
    best_cards: sorted
  };
}

/**
 * 牛牛牌型评估器 (Niu Niu Evaluator)
 * 5张牌规则：
 * 1. 任意选出3张牌点数和为10的整数倍 (J, Q, K 均记为 10 点，A 记为 1 点)
 * 2. 另外2张牌点数相加模 10 即为牛几 (0 为牛牛)
 * 特殊大牌：
 * - 五小牛: 5张牌点数均小于5且总点数<=10 (5倍)
 * - 炸弹牛 (四炸): 4张同点数牌 (4倍)
 * - 五花牛 (金牛): 5张牌全部由 J, Q, K 组成 (4倍)
 * - 牛牛: 3张能凑10整数倍，另外2张和模10为0 (3倍)
 * - 牛九/牛八/牛七: 2倍
 * - 牛六 ~ 牛一: 1倍
 * - 无牛: 1倍
 */

import { Card } from "../../shared/types.js";
import { HandEvaluation } from "../plugin.interface.js";

export function getCardPoint(rank: number): number {
  if (rank >= 10) return 10; // 10, J, Q, K
  return rank; // A=1, 2..9
}

export function evaluateNiuNiu(cards: Card[]): HandEvaluation {
  if (!cards || cards.length !== 5) {
    return { rank_name: "未发牌", rank_level: 0, score: 0, multiplier: 1 };
  }

  // 排序：从大到小，A记为14方便做炸弹判定
  const sorted = [...cards].sort((a, b) => {
    const valA = a.rank === 1 ? 14 : a.rank;
    const valB = b.rank === 1 ? 14 : b.rank;
    return valB - valA;
  });

  const totalPoints = cards.reduce((sum, c) => sum + getCardPoint(c.rank), 0);
  const isAllUnder5 = cards.every((c) => c.rank <= 4 && c.rank >= 1);

  // 1. 五小牛：5张都<=4且总点数<=10
  if (isAllUnder5 && totalPoints <= 10) {
    return {
      rank_name: "五小牛",
      rank_level: 100,
      score: 100000 + sorted[0].rank * 10 + sorted[1].rank,
      multiplier: 5,
      best_cards: sorted
    };
  }

  // 2. 炸弹牛：4张同点数
  const rankCounts: Record<number, number> = {};
  cards.forEach((c) => {
    rankCounts[c.rank] = (rankCounts[c.rank] || 0) + 1;
  });
  const fourOfAKind = Object.entries(rankCounts).find(([_, count]) => count === 4);
  if (fourOfAKind) {
    const bombRank = Number(fourOfAKind[0]);
    return {
      rank_name: "炸弹牛",
      rank_level: 90,
      score: 90000 + (bombRank === 1 ? 14 : bombRank),
      multiplier: 4,
      best_cards: sorted
    };
  }

  // 3. 五花牛 (金牛)：5张全部为 J, Q, K (rank >= 11)
  const isAllFace = cards.every((c) => c.rank >= 11);
  if (isAllFace) {
    return {
      rank_name: "五花牛",
      rank_level: 80,
      score: 80000 + sorted[0].rank * 10 + sorted[1].rank,
      multiplier: 4,
      best_cards: sorted
    };
  }

  // 4. 普通牛牛与牛一 ~ 牛九算法 (遍历组合 C(5, 3))
  let maxNiu = -1; // -1 表示无牛
  let bestTrio: Card[] = [];
  let bestDuo: Card[] = [];

  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      for (let k = j + 1; k < 5; k++) {
        const p1 = getCardPoint(cards[i].rank);
        const p2 = getCardPoint(cards[j].rank);
        const p3 = getCardPoint(cards[k].rank);

        if ((p1 + p2 + p3) % 10 === 0) {
          // 剩下的两张
          const remaining = cards.filter((_, idx) => idx !== i && idx !== j && idx !== k);
          const r1 = getCardPoint(remaining[0].rank);
          const r2 = getCardPoint(remaining[1].rank);
          let niu = (r1 + r2) % 10;
          if (niu === 0) niu = 10; // 牛牛

          if (niu > maxNiu) {
            maxNiu = niu;
            bestTrio = [cards[i], cards[j], cards[k]];
            bestDuo = remaining;
          }
        }
      }
    }
  }

  // 最大单牌作为 tie-breaker
  const maxCardRank = sorted[0].rank === 1 ? 14 : sorted[0].rank;
  const suitWeight = sorted[0].suit === "S" ? 4 : sorted[0].suit === "H" ? 3 : sorted[0].suit === "C" ? 2 : 1;

  if (maxNiu === 10) {
    return {
      rank_name: "牛牛",
      rank_level: 70,
      score: 70000 + maxCardRank * 10 + suitWeight,
      multiplier: 3,
      best_cards: [...bestTrio, ...bestDuo]
    };
  }

  if (maxNiu >= 1) {
    const multiplier = maxNiu >= 7 ? 2 : 1;
    const names = ["", "牛一", "牛二", "牛三", "牛四", "牛五", "牛六", "牛七", "牛八", "牛九"];
    return {
      rank_name: names[maxNiu],
      rank_level: 10 + maxNiu,
      score: 1000 * maxNiu + maxCardRank * 10 + suitWeight,
      multiplier,
      best_cards: [...bestTrio, ...bestDuo]
    };
  }

  // 无牛
  return {
    rank_name: "无牛",
    rank_level: 0,
    score: maxCardRank * 10 + suitWeight,
    multiplier: 1,
    best_cards: sorted
  };
}

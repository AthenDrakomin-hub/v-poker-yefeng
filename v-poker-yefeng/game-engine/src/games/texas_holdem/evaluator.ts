/**
 * 德州扑克牌型评估器 (7-card & 5-card Texas Hold'em Evaluator)
 * 从 2 张底牌 + 5 张公共牌 (共7张) 中挑选最强 5 张组合 (C(7, 5) = 21 种可能)
 * 牌型等级 (Rank Level 1 ~ 10):
 * 10. 皇家同花顺 (Royal Flush) - A K Q J 10 同花
 * 9.  同花顺 (Straight Flush) - 5张同花顺子 (含轮转 5-4-3-2-A 同花顺)
 * 8.  四条/金刚 (Four of a Kind)
 * 7.  葫芦/满堂红 (Full House)
 * 6.  同花 (Flush)
 * 5.  顺子 (Straight) - (含轮转 5-4-3-2-A 顺子)
 * 4.  三条 (Three of a Kind)
 * 3.  两对 (Two Pair)
 * 2.  一对 (One Pair)
 * 1.  高牌 (High Card)
 *
 * 采用严格基数-15 (Base-15) 逐级权重计分体系，彻底消除踢脚牌 (Kicker) 碰撞与倒挂缺陷。
 */

import { Card } from "../../shared/types.js";
import { HandEvaluation } from "../plugin.interface.js";

export function getCombinations<T>(array: T[], k: number): T[][] {
  const result: T[][] = [];
  function backtrack(start: number, current: T[]) {
    if (current.length === k) {
      result.push([...current]);
      return;
    }
    for (let i = start; i < array.length; i++) {
      current.push(array[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }
  backtrack(0, []);
  return result;
}

/**
 * 计算 5 张单调递减点数的唯一权重分 (Radix 15)
 * 范围: 2..14，每级差值严格单调
 */
function score5(v: number[]): number {
  return v[0] * 50625 + v[1] * 3375 + v[2] * 225 + v[3] * 15 + v[4];
}

const RANK_LABELS: Record<number, string> = {
  14: "A",
  13: "K",
  12: "Q",
  11: "J",
  10: "10",
  9: "9",
  8: "8",
  7: "7",
  6: "6",
  5: "5",
  4: "4",
  3: "3",
  2: "2"
};

/**
 * 精确评估 5 张扑克牌的牌型与强度打分
 */
export function evaluate5Cards(cards: Card[]): HandEvaluation {
  if (cards.length !== 5) {
    throw new Error(`evaluate5Cards requires exactly 5 cards, got ${cards.length}`);
  }

  // A=14, 2~13
  const sorted = [...cards].sort((a, b) => {
    const valA = a.rank === 1 ? 14 : a.rank;
    const valB = b.rank === 1 ? 14 : b.rank;
    return valB - valA;
  });

  const vals = sorted.map((c) => (c.rank === 1 ? 14 : c.rank));
  const isFlush = sorted.every((c) => c.suit === sorted[0].suit);

  // 顺子判断 (包括 A-K-Q-J-10 和 A-5-4-3-2)
  let isStraight = false;
  let straightHigh = 0;

  if (
    vals[0] - vals[1] === 1 &&
    vals[1] - vals[2] === 1 &&
    vals[2] - vals[3] === 1 &&
    vals[3] - vals[4] === 1
  ) {
    isStraight = true;
    straightHigh = vals[0];
  } else if (
    vals[0] === 14 &&
    vals[1] === 5 &&
    vals[2] === 4 &&
    vals[3] === 3 &&
    vals[4] === 2
  ) {
    // A-5-4-3-2 轮转顺 (Wheel Straight)，高位计为 5
    isStraight = true;
    straightHigh = 5;
  }

  // 统计点数频率
  const counts: Record<number, number> = {};
  vals.forEach((v) => {
    counts[v] = (counts[v] || 0) + 1;
  });
  const countEntries = Object.entries(counts).map(([v, count]) => ({
    val: Number(v),
    count
  }));
  // 按出现频率从高到低排序，同频则按点数从大到小
  countEntries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.val - a.val;
  });

  // 1. 皇家同花顺 (Royal Flush) / 同花顺 (Straight Flush)
  if (isFlush && isStraight) {
    if (straightHigh === 14) {
      return {
        rank_name: "皇家同花顺",
        rank_level: 10,
        score: 10000000 + 14,
        multiplier: 10,
        best_cards: sorted
      };
    }
    const highLabel = RANK_LABELS[straightHigh] || straightHigh.toString();
    return {
      rank_name: `同花顺(${highLabel}高)`,
      rank_level: 9,
      score: 9000000 + straightHigh,
      multiplier: 8,
      best_cards: sorted
    };
  }

  // 2. 四条 (Four of a Kind)
  if (countEntries[0].count === 4) {
    const quad = countEntries[0].val;
    const kicker = countEntries[1].val;
    const quadLabel = RANK_LABELS[quad] || quad.toString();
    return {
      rank_name: `四条(${quadLabel})`,
      rank_level: 8,
      score: 8000000 + quad * 15 + kicker,
      multiplier: 6,
      best_cards: sorted
    };
  }

  // 3. 葫芦 (Full House)
  if (countEntries[0].count === 3 && countEntries[1].count === 2) {
    const trio = countEntries[0].val;
    const pair = countEntries[1].val;
    const trioLabel = RANK_LABELS[trio] || trio.toString();
    const pairLabel = RANK_LABELS[pair] || pair.toString();
    return {
      rank_name: `葫芦(${trioLabel}带${pairLabel})`,
      rank_level: 7,
      score: 7000000 + trio * 15 + pair,
      multiplier: 5,
      best_cards: sorted
    };
  }

  // 4. 同花 (Flush)
  if (isFlush) {
    const score = 6000000 + score5(vals);
    const highLabel = RANK_LABELS[vals[0]] || vals[0].toString();
    return {
      rank_name: `同花(${highLabel}高)`,
      rank_level: 6,
      score,
      multiplier: 4,
      best_cards: sorted
    };
  }

  // 5. 顺子 (Straight)
  if (isStraight) {
    const highLabel = RANK_LABELS[straightHigh] || straightHigh.toString();
    return {
      rank_name: `顺子(${highLabel}高)`,
      rank_level: 5,
      score: 5000000 + straightHigh,
      multiplier: 3,
      best_cards: sorted
    };
  }

  // 6. 三条 (Three of a Kind)
  if (countEntries[0].count === 3) {
    const trio = countEntries[0].val;
    const k1 = countEntries[1].val;
    const k2 = countEntries[2].val;
    const trioLabel = RANK_LABELS[trio] || trio.toString();
    return {
      rank_name: `三条(${trioLabel})`,
      rank_level: 4,
      score: 4000000 + trio * 225 + k1 * 15 + k2,
      multiplier: 2,
      best_cards: sorted
    };
  }

  // 7. 两对 (Two Pair)
  if (countEntries[0].count === 2 && countEntries[1].count === 2) {
    const p1 = Math.max(countEntries[0].val, countEntries[1].val);
    const p2 = Math.min(countEntries[0].val, countEntries[1].val);
    const kicker = countEntries[2].val;
    const p1Label = RANK_LABELS[p1] || p1.toString();
    const p2Label = RANK_LABELS[p2] || p2.toString();
    return {
      rank_name: `两对(${p1Label}与${p2Label})`,
      rank_level: 3,
      score: 3000000 + p1 * 225 + p2 * 15 + kicker,
      multiplier: 1.5,
      best_cards: sorted
    };
  }

  // 8. 一对 (One Pair)
  if (countEntries[0].count === 2) {
    const pair = countEntries[0].val;
    const k1 = countEntries[1].val;
    const k2 = countEntries[2].val;
    const k3 = countEntries[3].val;
    const pairLabel = RANK_LABELS[pair] || pair.toString();
    return {
      rank_name: `一对(${pairLabel})`,
      rank_level: 2,
      score: 2000000 + pair * 3375 + k1 * 225 + k2 * 15 + k3,
      multiplier: 1,
      best_cards: sorted
    };
  }

  // 9. 高牌 (High Card)
  const score = 1000000 + score5(vals);
  const highLabel = RANK_LABELS[vals[0]] || vals[0].toString();
  return {
    rank_name: `高牌(${highLabel}大)`,
    rank_level: 1,
    score,
    multiplier: 1,
    best_cards: sorted
  };
}

/**
 * 7 选 5 最佳牌型评估 (7-card Evaluation)
 * 遍历 C(7, 5) = 21 种组合，找出综合评分最高的 5 张牌
 */
export function evaluate7Cards(holeCards: Card[], communityCards: Card[]): HandEvaluation {
  const allCards = [...holeCards, ...communityCards];
  if (allCards.length < 5) {
    return { rank_name: "牌数不足", rank_level: 0, score: 0, multiplier: 1 };
  }
  if (allCards.length === 5) {
    return evaluate5Cards(allCards);
  }

  const combos = getCombinations(allCards, 5);
  let bestEval: HandEvaluation = {
    rank_name: "高牌",
    rank_level: 0,
    score: -1,
    multiplier: 1
  };

  for (const five of combos) {
    const current = evaluate5Cards(five);
    if (current.score > bestEval.score) {
      bestEval = current;
    }
  }

  return bestEval;
}

/**
 * 比较两副牌的优胜结果
 * 返回: >0 表示 evalA 获胜，<0 表示 evalB 获胜，0 表示平手 (Split Pot)
 */
export function compareEvaluations(evalA: HandEvaluation, evalB: HandEvaluation): number {
  return evalA.score - evalB.score;
}

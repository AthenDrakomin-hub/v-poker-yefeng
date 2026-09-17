/**
 * 前端沙盒多游戏牌型判定算法 (Client Simulator Evaluators)
 * 精确实现：德州扑克、炸金花、牛牛、三公
 */

import { Card } from "../types";

export interface EvaluatedHand {
  name: string;
  rankLevel: number;
  score: number;
  multiplier: number;
  highlightCards?: Card[];
}

// ----------------- 1. 牛牛算法 (5张牌，3凑整十，2看余数) -----------------
export function evaluateNiuNiu(cards: Card[]): EvaluatedHand {
  if (cards.length !== 5) {
    return { name: "等待发牌", rankLevel: 0, score: 0, multiplier: 1 };
  }

  const getPoint = (r: number) => (r >= 10 ? 10 : r);
  const total = cards.reduce((sum, c) => sum + getPoint(c.rank), 0);
  const isAllUnder5 = cards.every((c) => c.rank <= 4 && c.rank >= 1);

  // 五小牛
  if (isAllUnder5 && total <= 10) {
    return { name: "五小牛", rankLevel: 100, score: 100000, multiplier: 5, highlightCards: cards };
  }

  // 炸弹牛 (4张同点数)
  const counts: Record<number, number> = {};
  cards.forEach((c) => (counts[c.rank] = (counts[c.rank] || 0) + 1));
  const bomb = Object.entries(counts).find(([_, count]) => count === 4);
  if (bomb) {
    return { name: `炸弹牛(${bomb[0]})`, rankLevel: 90, score: 90000 + Number(bomb[0]), multiplier: 4 };
  }

  // 五花牛 (全部 J, Q, K)
  if (cards.every((c) => c.rank >= 11)) {
    return { name: "五花牛(金牛)", rankLevel: 80, score: 80000, multiplier: 4, highlightCards: cards };
  }

  // 遍历 3+2 组合
  let bestNiu = -1;
  let bestCombo: Card[] = [];

  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      for (let k = j + 1; k < 5; k++) {
        const sum3 = getPoint(cards[i].rank) + getPoint(cards[j].rank) + getPoint(cards[k].rank);
        if (sum3 % 10 === 0) {
          const rest = cards.filter((_, idx) => idx !== i && idx !== j && idx !== k);
          const restSum = getPoint(rest[0].rank) + getPoint(rest[1].rank);
          let n = restSum % 10;
          if (n === 0) n = 10; // 牛牛
          if (n > bestNiu) {
            bestNiu = n;
            bestCombo = [cards[i], cards[j], cards[k], ...rest];
          }
        }
      }
    }
  }

  // 找出最大单张牌作为 tie breaker
  const maxRank = Math.max(...cards.map((c) => (c.rank === 1 ? 14 : c.rank)));

  if (bestNiu === 10) {
    return { name: "牛牛", rankLevel: 70, score: 70000 + maxRank, multiplier: 3, highlightCards: bestCombo };
  }
  if (bestNiu >= 1) {
    const mult = bestNiu >= 7 ? 2 : 1;
    const names = ["", "牛一", "牛二", "牛三", "牛四", "牛五", "牛六", "牛七", "牛八", "牛九"];
    return {
      name: names[bestNiu],
      rankLevel: 10 + bestNiu,
      score: 1000 * bestNiu + maxRank,
      multiplier: mult,
      highlightCards: bestCombo
    };
  }

  return { name: "无牛", rankLevel: 0, score: maxRank, multiplier: 1 };
}

// ----------------- 2. 三公算法 (3张牌，JQK算0点，公牌统计) -----------------
export function evaluateSanGong(cards: Card[]): EvaluatedHand {
  if (cards.length !== 3) {
    return { name: "等待发牌", rankLevel: 0, score: 0, multiplier: 1 };
  }

  const getPt = (r: number) => (r >= 10 ? 0 : r);
  const faceCards = cards.filter((c) => c.rank >= 11).length;
  const points = (getPt(cards[0].rank) + getPt(cards[1].rank) + getPt(cards[2].rank)) % 10;
  const isAllSame = cards[0].rank === cards[1].rank && cards[1].rank === cards[2].rank;

  // 大三公 (KKK, QQQ, JJJ)
  if (isAllSame && cards[0].rank >= 11) {
    const faceName = cards[0].rank === 13 ? "K" : cards[0].rank === 12 ? "Q" : "J";
    return { name: `大三公(${faceName})`, rankLevel: 100, score: 100000 + cards[0].rank, multiplier: 5, highlightCards: cards };
  }

  // 小三公 (AAA, 999.. 222)
  if (isAllSame) {
    const rVal = cards[0].rank === 1 ? 14 : cards[0].rank;
    return { name: `小三公(${cards[0].rank === 1 ? "A" : cards[0].rank})`, rankLevel: 80, score: 80000 + rVal, multiplier: 4, highlightCards: cards };
  }

  // 混三公 (3张都是 JQK)
  if (faceCards === 3) {
    return { name: "混三公", rankLevel: 60, score: 60000, multiplier: 3, highlightCards: cards };
  }

  // 点数牌
  const maxRank = Math.max(...cards.map((c) => (c.rank === 1 ? 14 : c.rank)));
  const score = points * 1000 + faceCards * 100 + maxRank;
  const multiplier = points >= 8 ? 2 : 1;

  return {
    name: `${points}点 (${faceCards}公)`,
    rankLevel: points,
    score,
    multiplier
  };
}

// ----------------- 3. 炸金花算法 (3张牌，豹子>顺金>金花>顺子>对子>单张) -----------------
export function evaluateZhaJinHua(cards: Card[]): EvaluatedHand {
  if (cards.length !== 3) {
    return { name: "等待发牌", rankLevel: 0, score: 0, multiplier: 1 };
  }

  const sorted = [...cards].sort((a, b) => {
    const va = a.rank === 1 ? 14 : a.rank;
    const vb = b.rank === 1 ? 14 : b.rank;
    return vb - va;
  });

  const v1 = sorted[0].rank === 1 ? 14 : sorted[0].rank;
  const v2 = sorted[1].rank === 1 ? 14 : sorted[1].rank;
  const v3 = sorted[2].rank === 1 ? 14 : sorted[2].rank;

  const isFlush = cards[0].suit === cards[1].suit && cards[1].suit === cards[2].suit;
  const isStraight = (v1 - v2 === 1 && v2 - v3 === 1) || (v1 === 14 && v2 === 3 && v3 === 2);

  // 豹子
  if (v1 === v2 && v2 === v3) {
    const l = v1 === 14 ? "AAA" : `${v1}${v1}${v1}`;
    return { name: `豹子(${l})`, rankLevel: 6, score: 600000 + v1, multiplier: 5, highlightCards: sorted };
  }

  // 顺金
  if (isFlush && isStraight) {
    return { name: "顺金", rankLevel: 5, score: 500000 + v1, multiplier: 4, highlightCards: sorted };
  }

  // 金花
  if (isFlush) {
    return { name: "金花", rankLevel: 4, score: 400000 + v1 * 400 + v2 * 20 + v3, multiplier: 3, highlightCards: sorted };
  }

  // 顺子
  if (isStraight) {
    return { name: "顺子", rankLevel: 3, score: 300000 + v1, multiplier: 2, highlightCards: sorted };
  }

  // 对子
  if (v1 === v2 || v2 === v3 || v1 === v3) {
    const pVal = v1 === v2 ? v1 : v2 === v3 ? v2 : v1;
    return { name: `对子(${pVal === 14 ? "A" : pVal})`, rankLevel: 2, score: 200000 + pVal * 100, multiplier: 1, highlightCards: sorted };
  }

  // 特殊 235
  if (!isFlush && v1 === 5 && v2 === 3 && v3 === 2) {
    return { name: "特殊235", rankLevel: 1, score: 100532, multiplier: 1, highlightCards: sorted };
  }

  return { name: `单张(${v1 === 14 ? "A" : v1}高)`, rankLevel: 1, score: 10000 + v1 * 400 + v2 * 20 + v3, multiplier: 1 };
}

// ----------------- 4. 德州扑克算法 (2底牌+5公共牌选5) -----------------
export function evaluateTexas7Cards(holeCards: Card[], communityCards: Card[]): EvaluatedHand {
  const all = [...holeCards, ...communityCards];
  if (all.length < 5) {
    return { name: "底牌2张", rankLevel: 0, score: 0, multiplier: 1 };
  }

  // 取 5 张组合
  const combos: Card[][] = [];
  function backtrack(start: number, cur: Card[]) {
    if (cur.length === 5) {
      combos.push([...cur]);
      return;
    }
    for (let i = start; i < all.length; i++) {
      cur.push(all[i]);
      backtrack(i + 1, cur);
      cur.pop();
    }
  }
  backtrack(0, []);

  let best: EvaluatedHand = { name: "高牌", rankLevel: 0, score: -1, multiplier: 1 };
  combos.forEach((five) => {
    const cur = eval5Cards(five);
    if (cur.score > best.score) {
      best = cur;
    }
  });

  return best;
}

function eval5Cards(cards: Card[]): EvaluatedHand {
  const sorted = [...cards].sort((a, b) => {
    const va = a.rank === 1 ? 14 : a.rank;
    const vb = b.rank === 1 ? 14 : b.rank;
    return vb - va;
  });

  const vals = sorted.map((c) => (c.rank === 1 ? 14 : c.rank));
  const isFlush = sorted.every((c) => c.suit === sorted[0].suit);
  const isStraight =
    (vals[0] - vals[1] === 1 &&
      vals[1] - vals[2] === 1 &&
      vals[2] - vals[3] === 1 &&
      vals[3] - vals[4] === 1) ||
    (vals[0] === 14 && vals[1] === 5 && vals[2] === 4 && vals[3] === 3 && vals[4] === 2);

  const counts: Record<number, number> = {};
  vals.forEach((v) => (counts[v] = (counts[v] || 0) + 1));
  const cList = Object.entries(counts)
    .map(([val, count]) => ({ val: Number(val), count }))
    .sort((a, b) => b.count - a.count || b.val - a.val);

  if (isFlush && isStraight) {
    return { name: vals[0] === 14 ? "皇家同花顺" : "同花顺", rankLevel: 9, score: 9000000 + vals[0], multiplier: 8, highlightCards: sorted };
  }
  if (cList[0].count === 4) {
    return { name: `四条(${cList[0].val})`, rankLevel: 8, score: 8000000 + cList[0].val, multiplier: 6, highlightCards: sorted };
  }
  if (cList[0].count === 3 && cList[1].count === 2) {
    return { name: `葫芦(${cList[0].val}带${cList[1].val})`, rankLevel: 7, score: 7000000 + cList[0].val * 100 + cList[1].val, multiplier: 5, highlightCards: sorted };
  }
  if (isFlush) {
    return { name: "同花", rankLevel: 6, score: 6000000 + vals[0] * 1000 + vals[1], multiplier: 4, highlightCards: sorted };
  }
  if (isStraight) {
    return { name: "顺子", rankLevel: 5, score: 5000000 + vals[0], multiplier: 3, highlightCards: sorted };
  }
  if (cList[0].count === 3) {
    return { name: `三条(${cList[0].val})`, rankLevel: 4, score: 4000000 + cList[0].val, multiplier: 2, highlightCards: sorted };
  }
  if (cList[0].count === 2 && cList[1].count === 2) {
    return { name: `两对(${cList[0].val}&${cList[1].val})`, rankLevel: 3, score: 3000000 + cList[0].val * 100 + cList[1].val, multiplier: 1.5, highlightCards: sorted };
  }
  if (cList[0].count === 2) {
    return { name: `一对(${cList[0].val})`, rankLevel: 2, score: 2000000 + cList[0].val * 100, multiplier: 1, highlightCards: sorted };
  }
  return { name: `高牌(${vals[0]}大)`, rankLevel: 1, score: 1000000 + vals[0] * 100, multiplier: 1, highlightCards: sorted };
}

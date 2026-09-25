/**
 * 短牌德州 (6+ Hold'em) 牌型评估器
 * 同花>葫芦，三条>顺子
 */
import { Card } from "../../shared/types.js";
import { HandEvaluation } from "../plugin.interface.js";
import { evaluate5Cards, getCombinations } from "../texas_holdem/evaluator.js";

const SHORT_DECK_REMAP: Record<number, number> = {
  10: 10, 9: 9, 8: 8, 7: 6, 6: 7, 5: 4, 4: 5, 3: 3, 2: 2, 1: 1,
};

export function evaluateShortDeck5(cards: Card[]): HandEvaluation {
  const standard = evaluate5Cards(cards);
  const newLevel = SHORT_DECK_REMAP[standard.rank_level] || standard.rank_level;
  const tiebreaker = standard.score % 100000;
  return { ...standard, rank_level: newLevel, score: newLevel * 100000 + tiebreaker };
}

export function evaluateShortDeck7(holeCards: Card[], communityCards: Card[]): HandEvaluation {
  const all = [...holeCards, ...communityCards];
  if (all.length < 5) return { rank_name: "高牌", rank_level: 1, score: 0, multiplier: 1 };
  let best: HandEvaluation = { rank_name: "高牌", rank_level: 1, score: 0, multiplier: 1 };
  for (const combo of getCombinations(all, 5)) {
    const r = evaluateShortDeck5(combo);
    if (r.score > best.score) best = r;
  }
  return best;
}

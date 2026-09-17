/**
 * 前端沙盒卡牌与牌堆工具
 */

import { Card, Suit } from "../types";

export function createStandardDeck(): Card[] {
  const suits: Suit[] = ["S", "H", "C", "D"];
  const deck: Card[] = [];
  for (const suit of suits) {
    for (let rank = 1; rank <= 13; rank++) {
      deck.push({
        suit,
        rank,
        code: `${suit}-${rank}`
      });
    }
  }
  // Fisher-Yates
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function getSuitSymbol(suit: Suit): string {
  switch (suit) {
    case "S":
      return "♠";
    case "H":
      return "♥";
    case "C":
      return "♣";
    case "D":
      return "♦";
  }
}

export function getRankLabel(rank: number): string {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return rank.toString();
}

export function isRedSuit(suit: Suit): boolean {
  return suit === "H" || suit === "D";
}

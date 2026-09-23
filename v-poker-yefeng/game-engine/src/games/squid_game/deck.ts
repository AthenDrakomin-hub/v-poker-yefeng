/**
 * 德州扑克牌堆管理模块 (Texas Hold'em Deck Management)
 * 包含：
 * 1. 52 张标准扑克牌初始化 (4 种花色，13 个点数，无大小王)
 * 2. 洗牌算法 (Fisher-Yates Shuffle，支持种子/可预测 PRNG)
 * 3. 德州发牌与烧牌规范：
 *    - 底牌分发 (Hole Cards: 两人至多人轮流发两轮，每人2张)
 *    - 翻牌圈 (Flop: 烧1张，发3张公共牌)
 *    - 转牌圈 (Turn: 烧1张，发第4张公共牌)
 *    - 河牌圈 (River: 烧1张，发第5张公共牌)
 * 4. 牌堆完整性校验与余牌追踪
 */

import { Card, Suit } from "../../shared/types.js";

export const SUITS: Suit[] = ["S", "H", "C", "D"]; // 黑桃(Spade), 红桃(Heart), 梅花(Club), 方块(Diamond)
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13] as const;

/**
 * 创建一副全新的 52 张标准无重复扑克牌
 */
export function createStandardDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit,
        rank,
        code: `${suit}-${rank}`
      });
    }
  }
  return deck;
}

/**
 * Fisher-Yates 原地洗牌算法
 */
export function shuffleDeck(deck: Card[], rng: () => number = Math.random): Card[] {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export interface DeckOptions {
  seedRng?: () => number;
  initialCards?: Card[];
}

export class TexasHoldemDeck {
  private cards: Card[] = [];
  private burnedCards: Card[] = [];
  private rng: () => number;

  constructor(options?: DeckOptions) {
    this.rng = options?.seedRng || Math.random;
    if (options?.initialCards && options.initialCards.length > 0) {
      this.cards = [...options.initialCards];
    } else {
      this.reset();
    }
  }

  /**
   * 重置牌堆为完整 52 张并清空废牌堆
   */
  public reset(): void {
    this.cards = createStandardDeck();
    this.burnedCards = [];
  }

  /**
   * 洗牌
   */
  public shuffle(): void {
    shuffleDeck(this.cards, this.rng);
  }

  /**
   * 烧牌 (Burn 1 Card: 德州防窥牌规则，在展开公共牌前烧弃1张牌)
   */
  public burn(): Card {
    if (this.cards.length === 0) {
      throw new Error("Cannot burn card: deck is empty.");
    }
    const burned = this.cards.pop()!;
    this.burnedCards.push(burned);
    return burned;
  }

  /**
   * 发单张或多张牌
   */
  public deal(count: number = 1): Card[] {
    if (count <= 0) return [];
    if (this.cards.length < count) {
      throw new Error(`Cannot deal ${count} cards: only ${this.cards.length} cards remaining in deck.`);
    }
    const dealt: Card[] = [];
    for (let i = 0; i < count; i++) {
      dealt.push(this.cards.pop()!);
    }
    return dealt;
  }

  /**
   * 荷官轮流发底牌 (Hole Cards Dealing)
   * 德州正规规则：顺时针每位玩家每次发1张，发满2轮，每人获得2张底牌
   */
  public dealHoleCards(playerCount: number): Card[][] {
    if (playerCount < 2 || playerCount > 10) {
      throw new Error(`Invalid player count for Texas Hold'em: ${playerCount} (must be 2-10).`);
    }
    const needed = playerCount * 2;
    if (this.cards.length < needed) {
      throw new Error(`Insufficient cards for ${playerCount} players: need ${needed}, remaining ${this.cards.length}.`);
    }

    const hands: Card[][] = Array.from({ length: playerCount }, () => []);
    // 第1轮每人发1张
    for (let p = 0; p < playerCount; p++) {
      hands[p].push(this.cards.pop()!);
    }
    // 第2轮每人发1张
    for (let p = 0; p < playerCount; p++) {
      hands[p].push(this.cards.pop()!);
    }
    return hands;
  }

  /**
   * 展开翻牌圈 (The Flop)
   * 规则：先烧 1 张，然后发出 3 张公共牌
   */
  public dealFlop(): Card[] {
    this.burn();
    return this.deal(3);
  }

  /**
   * 展开转牌圈 (The Turn)
   * 规则：先烧 1 张，然后发出第 4 张公共牌
   */
  public dealTurn(): Card {
    this.burn();
    return this.deal(1)[0];
  }

  /**
   * 展开河牌圈 (The River)
   * 规则：先烧 1 张，然后发出第 5 张公共牌
   */
  public dealRiver(): Card {
    this.burn();
    return this.deal(1)[0];
  }

  /**
   * 剩余牌数
   */
  public get remainingCount(): number {
    return this.cards.length;
  }

  /**
   * 已烧牌数
   */
  public get burnedCount(): number {
    return this.burnedCards.length;
  }

  /**
   * 获取当前牌堆副本
   */
  public getRemainingCards(): Card[] {
    return [...this.cards];
  }

  /**
   * 获取已烧弃的牌
   */
  public getBurnedCards(): Card[] {
    return [...this.burnedCards];
  }

  /**
   * 牌堆完整性检查 (验证是否有重复或遗失牌)
   */
  public verifyIntegrity(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const all = [...this.cards, ...this.burnedCards];
    const seen = new Set<string>();

    for (const card of all) {
      if (!SUITS.includes(card.suit)) {
        errors.push(`Invalid suit: ${card.suit}`);
      }
      if (card.rank < 1 || card.rank > 13) {
        errors.push(`Invalid rank: ${card.rank}`);
      }
      if (seen.has(card.code)) {
        errors.push(`Duplicate card detected: ${card.code}`);
      }
      seen.add(card.code);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 将字符串卡牌代号 (如 "S-1", "H-10", "D-13", "C-14") 解析为 Card 对象
   */
  public static parseCard(code: string): Card {
    const parts = code.toUpperCase().split("-");
    if (parts.length !== 2) {
      throw new Error(`Invalid card code format: ${code}. Expected e.g. "S-1" or "H-13"`);
    }
    const suit = parts[0] as Suit;
    if (!SUITS.includes(suit)) {
      throw new Error(`Invalid suit in card code: ${suit}`);
    }
    let rank = parseInt(parts[1], 10);
    if (rank === 14) rank = 1; // Ace 既可用 1 也可用 14 表示
    if (isNaN(rank) || rank < 1 || rank > 13) {
      throw new Error(`Invalid rank in card code: ${parts[1]}`);
    }
    return {
      suit,
      rank,
      code: `${suit}-${rank}`
    };
  }

  /**
   * 格式化卡牌为用户直观符号 (如 "♠A", "♥10", "♦K", "♣2")
   */
  public static formatCard(card: Card): string {
    const suitIcons: Record<Suit, string> = {
      S: "♠",
      H: "♥",
      C: "♣",
      D: "♦"
    };
    const rankNames: Record<number, string> = {
      1: "A",
      11: "J",
      12: "Q",
      13: "K"
    };
    const rankStr = rankNames[card.rank] || card.rank.toString();
    return `${suitIcons[card.suit]}${rankStr}`;
  }
}

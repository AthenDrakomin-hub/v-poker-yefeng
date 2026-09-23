/**
 * 德州扑克牌堆管理单元测试 (Texas Hold'em Deck Management Test)
 * 验证：
 * 1. 52 张标准扑克牌生成与完整性校验
 * 2. 洗牌算法与卡牌序列置乱
 * 3. 荷官正规轮发机制 (Hole Cards dealing round-robin)
 * 4. 德州经典发牌流程 (Preflop -> Flop 烧1发3 -> Turn 烧1发1 -> River 烧1发1)
 * 5. 余牌与烧牌数量精准计数
 * 6. 异常边界防护 (牌数不足、非法玩家数)
 */

import { describe, it, expect } from "vitest";
import { TexasHoldemDeck, createStandardDeck, shuffleDeck, SUITS, RANKS } from "../games/texas_holdem/deck.js";
import { Card } from "../shared/types.js";

describe("【德州扑克核心】牌堆管理 (Deck Management)", () => {
  it("应正确生成 52 张标准扑克牌，无大小王且无重复", () => {
    const rawDeck = createStandardDeck();
    expect(rawDeck.length).toBe(52);

    const codes = new Set(rawDeck.map((c) => c.code));
    expect(codes.size).toBe(52);

    // 验证花色与点数覆盖
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        expect(codes.has(`${suit}-${rank}`)).toBe(true);
      }
    }
  });

  it("TexasHoldemDeck 类实例化与完整性校验通过", () => {
    const deck = new TexasHoldemDeck();
    expect(deck.remainingCount).toBe(52);
    expect(deck.burnedCount).toBe(0);

    const integrity = deck.verifyIntegrity();
    expect(integrity.valid).toBe(true);
    expect(integrity.errors.length).toBe(0);
  });

  it("洗牌算法 (Fisher-Yates) 应有效打乱牌序", () => {
    const deck1 = new TexasHoldemDeck();
    const orderedCodes = deck1.getRemainingCards().map((c) => c.code);

    deck1.shuffle();
    const shuffledCodes = deck1.getRemainingCards().map((c) => c.code);

    expect(shuffledCodes.length).toBe(52);
    // 52 张牌洗牌后，几乎不可能与初始完全相同
    expect(shuffledCodes).not.toEqual(orderedCodes);
  });

  it("荷官发底牌机制：顺时针轮流分发 (Round-Robin)，每人2张", () => {
    const deck = new TexasHoldemDeck();
    const playerCount = 6;
    const hands = deck.dealHoleCards(playerCount);

    expect(hands.length).toBe(6);
    hands.forEach((hand) => {
      expect(hand.length).toBe(2);
    });

    // 剩余卡牌: 52 - 12 = 40
    expect(deck.remainingCount).toBe(40);
  });

  it("德州经典公共牌展开：Flop(烧1发3)、Turn(烧1发1)、River(烧1发1)", () => {
    const deck = new TexasHoldemDeck();
    deck.shuffle();

    // 2 玩家发底牌 (消耗 4 张)
    const hands = deck.dealHoleCards(2);
    expect(hands.length).toBe(2);
    expect(deck.remainingCount).toBe(48);

    // 翻牌圈 Flop (烧1发3)
    const flop = deck.dealFlop();
    expect(flop.length).toBe(3);
    expect(deck.burnedCount).toBe(1);
    expect(deck.remainingCount).toBe(44);

    // 转牌圈 Turn (烧1发1)
    const turn = deck.dealTurn();
    expect(turn).toBeDefined();
    expect(deck.burnedCount).toBe(2);
    expect(deck.remainingCount).toBe(42);

    // 河牌圈 River (烧1发1)
    const river = deck.dealRiver();
    expect(river).toBeDefined();
    expect(deck.burnedCount).toBe(3);
    expect(deck.remainingCount).toBe(40);

    // 验证发出的所有牌互不相同
    const allUsedCards: Card[] = [
      ...hands[0],
      ...hands[1],
      ...deck.getBurnedCards(),
      ...flop,
      turn,
      river
    ];
    const uniqueCodes = new Set(allUsedCards.map((c) => c.code));
    expect(uniqueCodes.size).toBe(allUsedCards.length);
    expect(allUsedCards.length).toBe(12); // 4手牌 + 3烧牌 + 5公共牌 = 12张
  });

  it("卡牌代号解析与格式化", () => {
    const cardA = TexasHoldemDeck.parseCard("S-1");
    expect(cardA.suit).toBe("S");
    expect(cardA.rank).toBe(1);
    expect(TexasHoldemDeck.formatCard(cardA)).toBe("♠A");

    const cardK = TexasHoldemDeck.parseCard("H-13");
    expect(cardK.suit).toBe("H");
    expect(cardK.rank).toBe(13);
    expect(TexasHoldemDeck.formatCard(cardK)).toBe("♥K");

    const card10 = TexasHoldemDeck.parseCard("D-10");
    expect(card10.suit).toBe("D");
    expect(card10.rank).toBe(10);
    expect(TexasHoldemDeck.formatCard(card10)).toBe("♦10");

    const cardAce14 = TexasHoldemDeck.parseCard("C-14");
    expect(cardAce14.rank).toBe(1);
    expect(TexasHoldemDeck.formatCard(cardAce14)).toBe("♣A");
  });

  it("边界与异常处理：超出发牌限制时应抛出明确错误", () => {
    const deck = new TexasHoldemDeck();
    expect(() => deck.dealHoleCards(1)).toThrow(/Invalid player count/);
    expect(() => deck.dealHoleCards(11)).toThrow(/Invalid player count/);

    // 抽光所有牌
    deck.deal(52);
    expect(deck.remainingCount).toBe(0);
    expect(() => deck.burn()).toThrow(/Cannot burn card: deck is empty/);
    expect(() => deck.deal(1)).toThrow(/Cannot deal 1 cards: only 0 cards remaining/);
  });
});

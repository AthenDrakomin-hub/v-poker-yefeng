/**
 * 牌桌动画 Hook
 * 监听 roomState 变化，自动 diff 并触发对应动画：
 *  - 公共牌数量增加 → 逐个发牌
 *  - 我的手牌增加 → 发牌动画
 *  - 底池变化 → 筹码移动 + 数字滚动
 *  - 结算结果 → 赢家高亮
 */

import { useEffect, useRef } from "react";
import type { RoomState } from "../ws/gameSocket";
import { dealCard, chipMove, potCountUp, winGlow, fadeIn } from "../utils/animations";

interface UseTableAnimationsOptions {
  roomState: RoomState | null;
  userId: string;
  /** 底池 DOM 元素 ref */
  potRef: React.RefObject<HTMLElement | null>;
  /** 公共牌容器 ref */
  communityRef: React.RefObject<HTMLElement | null>;
  /** 我的手牌容器 ref */
  myCardsRef: React.RefObject<HTMLElement | null>;
  /** 结算结果（有值时触发赢家动画） */
  settleResult: { winners: string[] } | null;
}

export function useTableAnimations({
  roomState,
  userId,
  potRef,
  communityRef,
  myCardsRef,
  settleResult,
}: UseTableAnimationsOptions) {
  const prevStateRef = useRef<RoomState | null>(null);
  const prevPotRef = useRef<number>(0);
  const prevCommunityCountRef = useRef<number>(0);
  const prevMyCardCountRef = useRef<number>(0);
  const animatedWinnersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!roomState) return;
    const prev = prevStateRef.current;

    // 1. 公共牌发出动画
    const communityCards = (roomState.round_state?.community_cards || []) as any[];
    const prevCount = prevCommunityCountRef.current;
    if (communityCards.length > prevCount) {
      const newCards = communityCards.slice(prevCount);
      const container = communityRef.current;
      if (container) {
        const cardEls = container.children;
        newCards.forEach((_, idx) => {
          const el = cardEls[prevCount + idx] as HTMLElement;
          if (el) dealCard(el, idx * 150);
        });
      }
      prevCommunityCountRef.current = communityCards.length;
    }

    // 2. 我的手牌发出动画
    const mySeat = roomState.seats.find((s) => s.user_id === userId);
    const myCards = (mySeat?.cards || []) as any[];
    const prevMyCount = prevMyCardCountRef.current;
    if (myCards.length > prevMyCount) {
      const container = myCardsRef.current;
      if (container) {
        const cardEls = container.children;
        const newCount = myCards.length - prevMyCount;
        for (let i = 0; i < newCount; i++) {
          const el = cardEls[prevMyCount + i] as HTMLElement;
          if (el) dealCard(el, i * 200);
        }
      }
      prevMyCardCountRef.current = myCards.length;
    }

    // 3. 底池变化 → 数字滚动 + 筹码移动
    const currentPot = roomState.round_state?.total_pot || 0;
    const prevPot = prevPotRef.current;
    if (currentPot > prevPot && prevPot > 0 && potRef.current) {
      // 筹码从我的座位飞到底池
      const mySeatEl = document.querySelector(`[data-seat-user="${userId}"]`);
      if (mySeatEl) {
        chipMove(mySeatEl as HTMLElement, potRef.current);
      }
      potCountUp(potRef.current, prevPot, currentPot);
    }
    prevPotRef.current = currentPot;

    // 4. 新阶段淡入
    if (prev && prev.round_state?.phase !== roomState.round_state?.phase) {
      if (communityRef.current) fadeIn(communityRef.current, 400);
    }

    prevStateRef.current = roomState;
  }, [roomState, userId, communityRef, myCardsRef, potRef]);

  // 5. 结算赢家高亮
  useEffect(() => {
    if (!settleResult?.winners) return;
    settleResult.winners.forEach((winnerId) => {
      if (animatedWinnersRef.current.has(winnerId)) return;
      animatedWinnersRef.current.add(winnerId);
      const el = document.querySelector(`[data-seat-user="${winnerId}"]`);
      if (el) winGlow(el as HTMLElement);
    });
  }, [settleResult]);
}

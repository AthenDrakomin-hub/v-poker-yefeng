/**
 * 牌桌动画工具层 (Table Animations)
 * 基于 Web Animations API (WAAPI) + FLIP 技术
 * 不引入 PixiJS 场景（现有 DOM 牌桌够用，卡牌游戏不需要 WebGL）
 *
 * 提供：
 *  - dealCard:    发牌动画（从牌堆位置飞到目标元素）
 *  - flipCard:    翻牌动画（3D rotateY）
 *  - chipMove:    筹码移动（FLIP：从座位滑到底池）
 *  - chipPulse:   筹码脉冲反馈（下注成功后）
 *  - potCountUp:  底池数字滚动
 *  - winGlow:     赢家高亮脉冲
 *  - fadeIn:      通用淡入
 */

/**
 * FLIP 动画：记录元素当前位置，等待 DOM 更新后动画到新位置
 * @param element 要动画的元素
 * @param onEnter 触发 DOM 更新的回调（一般是 setState）
 */
export function flip(
  element: Element,
  onEnter: () => void
): Animation | null {
  const first = element.getBoundingClientRect();
  onEnter();
  const last = element.getBoundingClientRect();
  const dx = first.left - last.left;
  const dy = first.top - last.top;

  if (dx === 0 && dy === 0) return null;

  return element.animate(
    [
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: "translate(0, 0)" },
    ],
    { duration: 400, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
  );
}

/**
 * 发牌动画：从牌堆中心飞到目标卡牌位置
 * @param targetEl 目标卡牌元素
 * @param delay    延迟毫秒（多张牌错开）
 */
export function dealCard(targetEl: HTMLElement, delay = 0): Animation | null {
  if (!targetEl) return null;
  const rect = targetEl.getBoundingClientRect();

  // 创建飞牌图层
  const card = document.createElement("div");
  card.style.cssText = `
    position: fixed;
    left: ${rect.left}px;
    top: ${rect.top}px;
    width: ${rect.width}px;
    height: ${rect.height}px;
    border-radius: 6px;
    background: linear-gradient(135deg, #1e3a5f, #2d5a8e);
    border: 2px solid #c9a84c;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    z-index: 9998;
    pointer-events: none;
  `;
  document.body.appendChild(card);

  // 起始位置：屏幕中央上方（牌堆位置）
  const startX = window.innerWidth / 2 - rect.width / 2;
  const startY = window.innerHeight * 0.3 - rect.height / 2;

  const anim = card.animate(
    [
      {
        transform: `translate(${startX - rect.left}px, ${startY - rect.top}px) rotateY(180deg)`,
        opacity: 0,
      },
      {
        transform: `translate(${(startX - rect.left) / 2}px, ${(startY - rect.top) / 2}px) rotateY(90deg)`,
        opacity: 1,
        offset: 0.6,
      },
      {
        transform: "translate(0, 0) rotateY(0deg)",
        opacity: 1,
      },
    ],
    {
      duration: 500,
      delay,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    }
  );

  anim.onfinish = () => card.remove();
  return anim;
}

/**
 * 翻牌动画：3D 翻转（底牌从背面翻成正面）
 */
export function flipCard(targetEl: HTMLElement): Animation | null {
  if (!targetEl) return null;
  return targetEl.animate(
    [
      { transform: "rotateY(180deg)" },
      { transform: "rotateY(0deg)" },
    ],
    {
      duration: 600,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    }
  );
}

/**
 * 筹码移动动画：从座位飞到桌中央底池
 * @param fromEl 筹码/座位元素
 * @param toEl   底池元素
 */
export function chipMove(fromEl: HTMLElement, toEl: HTMLElement): Animation | null {
  if (!fromEl || !toEl) return null;
  const fromRect = fromEl.getBoundingClientRect();
  const toRect = toEl.getBoundingClientRect();

  const dx = toRect.left + toRect.width / 2 - (fromRect.left + fromRect.width / 2);
  const dy = toRect.top + toRect.height / 2 - (fromRect.top + fromRect.height / 2);

  // 创建飞的筹码
  const chip = document.createElement("div");
  chip.style.cssText = `
    position: fixed;
    left: ${fromRect.left + fromRect.width / 2 - 15}px;
    top: ${fromRect.top + fromRect.height / 2 - 15}px;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: radial-gradient(circle, #e74c3c 0%, #c0392b 100%);
    border: 3px dashed #fff;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
    z-index: 9997;
    pointer-events: none;
  `;
  document.body.appendChild(chip);

  const anim = chip.animate(
    [
      { transform: "translate(0, 0) scale(1)" },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.3 - 20}px) scale(1.1)`, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.8)` },
    ],
    {
      duration: 450,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    }
  );

  anim.onfinish = () => chip.remove();
  return anim;
}

/**
 * 筹码脉冲反馈：下注按钮按下后缩放反馈
 */
export function chipPulse(targetEl: HTMLElement): Animation | null {
  if (!targetEl) return null;
  return targetEl.animate(
    [
      { transform: "scale(1)" },
      { transform: "scale(1.15)", offset: 0.3 },
      { transform: "scale(1)" },
    ],
    { duration: 300, easing: "ease-out" }
  );
}

/**
 * 底池数字滚动动画
 */
export function potCountUp(targetEl: HTMLElement, from: number, to: number): void {
  if (!targetEl || from === to) return;
  const duration = 500;
  const start = performance.now();

  function tick(now: number) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
    const current = Math.round(from + (to - from) * eased);
    targetEl.textContent = `底池: ${current.toLocaleString()}`;
    if (progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/**
 * 赢家高亮脉冲
 */
export function winGlow(targetEl: HTMLElement): Animation | null {
  if (!targetEl) return null;
  return targetEl.animate(
    [
      { boxShadow: "0 0 0px rgba(245, 197, 66, 0)" },
      { boxShadow: "0 0 30px rgba(245, 197, 66, 0.8)", offset: 0.5 },
      { boxShadow: "0 0 0px rgba(245, 197, 66, 0)" },
    ],
    { duration: 1200, easing: "ease-out", iterations: 2 }
  );
}

/**
 * 通用淡入
 */
export function fadeIn(targetEl: HTMLElement, duration = 300): Animation | null {
  if (!targetEl) return null;
  return targetEl.animate(
    [{ opacity: 0 }, { opacity: 1 }],
    { duration, easing: "ease-out" }
  );
}

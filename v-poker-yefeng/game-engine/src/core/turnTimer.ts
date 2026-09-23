/**
 * 回合动作倒计时器 (TurnTimer)
 * 职责：当轮到某玩家行动时启动倒计时；超时自动执行默认动作（check 或 fold）
 * 设计：
 *  - 每个房间一个实例，跟随 stateMachine 生命周期
 *  - 倒计时结束前，玩家正常动作会 cancel 定时器
 *  - 超时动作策略：能 check 就 check，不能 check（有下注需要跟）就 fold
 *  - 广播 turn_timer_start / turn_timer_tick / turn_timer_expired 事件
 */

import { coreEventBus } from "./eventBus.js";

export interface TurnTimerOptions {
  roomId: string;
  /** 动作超时毫秒数，默认 30 秒 */
  actionTimeoutMs?: number;
  /** 超时后的默认动作回调（由 stateMachine 注入） */
  onTimeout: (seatIndex: number, userId: string) => void;
  /** 查询当前是否可 check（用于决定超时动作） */
  canCheck: (seatIndex: number) => boolean;
}

export interface TurnTimerState {
  seat_index: number | null;
  user_id: string | null;
  deadline_ms: number | null;   // 绝对截止时间戳
  remaining_ms: number | null;  // 剩余毫秒
}

export class TurnTimer {
  private roomId: string;
  private actionTimeoutMs: number;
  private onTimeout: (seatIndex: number, userId: string) => void;
  private canCheck: (seatIndex: number) => boolean;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;
  private currentSeat: number | null = null;
  private currentUser: string | null = null;
  private deadline: number = 0;

  constructor(opts: TurnTimerOptions) {
    this.roomId = opts.roomId;
    this.actionTimeoutMs = opts.actionTimeoutMs ?? 30_000;
    this.onTimeout = opts.onTimeout;
    this.canCheck = opts.canCheck;
  }

  /** 启动倒计时（轮到某个玩家行动时调用） */
  start(seatIndex: number, userId: string): void {
    this.cancel();

    this.currentSeat = seatIndex;
    this.currentUser = userId;
    this.deadline = Date.now() + this.actionTimeoutMs;

    // 广播倒计时开始
    coreEventBus.emit("turn_timer_start", {
      roomId: this.roomId,
      seat_index: seatIndex,
      user_id: userId,
      deadline_ms: this.deadline,
      timeout_ms: this.actionTimeoutMs,
    });

    // 每秒广播剩余时间（前端做倒计时条）
    this.ticker = setInterval(() => {
      const remaining = this.deadline - Date.now();
      if (remaining <= 0) return;
      coreEventBus.emit("turn_timer_tick", {
        roomId: this.roomId,
        seat_index: this.currentSeat,
        remaining_ms: remaining,
      });
    }, 1000);

    // 超时定时器
    this.timer = setTimeout(() => {
      this.handleTimeout();
    }, this.actionTimeoutMs);
  }

  /** 玩家正常动作后取消倒计时 */
  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    if (this.currentSeat !== null) {
      coreEventBus.emit("turn_timer_cancel", {
        roomId: this.roomId,
        seat_index: this.currentSeat,
      });
    }
    this.currentSeat = null;
    this.currentUser = null;
    this.deadline = 0;
  }

  /** 获取当前倒计时状态（用于快照恢复 / 新玩家进房时同步） */
  getState(): TurnTimerState {
    if (this.currentSeat === null) {
      return { seat_index: null, user_id: null, deadline_ms: null, remaining_ms: null };
    }
    return {
      seat_index: this.currentSeat,
      user_id: this.currentUser,
      deadline_ms: this.deadline,
      remaining_ms: Math.max(0, this.deadline - Date.now()),
    };
  }

  /** 是否正在倒计时 */
  isActive(): boolean {
    return this.currentSeat !== null;
  }

  /** 超时处理：能 check 就 check，否则 fold */
  private handleTimeout(): void {
    if (this.currentSeat === null || !this.currentUser) return;
    const seatIndex = this.currentSeat;
    const userId = this.currentUser;

    coreEventBus.emit("turn_timer_expired", {
      roomId: this.roomId,
      seat_index: seatIndex,
      user_id: userId,
    });

    this.timer = null;
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
    this.currentSeat = null;
    this.currentUser = null;

    this.onTimeout(seatIndex, userId);
  }

  /** 房间销毁时清理 */
  destroy(): void {
    this.cancel();
  }
}

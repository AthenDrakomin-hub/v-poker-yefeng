/**
 * 平台核心事件总线 (Core EventBus)
 * 用于状态流转、牌局动作广播、结算触发的解耦分发
 */

type EventHandler = (payload: any) => void | Promise<void>;

export class EventBus {
  private listeners: Map<string, EventHandler[]> = new Map();

  on(event: string, handler: EventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(handler);
  }

  off(event: string, handler: EventHandler): void {
    const list = this.listeners.get(event);
    if (!list) return;
    this.listeners.set(
      event,
      list.filter((h) => h !== handler)
    );
  }

  async emit(event: string, payload: any): Promise<void> {
    const list = this.listeners.get(event) || [];
    for (const handler of list) {
      try {
        await handler(payload);
      } catch (err) {
        console.error(`[EventBus] Error in event '${event}':`, err);
      }
    }
  }
}

export const coreEventBus = new EventBus();

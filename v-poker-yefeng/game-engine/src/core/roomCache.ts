/**
 * 房间状态缓存层
 * 默认内存实现，生产可切换为 Redis
 *
 * 用途：game-engine 重启后恢复进行中的房间状态
 * 当前实现：Map 内存缓存（进程内）
 * 生产切换：装 ioredis，实现 RedisRoomCache 即可
 */

export interface RoomCache {
  /** 保存房间快照 */
  saveRoomState(roomId: string, state: object): Promise<void>;
  /** 读取房间快照 */
  getRoomState(roomId: string): Promise<object | null>;
  /** 删除房间 */
  deleteRoomState(roomId: string): Promise<void>;
  /** 列出所有房间 ID */
  listRooms(): Promise<string[]>;
}

/**
 * 内存缓存实现（默认）
 * 进程重启后丢失，生产环境建议切换到 Redis
 */
export class MemoryRoomCache implements RoomCache {
  private store: Map<string, object> = new Map();

  async saveRoomState(roomId: string, state: object): Promise<void> {
    this.store.set(roomId, state);
  }

  async getRoomState(roomId: string): Promise<object | null> {
    return this.store.get(roomId) || null;
  }

  async deleteRoomState(roomId: string): Promise<void> {
    this.store.delete(roomId);
  }

  async listRooms(): Promise<string[]> {
    return Array.from(this.store.keys());
  }
}

/**
 * Redis 缓存实现（预留，装 ioredis 后启用）
 *
 * 用法：
 *   import Redis from "ioredis";
 *   const redis = new Redis(process.env.REDIS_URL);
 *   export class RedisRoomCache implements RoomCache {
 *     async saveRoomState(roomId, state) {
 *       await redis.setex(`room:${roomId}`, 3600, JSON.stringify(state));
 *     }
 *     async getRoomState(roomId) {
 *       const raw = await redis.get(`room:${roomId}`);
 *       return raw ? JSON.parse(raw) : null;
 *     }
 *     async deleteRoomState(roomId) {
 *       await redis.del(`room:${roomId}`);
 *     }
 *     async listRooms() {
 *       const keys = await redis.keys("room:*");
 *       return keys.map(k => k.replace("room:", ""));
 *     }
 *   }
 */

// 单例导出
export const roomCache: RoomCache = new MemoryRoomCache();

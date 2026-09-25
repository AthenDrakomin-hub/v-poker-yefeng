/**
 * 平台核心房间管理器 (RoomManager)
 * 职责：房间生命周期管理、规则插件动态路由、多桌并发管理
 * v2 新增：PostgreSQL 持久化，服务器重启后恢复房间和玩家
 */

import { GamePlugin } from "../games/plugin.interface.js";
import { validatePlugin } from "../games/pluginValidator.js";
import { NiuNiuPlugin } from "../games/niu_niu/index.js";
import { SanGongPlugin } from "../games/san_gong/index.js";
import { SquidGamePlugin } from "../games/squid_game/index.js";
import { TexasHoldemPlugin } from "../games/texas_holdem/index.js";
import { ZhaJinHuaPlugin } from "../games/zha_jin_hua/index.js";
import { GuandanPlugin } from "../games/guandan/index.js";
import { FightBombPlugin } from "../games/fight_bomb/index.js";
import { OmahaPlugin } from "../games/omaha/index.js";
import { ThirteenWaterPlugin } from "../games/thirteen_water/index.js";
import { DoubleKongPlugin } from "../games/double_kong/index.js";
import { HongWuPlugin } from "../games/hong_wu/index.js";
import { PineapplePlugin } from "../games/pineapple/index.js";
import { ShortDeckPlugin } from "../games/short_deck/index.js";
import { DoudizhuPlugin } from "../games/doudizhu/index.js";
import { GameMode, GameRoom, GameType } from "../shared/types.js";
import { SeatManager } from "./seatManager.js";
import { GameStateMachine } from "./stateMachine.js";
import { getRoomPlayers, clearRoomPlayers, saveRoomSnapshot, loadRoomSnapshots } from "./db.js";

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private stateMachines: Map<string, GameStateMachine> = new Map();
  private seatManagers: Map<string, SeatManager> = new Map();
  private plugins: Map<GameType, GamePlugin> = new Map();

  constructor() {
    this.registerPlugin(new NiuNiuPlugin());
    this.registerPlugin(new SanGongPlugin());
    this.registerPlugin(new ZhaJinHuaPlugin());
    this.registerPlugin(new TexasHoldemPlugin());
    this.registerPlugin(new SquidGamePlugin());
    this.registerPlugin(new GuandanPlugin());
    this.registerPlugin(new FightBombPlugin());
    this.registerPlugin(new OmahaPlugin());
    this.registerPlugin(new ThirteenWaterPlugin());
    this.registerPlugin(new DoubleKongPlugin());
    this.registerPlugin(new HongWuPlugin());
    this.registerPlugin(new PineapplePlugin());
    this.registerPlugin(new ShortDeckPlugin());
    this.registerPlugin(new DoudizhuPlugin());

    // 启动时从数据库恢复房间
    this.restoreRoomsFromDB();
  }

  public registerPlugin(plugin: GamePlugin): void {
    validatePlugin(plugin);
    this.plugins.set(plugin.game_type, plugin);
  }

  public getPlugin(gameType: GameType): GamePlugin | undefined {
    return this.plugins.get(gameType);
  }

  public createRoom(options: {
    room_id: string;
    game_type: GameType;
    mode: GameMode;
    base_score?: number;
    max_seats?: number;
    min_players_to_start?: number;
    platform_fee_rate?: number;
    agent_commission_rate?: number;
    agent_ids?: string[];
  }): { room: GameRoom; stateMachine: GameStateMachine } {
    if (this.rooms.has(options.room_id)) {
      throw new Error(`Room '${options.room_id}' already exists.`);
    }

    const plugin = this.getPlugin(options.game_type);
    if (!plugin) {
      throw new Error(`Plugin for game_type '${options.game_type}' not found.`);
    }

    if (!plugin.supported_modes.includes(options.mode)) {
      throw new Error(`Mode '${options.mode}' is not supported by plugin '${plugin.name}'.`);
    }

    const room: GameRoom = {
      room_id: options.room_id,
      game_type: options.game_type,
      mode: options.mode,
      base_score: options.base_score ?? 100,
      max_seats: options.max_seats ?? 6,
      min_players_to_start: options.min_players_to_start ?? 2,
      platform_fee_rate: options.platform_fee_rate ?? 0.0500,
      agent_commission_rate: options.agent_commission_rate ?? 0.0300,
      agent_ids: options.agent_ids ?? ["agt_room_03", "agt_sub_02", "agt_top_01"],
      status: "waiting",
      current_round_id: null,
      created_at: Date.now(),
      updated_at: Date.now()
    };

    const seatManager = new SeatManager(room.max_seats, room.room_id);
    const stateMachine = new GameStateMachine(room, plugin, seatManager);

    this.rooms.set(room.room_id, room);
    this.stateMachines.set(room.room_id, stateMachine);
    this.seatManagers.set(room.room_id, seatManager);

    // 持久化房间元信息
    saveRoomSnapshot(room.room_id, room.game_type, room.mode, room.base_score, { status: "waiting" });

    return { room, stateMachine };
  }

  public getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  public getStateMachine(roomId: string): GameStateMachine | undefined {
    return this.stateMachines.get(roomId);
  }

  public getSeatManager(roomId: string): SeatManager | undefined {
    return this.seatManagers.get(roomId);
  }

  /**
   * v2.1: 解散房间，同时退还所有玩家未结算的筹码
   * 先调用 refundOnAbort 退款，再清理内存和数据库
   */
  public async removeRoom(roomId: string): Promise<{ success: boolean; refundResult?: any }> {
    const stateMachine = this.stateMachines.get(roomId);

    // 如果游戏进行中，先退款
    if (stateMachine && stateMachine.getPhase() !== "WAITING") {
      try {
        const refundResult = await stateMachine.refundOnAbort("room_closed");
        console.log(`[RoomManager] Room ${roomId} closed, refunded ${refundResult.refunds.length} players`);
      } catch (error) {
        console.error(`[RoomManager] Refund failed for room ${roomId}:`, error);
      }
    }

    // 清理数据库中的玩家记录
    await clearRoomPlayers(roomId);

    this.stateMachines.delete(roomId);
    this.seatManagers.delete(roomId);
    const deleted = this.rooms.delete(roomId);

    return { success: deleted, refundResult: null };
  }

  public getAllRooms(): GameRoom[] {
    return Array.from(this.rooms.values());
  }

  /**
   * 从数据库恢复所有进行中的房间（服务器重启后调用）
   * TODO: SQLite rooms表持久化后启用
   */
  private async restoreRoomsFromDB(): Promise<void> {
    try {
      const snapshots = await loadRoomSnapshots();
      for (const snap of snapshots) {
        if (this.rooms.has(snap.room_id)) continue;
        const plugin = this.getPlugin(snap.game_type as GameType);
        if (!plugin) continue;
        const room: GameRoom = {
          room_id: snap.room_id,
          game_type: snap.game_type as GameType,
          mode: snap.mode as any,
          base_score: snap.base_score,
          max_seats: 6,
          min_players_to_start: 2,
          platform_fee_rate: 0.05,
          agent_commission_rate: 0.03,
          agent_ids: [],
          status: "waiting",
          current_round_id: null,
          created_at: Date.now(),
          updated_at: Date.now(),
        };
        const seatManager = new SeatManager(room.max_seats, room.room_id);
        const stateMachine = new GameStateMachine(room, plugin, seatManager);
        this.rooms.set(room.room_id, room);
        this.stateMachines.set(room.room_id, stateMachine);
        this.seatManagers.set(room.room_id, seatManager);

        // 恢复座位（重启后玩家自动重新入座）
        const savedSeats = snap.snapshot?.seats || [];
        for (const s of savedSeats) {
          if (s.user_id) {
            await seatManager.sitDown(s.seat_index, s.user_id, s.chips || 0, false);
          }
        }
      }
      if (snapshots.length > 0) console.log(`[RoomManager] Restored ${snapshots.length} room(s) from SQLite`);
    } catch (e) {
      console.error("[RoomManager] restore error:", e);
    }
  }

  /**
   * 玩家断线重连检查
   */
  async checkReconnection(
    roomId: string,
    userId: string
  ): Promise<{
    canReconnect: boolean;
    seatIndex: number;
    message: string;
  }> {
    const seatManager = this.seatManagers.get(roomId);
    if (!seatManager) {
      return { canReconnect: false, seatIndex: -1, message: "Room not found" };
    }

    const result = await seatManager.checkPlayerStatus(userId);
    if (result.isInRoom) {
      return {
        canReconnect: true,
        seatIndex: result.seatIndex,
        message: result.status === "reconnected" ? "Reconnected to seat" : "Already in seat"
      };
    }

    return {
      canReconnect: false,
      seatIndex: -1,
      message: `Player status: ${result.status}`
    };
  }
}

export const coreRoomManager = new RoomManager();

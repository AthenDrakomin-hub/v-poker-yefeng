/**
 * 平台核心房间管理器 (RoomManager)
 * 职责：房间生命周期管理、规则插件动态路由、多桌并发管理
 */

import { GamePlugin } from "../games/plugin.interface.js";
import { NiuNiuPlugin } from "../games/niu_niu/index.js";
import { SanGongPlugin } from "../games/san_gong/index.js";
import { TexasHoldemPlugin } from "../games/texas_holdem/index.js";
import { ZhaJinHuaPlugin } from "../games/zha_jin_hua/index.js";
import { GameMode, GameRoom, GameType } from "../shared/types.js";
import { SeatManager } from "./seatManager.js";
import { GameStateMachine } from "./stateMachine.js";

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private stateMachines: Map<string, GameStateMachine> = new Map();
  private plugins: Map<GameType, GamePlugin> = new Map();

  constructor() {
    this.registerPlugin(new NiuNiuPlugin());
    this.registerPlugin(new SanGongPlugin());
    this.registerPlugin(new ZhaJinHuaPlugin());
    this.registerPlugin(new TexasHoldemPlugin());
  }

  public registerPlugin(plugin: GamePlugin): void {
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

    const seatManager = new SeatManager(room.max_seats);
    const stateMachine = new GameStateMachine(room, plugin, seatManager);

    this.rooms.set(room.room_id, room);
    this.stateMachines.set(room.room_id, stateMachine);

    return { room, stateMachine };
  }

  public getRoom(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  public getStateMachine(roomId: string): GameStateMachine | undefined {
    return this.stateMachines.get(roomId);
  }

  public removeRoom(roomId: string): boolean {
    this.stateMachines.delete(roomId);
    return this.rooms.delete(roomId);
  }

  public getAllRooms(): GameRoom[] {
    return Array.from(this.rooms.values());
  }
}

export const coreRoomManager = new RoomManager();

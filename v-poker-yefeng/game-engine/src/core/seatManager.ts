/**
 * 平台核心座位管理器 (SeatManager)
 * 职责：座位分配、离座、切态、携带筹码与重置
 * v2 新增：PostgreSQL 持久化，支持服务器重启后恢复
 * v2.1 新增：断线状态跟踪、超时自动弃牌、中途加入/退出规则
 */

import { Seat } from "../shared/types.js";
import { joinRoom, leaveRoom, updateReady, getRoomPlayers, getPlayerInRoom } from "./db.js";

// 断线超时时间（毫秒），默认 5 分钟，可通过环境变量 DISCONNECT_TIMEOUT_MS 覆盖
const DISCONNECT_TIMEOUT_MS = parseInt(process.env.DISCONNECT_TIMEOUT_MS || "300000");

export class SeatManager {
  private seats: Seat[];
  private roomId: string;
  private disconnectTimeoutMs: number;

  constructor(maxSeats: number, roomId?: string) {
    this.roomId = roomId || "";
    this.disconnectTimeoutMs = DISCONNECT_TIMEOUT_MS;
    this.seats = Array.from({ length: maxSeats }, (_, i) => ({
      seat_index: i,
      user_id: null,
      chips: 0,
      current_bet: 0,
      status: "empty",
      cards: [],
      is_banker: false,
      banker_multiplier: 0,
      bet_multiplier: 1,
      has_acted: false,
      has_viewed_cards: false,
      is_disconnected: false,
      disconnect_time: undefined
    }));
  }

  /**
   * 设置房间 ID（用于持久化）
   */
  setRoomId(roomId: string): void {
    this.roomId = roomId;
  }

  getSeats(): Seat[] {
    return this.seats;
  }

  getSeat(seatIndex: number): Seat | undefined {
    return this.seats[seatIndex];
  }

  findUserSeat(userId: string): Seat | undefined {
    return this.seats.find((s) => s.user_id === userId);
  }

  /**
   * 玩家入座
   * v2 新增：同时写入 PostgreSQL room_players 表
   * v2.1 新增：中途加入限制 - 如果当前局进行中，只能等待下一局
   */
  async sitDown(seatIndex: number, userId: string, initialChips: number, inRound: boolean = false): Promise<{ success: boolean; message: string }> {
    const seat = this.seats[seatIndex];
    if (!seat || seat.status !== "empty") {
      return { success: false, message: "Seat not available" };
    }

    // 检查该用户是否已经在其他席位
    if (this.findUserSeat(userId)) {
      return { success: false, message: "Player already in another seat" };
    }

    // v2.1: 中途加入限制 - 如果当前局进行中，标记为等待下一局
    const newStatus = inRound ? "waiting" : "ready";

    seat.user_id = userId;
    seat.chips = initialChips;
    seat.status = newStatus;
    seat.is_disconnected = false;
    seat.disconnect_time = undefined;

    // 持久化到数据库
    if (this.roomId) {
      await joinRoom(this.roomId, userId, seatIndex);
      await updateReady(this.roomId, userId, !inRound);
    }

    return {
      success: true,
      message: inRound ? "Joined, waiting for next round" : "Joined and ready"
    };
  }

  /**
   * 玩家离座
   * v2 新增：同时更新 PostgreSQL room_players 表状态为 left
   * v2.1 新增：中途退出 - 已下注筹码留在底池，未下注筹码退回
   */
  async standUp(seatIndex: number): Promise<{ success: boolean; refundAmount: number }> {
    const seat = this.seats[seatIndex];
    if (!seat || seat.status === "empty") {
      return { success: false, refundAmount: 0 };
    }

    const userId = seat.user_id;
    // v2.1: 未下注的筹码退回，已下注的留在底池
    const refundAmount = seat.chips;

    seat.user_id = null;
    seat.chips = 0;
    seat.status = "empty";
    seat.cards = [];
    seat.is_banker = false;
    seat.has_acted = false;
    seat.has_viewed_cards = false;
    seat.hand_result = undefined;
    seat.is_disconnected = false;
    seat.disconnect_time = undefined;

    // 更新数据库状态
    if (this.roomId && userId) {
      await leaveRoom(this.roomId, userId);
    }

    return { success: true, refundAmount };
  }

  /**
   * 更新准备状态
   * v2 新增：同时更新 PostgreSQL room_players.is_ready
   */
  async setReady(seatIndex: number, isReady: boolean): Promise<boolean> {
    const seat = this.seats[seatIndex];
    if (!seat || !seat.user_id) return false;

    // 持久化到数据库
    if (this.roomId && seat.user_id) {
      await updateReady(this.roomId, seat.user_id, isReady);
    }

    return true;
  }

  resetRoundState(): void {
    this.seats.forEach((seat) => {
      if (seat.user_id) {
        // v2.1: 等待下一局的玩家保持 waiting 状态
        if (seat.status !== "waiting") {
          seat.status = "ready";
        }
        seat.cards = [];
        seat.current_bet = 0;
        seat.is_banker = false;
        seat.banker_multiplier = 0;
        seat.bet_multiplier = 1;
        seat.has_acted = false;
        seat.has_viewed_cards = false;
        seat.hand_result = undefined;
        // v2.1: 新的一局开始，清除断线状态
        seat.is_disconnected = false;
        seat.disconnect_time = undefined;
      }
    });
  }

  getActivePlayersCount(): number {
    return this.seats.filter((s) => s.status === "ready" || s.status === "playing").length;
  }

  /**
   * v2.1: 标记玩家断线
   */
  markDisconnected(userId: string): boolean {
    const seat = this.findUserSeat(userId);
    if (!seat) return false;

    seat.is_disconnected = true;
    seat.disconnect_time = Date.now();
    return true;
  }

  /**
   * v2.1: 玩家重连
   */
  markReconnected(userId: string): boolean {
    const seat = this.findUserSeat(userId);
    if (!seat) return false;

    seat.is_disconnected = false;
    seat.disconnect_time = undefined;
    return true;
  }

  /**
   * v2.1: 检查断线超时，自动弃牌
   * @param timeoutMs 超时时间，默认使用环境变量配置的 5 分钟
   * @returns 自动弃牌的玩家列表
   */
  checkDisconnectTimeout(timeoutMs: number = DISCONNECT_TIMEOUT_MS): Array<{ userId: string; seatIndex: number }> {
    const folded: Array<{ userId: string; seatIndex: number }> = [];
    const now = Date.now();

    for (const seat of this.seats) {
      // 如果玩家断线且超过超时时间，自动弃牌
      if (seat.is_disconnected && 
          seat.disconnect_time && 
          now - seat.disconnect_time > timeoutMs) {
        
        if (seat.status === "playing" || seat.status === "ready") {
          seat.status = "folded";
          folded.push({
            userId: seat.user_id!,
            seatIndex: seat.seat_index
          });
          console.log(`[SeatManager] Auto-folded player ${seat.user_id} at seat ${seat.seat_index} (timeout: ${timeoutMs}ms)`);
        }
      }
    }

    return folded;
  }

  /**
   * 从数据库恢复房间玩家列表（服务器重启后调用）
   */
  async restoreFromDB(): Promise<number> {
    if (!this.roomId) return 0;

    const players = await getRoomPlayers(this.roomId);
    let restored = 0;

    for (const player of players) {
      const seatIndex = player.seat_no;
      if (seatIndex >= 0 && seatIndex < this.seats.length) {
        const seat = this.seats[seatIndex];
        if (seat.status === "empty") {
          seat.user_id = player.user_id;
          seat.chips = 0; // 筹码从钱包系统恢复
          seat.status = player.is_ready ? "ready" : "waiting";
          restored++;
        }
      }
    }

    console.log(`[SeatManager] Restored ${restored} players from DB for room ${this.roomId}`);
    return restored;
  }

  /**
   * 检查玩家是否在房间中（用于断线重连）
   */
  async checkPlayerStatus(userId: string): Promise<{
    isInRoom: boolean;
    seatIndex: number;
    status: string;
  }> {
    if (!this.roomId) {
      return { isInRoom: false, seatIndex: -1, status: "unknown" };
    }

    const player = await getPlayerInRoom(this.roomId, userId);
    if (!player) {
      return { isInRoom: false, seatIndex: -1, status: "not_found" };
    }

    // 检查内存中是否有该玩家
    const seat = this.findUserSeat(userId);
    if (seat) {
      return { isInRoom: true, seatIndex: seat.seat_index, status: seat.status };
    }

    // 内存中没有但数据库有，恢复到座位
    if (player.status === "sitting") {
      const seatIndex = player.seat_no;
      if (seatIndex >= 0 && seatIndex < this.seats.length) {
        const emptySeat = this.seats[seatIndex];
        if (emptySeat.status === "empty") {
          emptySeat.user_id = userId;
          emptySeat.chips = 0;
          emptySeat.status = "ready";
          return { isInRoom: true, seatIndex, status: "reconnected" };
        }
      }
    }

    return { isInRoom: false, seatIndex: -1, status: player.status };
  }
}

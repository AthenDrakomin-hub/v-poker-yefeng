/**
 * PostgreSQL 数据库客户端
 * 用于 room_players 表持久化
 */

import { Pool } from "pg";

// 从环境变量读取数据库连接
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://poker_admin:PokerDB2024@localhost:5432/poker_platform",
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

/**
 * 玩家在房间中的状态
 */
export interface RoomPlayer {
  room_id: string;
  user_id: string;
  seat_no: number;
  is_ready: boolean;
  joined_at: number;
  left_at: number | null;
  status: "sitting" | "left" | "kicked";
}

/**
 * 加入房间 - 写入 room_players 表
 */
export async function joinRoom(
  roomId: string,
  userId: string,
  seatNo: number
): Promise<boolean> {
  try {
    await pool.query(
      `INSERT INTO room_players (room_id, user_id, seat_no, is_ready, joined_at, left_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (room_id, user_id) 
       DO UPDATE SET status = 'sitting', seat_no = $3, left_at = NULL`,
      [roomId, userId, seatNo, false, Date.now(), null, "sitting"]
    );
    return true;
  } catch (error) {
    console.error("[DB] joinRoom error:", error);
    return false;
  }
}

/**
 * 离开房间 - 更新状态为 left
 */
export async function leaveRoom(
  roomId: string,
  userId: string
): Promise<boolean> {
  try {
    await pool.query(
      `UPDATE room_players 
       SET status = 'left', left_at = $1 
       WHERE room_id = $2 AND user_id = $3`,
      [Date.now(), roomId, userId]
    );
    return true;
  } catch (error) {
    console.error("[DB] leaveRoom error:", error);
    return false;
  }
}

/**
 * 更新准备状态
 */
export async function updateReady(
  roomId: string,
  userId: string,
  isReady: boolean
): Promise<boolean> {
  try {
    await pool.query(
      `UPDATE room_players 
       SET is_ready = $1 
       WHERE room_id = $2 AND user_id = $3`,
      [isReady, roomId, userId]
    );
    return true;
  } catch (error) {
    console.error("[DB] updateReady error:", error);
    return false;
  }
}

/**
 * 查询房间所有在席玩家
 */
export async function getRoomPlayers(roomId: string): Promise<RoomPlayer[]> {
  try {
    const result = await pool.query(
      `SELECT * FROM room_players 
       WHERE room_id = $1 AND status = 'sitting'
       ORDER BY seat_no`,
      [roomId]
    );
    return result.rows;
  } catch (error) {
    console.error("[DB] getRoomPlayers error:", error);
    return [];
  }
}

/**
 * 查询单个玩家在房间的状态
 */
export async function getPlayerInRoom(
  roomId: string,
  userId: string
): Promise<RoomPlayer | null> {
  try {
    const result = await pool.query(
      `SELECT * FROM room_players 
       WHERE room_id = $1 AND user_id = $2`,
      [roomId, userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error("[DB] getPlayerInRoom error:", error);
    return null;
  }
}

/**
 * 清理房间所有玩家（房间解散时调用）
 */
export async function clearRoomPlayers(roomId: string): Promise<boolean> {
  try {
    await pool.query(
      `DELETE FROM room_players WHERE room_id = $1`,
      [roomId]
    );
    return true;
  } catch (error) {
    console.error("[DB] clearRoomPlayers error:", error);
    return false;
  }
}

/**
 * 保存游戏记录（game_records 表）
 */
export async function saveGameRecord(params: {
  transaction_id: string;
  room_id: string;
  round_no: number;
  total_flow: number;
  player_count: number;
}): Promise<boolean> {
  try {
    await pool.query(
      `INSERT INTO game_records (transaction_id, room_id, round_no, total_flow, player_count, settlement_status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'settled', $6)
       ON CONFLICT (transaction_id) DO NOTHING`,
      [params.transaction_id, params.room_id, params.round_no, params.total_flow, params.player_count, Date.now()]
    );
    return true;
  } catch (error) {
    console.error("[DB] saveGameRecord error:", error);
    return false;
  }
}

/**
 * 保存牌谱回放（game_replays 表）
 */
export async function saveGameReplay(params: {
  replay_id: string;
  room_id: string;
  game_type: string;
  round_no: number;
  players: any;
  actions: any;
  result: any;
  duration_sec: number;
}): Promise<boolean> {
  try {
    await pool.query(
      `INSERT INTO game_replays (replay_id, room_id, game_type, round_no, players, actions, result, duration_sec, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8, $9)
       ON CONFLICT (replay_id) DO NOTHING`,
      [
        params.replay_id,
        params.room_id,
        params.game_type,
        params.round_no,
        JSON.stringify(params.players),
        JSON.stringify(params.actions),
        JSON.stringify(params.result),
        params.duration_sec,
        Date.now(),
      ]
    );
    return true;
  } catch (error) {
    console.error("[DB] saveGameReplay error:", error);
    return false;
  }
}

export default pool;

/**
 * SQLite 数据库客户端（替代 PostgreSQL，开箱即用）
 * 用于 room_players / game_records / game_replays 持久化
 * 使用 Node 22 内置 node:sqlite，零依赖
 */

import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const DB_PATH = process.env.ENGINE_DB_PATH || path.join(process.cwd(), "engine.db");
const db = new DatabaseSync(DB_PATH);

// 建表
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    room_id TEXT PRIMARY KEY,
    game_type TEXT NOT NULL,
    mode TEXT NOT NULL,
    base_score INTEGER NOT NULL,
    snapshot TEXT,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS room_players (
    room_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    seat_no INTEGER NOT NULL,
    is_ready INTEGER DEFAULT 0,
    joined_at INTEGER NOT NULL,
    left_at INTEGER,
    status TEXT DEFAULT 'sitting',
    PRIMARY KEY (room_id, user_id)
  );
  CREATE TABLE IF NOT EXISTS game_records (
    transaction_id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    round_no INTEGER NOT NULL,
    total_flow INTEGER NOT NULL,
    player_count INTEGER NOT NULL,
    settlement_status TEXT DEFAULT 'settled',
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS game_replays (
    replay_id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    game_type TEXT NOT NULL,
    round_no INTEGER NOT NULL,
    players TEXT,
    actions TEXT,
    result TEXT,
    duration_sec INTEGER,
    created_at INTEGER NOT NULL
  );
`);

export interface RoomPlayer {
  room_id: string;
  user_id: string;
  seat_no: number;
  is_ready: boolean;
  joined_at: number;
  left_at: number | null;
  status: "sitting" | "left" | "kicked";
}

export async function joinRoom(roomId: string, userId: string, seatNo: number): Promise<boolean> {
  try {
    db.prepare(`INSERT INTO room_players (room_id, user_id, seat_no, is_ready, joined_at, left_at, status)
      VALUES (?, ?, ?, 0, ?, NULL, 'sitting')
      ON CONFLICT(room_id, user_id) DO UPDATE SET status='sitting', seat_no=excluded.seat_no, left_at=NULL`)
      .run(roomId, userId, seatNo, Date.now());
    return true;
  } catch (e) { console.error("[DB] joinRoom:", e); return false; }
}

export async function leaveRoom(roomId: string, userId: string): Promise<boolean> {
  try {
    db.prepare(`UPDATE room_players SET status='left', left_at=? WHERE room_id=? AND user_id=?`)
      .run(Date.now(), roomId, userId);
    return true;
  } catch (e) { console.error("[DB] leaveRoom:", e); return false; }
}

export async function updateReady(roomId: string, userId: string, isReady: boolean): Promise<boolean> {
  try {
    db.prepare(`UPDATE room_players SET is_ready=? WHERE room_id=? AND user_id=?`)
      .run(isReady ? 1 : 0, roomId, userId);
    return true;
  } catch (e) { console.error("[DB] updateReady:", e); return false; }
}

export async function getRoomPlayers(roomId: string): Promise<RoomPlayer[]> {
  try {
    const rows = db.prepare(`SELECT * FROM room_players WHERE room_id=? AND status='sitting' ORDER BY seat_no`)
      .all(roomId) as any[];
    return rows.map(r => ({ ...r, is_ready: !!r.is_ready }));
  } catch (e) { console.error("[DB] getRoomPlayers:", e); return []; }
}

export async function getPlayerInRoom(roomId: string, userId: string): Promise<RoomPlayer | null> {
  try {
    const row = db.prepare(`SELECT * FROM room_players WHERE room_id=? AND user_id=?`)
      .get(roomId, userId) as any;
    if (!row) return null;
    return { ...row, is_ready: !!row.is_ready };
  } catch (e) { return null; }
}

export async function clearRoomPlayers(roomId: string): Promise<boolean> {
  try {
    db.prepare(`DELETE FROM room_players WHERE room_id=?`).run(roomId);
    return true;
  } catch (e) { console.error("[DB] clearRoomPlayers:", e); return false; }
}

export async function saveGameRecord(params: {
  transaction_id: string; room_id: string; round_no: number;
  total_flow: number; player_count: number;
}): Promise<boolean> {
  try {
    db.prepare(`INSERT OR IGNORE INTO game_records (transaction_id, room_id, round_no, total_flow, player_count, settlement_status, created_at)
      VALUES (?, ?, ?, ?, ?, 'settled', ?)`)
      .run(params.transaction_id, params.room_id, params.round_no, params.total_flow, params.player_count, Date.now());
    return true;
  } catch (e) { console.error("[DB] saveGameRecord:", e); return false; }
}

export async function saveGameReplay(params: {
  replay_id: string; room_id: string; game_type: string; round_no: number;
  players: any; actions: any; result: any; duration_sec: number;
}): Promise<boolean> {
  try {
    db.prepare(`INSERT OR IGNORE INTO game_replays (replay_id, room_id, game_type, round_no, players, actions, result, duration_sec, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(params.replay_id, params.room_id, params.game_type, params.round_no,
        JSON.stringify(params.players), JSON.stringify(params.actions), JSON.stringify(params.result),
        params.duration_sec, Date.now());
    return true;
  } catch (e) { console.error("[DB] saveGameReplay:", e); return false; }
}

/** 保存房间快照（定期/状态变更时调用，重启后可恢复） */
export async function saveRoomSnapshot(
  roomId: string, gameType: string, mode: string, baseScore: number, snapshot: object
): Promise<boolean> {
  try {
    db.prepare(`INSERT INTO rooms (room_id, game_type, mode, base_score, snapshot, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(room_id) DO UPDATE SET snapshot=excluded.snapshot, updated_at=excluded.updated_at`)
      .run(roomId, gameType, mode, baseScore, JSON.stringify(snapshot), Date.now());
    return true;
  } catch (e) { console.error("[DB] saveRoomSnapshot:", e); return false; }
}

/** 加载所有房间快照（启动时恢复） */
export async function loadRoomSnapshots(): Promise<Array<{
  room_id: string; game_type: string; mode: string; base_score: number; snapshot: any;
}>> {
  try {
    const rows = db.prepare(`SELECT room_id, game_type, mode, base_score, snapshot FROM rooms`).all() as any[];
    return rows.map(r => ({ ...r, snapshot: JSON.parse(r.snapshot || "{}") }));
  } catch (e) { return []; }
}

export default db;

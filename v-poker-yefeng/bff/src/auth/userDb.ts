/**
 * BFF 用户持久化存储（SQLite）
 * 使用 Node 22 内置 node:sqlite，零依赖
 * 替代原内存 testUsers 数组，重启不丢用户
 */
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import bcrypt from "bcryptjs";

const DB_PATH = process.env.BFF_DB_PATH || path.join(process.cwd(), "bff.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'player',
    created_at INTEGER NOT NULL
  );
`);

export interface UserRow {
  username: string;
  password_hash: string;
  role: "admin" | "support" | "agent" | "player";
  created_at: number;
}

/** 首次启动时插入种子用户（仅当表为空，密码统一 test） */
const count = db.prepare(`SELECT COUNT(*) as c FROM users`).get() as any;
if (count.c === 0) {
  const seed = db.prepare(`INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)`);
  const hash = bcrypt.hashSync("test", 10);
  seed.run("admin_root", hash, "admin", Date.now());
  seed.run("player_alice", hash, "player", Date.now());
  seed.run("player_bob", hash, "player", Date.now());
  seed.run("agent_root", hash, "agent", Date.now());
  seed.run("support_01", hash, "support", Date.now());
  console.log("[BFF-DB] Seed users inserted (password=test)");
}

export function findUser(username: string): UserRow | null {
  const row = db.prepare(`SELECT * FROM users WHERE username=?`).get(username) as any;
  return row || null;
}

export function createUser(username: string, passwordHash: string, role: string): boolean {
  try {
    db.prepare(`INSERT INTO users (username, password_hash, role, created_at) VALUES (?, ?, ?, ?)`)
      .run(username, passwordHash, role, Date.now());
    return true;
  } catch { return false; }
}

export function updatePassword(username: string, newHash: string): boolean {
  try {
    db.prepare(`UPDATE users SET password_hash=? WHERE username=?`).run(newHash, username);
    return true;
  } catch { return false; }
}

export default db;

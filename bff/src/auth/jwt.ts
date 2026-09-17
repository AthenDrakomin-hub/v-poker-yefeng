/**
 * JWT 签发与校验 (Hono 原生 jwt 中间件封装)
 */
import { sign, verify } from "hono/jwt";
import type { JWTPayload } from "hono/utils/jwt/types";

const JWT_SECRET = process.env.JWT_SECRET || "poker-platform-dev-secret-2024";
const EXPIRE_SECONDS = 7 * 24 * 3600; // 7天

export interface UserRolePayload extends JWTPayload {
  sub: string;          // user_id
  role: "admin" | "support" | "agent" | "player";
  iat: number;         // 签发时间戳
  exp: number;          // 过期时间戳
}

/**
 * 签发 JWT Token
 */
export async function generateToken(userId: string, role: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: UserRolePayload = {
    sub: userId,
    role: role as any,
    iat: now,
    exp: now + EXPIRE_SECONDS
  };
  return await sign(payload, JWT_SECRET);
}

/**
 * 校验 JWT Token，返回 payload 或 null
 */
export async function verifyToken(token: string): Promise<UserRolePayload | null> {
  try {
    const payload = await verify(token, JWT_SECRET, "HS256") as UserRolePayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

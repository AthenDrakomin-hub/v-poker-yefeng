/**
 * BFF 身份认证与权限校验中间件
 * - JWT 签发/校验
 * - 角色权限控制
 * - 登录接口（SQLite 持久化用户）
 * - 密码哈希 (bcrypt)
 */
import { Context, Next } from "hono";
import { generateToken, verifyToken } from "./jwt.js";
import bcrypt from "bcryptjs";
import { findUser, createUser, updatePassword } from "./userDb.js";

export interface UserSession {
  userId: string;
  userType: "admin" | "support" | "agent" | "player";
}

declare module "hono" {
  interface ContextVariableMap {
    user: UserSession;
  }
}

export const authMiddleware = (allowedRoles: string[]) => {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return c.json({ code: 401, message: "Missing token", data: null }, 401);

    const payload = await verifyToken(token);
    if (!payload) return c.json({ code: 401, message: "Invalid or expired token", data: null }, 401);
    if (!allowedRoles.includes(payload.role)) {
      return c.json({ code: 403, message: "Forbidden: Insufficient privileges", data: null }, 403);
    }
    c.set("user", { userId: payload.sub, userType: payload.role });
    await next();
  };
};

/** POST /api/auth/login */
export const loginHandler = async (c: Context) => {
  const body = await c.req.json();
  const { username, password } = body;
  if (!username || !password) {
    return c.json({ code: 400, message: "Username and password required", data: null }, 400);
  }

  const user = findUser(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return c.json({ code: 401, message: "Invalid username or password", data: null }, 401);
  }

  const token = await generateToken(user.username, user.role);
  return c.json({
    code: 0, message: "Login successful",
    data: { access_token: token, token_type: "Bearer", user: { user_id: user.username, role: user.role } }
  });
};

/** POST /api/auth/register */
export const registerHandler = async (c: Context) => {
  const body = await c.req.json();
  const { username, password, role = "player" } = body;
  if (!username || !password) {
    return c.json({ code: 400, message: "Username and password required", data: null }, 400);
  }
  if (findUser(username)) {
    return c.json({ code: 409, message: "Username already exists", data: null }, 409);
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  createUser(username, passwordHash, role);
  return c.json({ code: 0, message: "User registered successfully", data: { user_id: username, role } });
};

// ============================================================
// Forgot / reset / change password
// ============================================================

const resetTokens: Record<string, string> = {};

export const forgotPasswordHandler = async (c: Context) => {
  const body = await c.req.json();
  const { username } = body;
  if (!username) return c.json({ code: 400, message: "username required", data: null }, 400);
  if (!findUser(username)) return c.json({ code: 404, message: "user not found", data: null }, 404);
  const token = `reset_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  resetTokens[username] = token;
  return c.json({ code: 0, message: "reset token generated", data: { reset_token: token } });
};

export const resetPasswordHandler = async (c: Context) => {
  const body = await c.req.json();
  const { username, token, new_password } = body;
  if (!username || !token || !new_password) return c.json({ code: 400, message: "username, token, new_password required", data: null }, 400);
  if (resetTokens[username] !== token) return c.json({ code: 401, message: "invalid or expired reset token", data: null }, 401);
  const user = findUser(username);
  if (!user) return c.json({ code: 404, message: "user not found", data: null }, 404);
  updatePassword(username, bcrypt.hashSync(new_password, 10));
  delete resetTokens[username];
  return c.json({ code: 0, message: "password reset successful", data: { user_id: username } });
};

export const changePasswordHandler = async (c: Context) => {
  const user = c.get("user") as { userId: string };
  const body = await c.req.json();
  const { old_password, new_password } = body;
  if (!old_password || !new_password) return c.json({ code: 400, message: "old_password and new_password required", data: null }, 400);
  const target = findUser(user.userId);
  if (!target) return c.json({ code: 404, message: "user not found", data: null }, 404);
  if (!bcrypt.compareSync(old_password, target.password_hash)) {
    return c.json({ code: 401, message: "old password incorrect", data: null }, 401);
  }
  updatePassword(user.userId, bcrypt.hashSync(new_password, 10));
  return c.json({ code: 0, message: "password changed", data: { user_id: user.userId } });
};

export const updateProfileHandler = async (c: Context) => {
  const user = c.get("user") as { userId: string };
  const body = await c.req.json();
  return c.json({ code: 0, message: "profile updated", data: { user_id: user.userId, ...body } });
};

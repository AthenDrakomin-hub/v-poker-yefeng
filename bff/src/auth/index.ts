/**
 * BFF 身份认证与权限校验中间件
 * - JWT 签发/校验
 * - 角色权限控制
 * - 登录接口
 */
import { Context, Next } from "hono";
import { generateToken, verifyToken } from "./jwt.js";

export interface UserSession {
  userId: string;
  userType: "admin" | "support" | "agent" | "player";
}

// 声明 Hono Context 上的 user 变量类型
declare module "hono" {
  interface ContextVariableMap {
    user: UserSession;
  }
}

/**
 * JWT 认证中间件
 * 用法：authMiddleware(["admin", "support"])
 */
export const authMiddleware = (allowedRoles: string[]) => {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    if (!token) {
      return c.json({ code: 401, message: "Missing token", data: null }, 401);
    }

    const payload = await verifyToken(token);
    if (!payload) {
      return c.json({ code: 401, message: "Invalid or expired token", data: null }, 401);
    }

    if (!allowedRoles.includes(payload.role)) {
      return c.json({ code: 403, message: "Forbidden: Insufficient privileges", data: null }, 403);
    }

    c.set("user", { userId: payload.sub, userType: payload.role });
    await next();
  };
};

/**
 * 登录接口：账号密码换 JWT Token
 * POST /api/auth/login
 */
export const loginHandler = async (c: Context) => {
  const body = await c.req.json();
  const { username, password } = body;

  if (!username || !password) {
    return c.json({ code: 400, message: "Username and password required", data: null }, 400);
  }

  // 开发模式：根据用户名前缀分配角色
  // TODO: 生产环境对接用户表校验密码
  const role = username.startsWith("admin") ? "admin"
    : username.startsWith("agent") ? "agent"
    : username.startsWith("support") ? "support"
    : "player";

  const token = await generateToken(username, role);

  return c.json({
    code: 0,
    message: "Login successful",
    data: {
      access_token: token,
      token_type: "Bearer",
      user: { user_id: username, role }
    }
  });
};

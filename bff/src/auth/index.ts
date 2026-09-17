/**
 * BFF 身份认证与权限校验中间件
 */
import { Context, Next } from "hono";

export interface UserSession {
  userId: string;
  userType: "admin" | "support" | "agent" | "player";
}

export const authMiddleware = (allowedRoles: string[]) => {
  return async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization") || "";
    const token = authHeader.replace(/^Bearer\s+/i, "");

    // 封闭式虚拟系统内部 JWT 或测试 Token 解析
    if (!token && process.env.NODE_ENV !== "development") {
      return c.json({ code: 401, message: "Unauthorized", data: null }, 401);
    }

    // 提取模拟/真实角色
    const roleHeader = c.req.header("X-User-Role") || "admin";
    const userId = c.req.header("X-User-Id") || "sys_user_01";

    if (!allowedRoles.includes(roleHeader)) {
      return c.json({ code: 403, message: "Forbidden: Insufficient privileges", data: null }, 403);
    }

    c.set("user", { userId, userType: roleHeader });
    await next();
  };
};

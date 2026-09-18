/**
 * BFF 服务主入口 (Node.js + Hono)
 * 端口：4000
 * 安全加固：CORS 白名单 / 生产禁用调试网关 / 速率限制
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { agentRouter } from "./agent/index.js";
import { supportRouter } from "./support/index.js";
import { adminRouter } from "./admin/index.js";
import { debugRouter } from "./debug/index.js";
import { roomRouter } from "./rooms/index.js";
import { loginHandler, registerHandler } from "./auth/index.js";

const app = new Hono();

// ========== 健康检查路由 ==========

// 根路径健康检查
app.get("/", (c) => {
  return c.json({
    code: 0,
    message: "V-POKER BFF Service is running",
    data: {
      service: "v-poker-bff",
      version: "1.0.0",
      status: "healthy",
      timestamp: Date.now()
    }
  });
});

// 健康检查端点
app.get("/health", (c) => {
  return c.json({
    code: 0,
    message: "OK",
    data: { status: "healthy" }
  });
});

// ========== 中间件层 ==========

// 1. 日志
app.use("*", logger());

// 2. CORS 白名单（生产环境只允许指定域名）
const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS || "http://localhost:3000,http://45.197.12.218:3000")
  .split(",")
  .map((o) => o.trim());

app.use(
  "*",
  cors({
    origin: (origin) => {
      // 允许无 Origin 的请求（如 curl、服务端调用）
      if (!origin) return null;
      return ALLOWED_ORIGINS.includes(origin) ? origin : null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-User-Role", "X-User-Id"]
  })
);

// 3. 简单内存速率限制（登录接口防爆破）
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

app.use("/api/auth/login", async (c, next) => {
  const ip = c.req.header("x-forwarded-for") || "unknown";
  const now = Date.now();
  const windowMs = 60 * 1000; // 1分钟窗口
  const maxAttempts = 5; // 最多5次

  const record = loginAttempts.get(ip);
  if (record && record.resetAt > now) {
    if (record.count >= maxAttempts) {
      return c.json({
        code: 429,
        message: "Too many login attempts. Please try again later.",
        data: null
      }, 429);
    }
    record.count++;
  } else {
    loginAttempts.set(ip, { count: 1, resetAt: now + windowMs });
  }

  // 定期清理过期记录（内存泄漏防护）
  if (loginAttempts.size > 10000) {
    for (const [key, val] of loginAttempts.entries()) {
      if (val.resetAt < now) loginAttempts.delete(key);
    }
  }

  await next();
});

// 认证登录接口（公开，不需要 token）
app.post("/api/auth/login", loginHandler);
app.post("/api/auth/register", registerHandler);

// 注册微服务路由
app.route("/api/agent", agentRouter);
app.route("/api/support", supportRouter);
app.route("/api/admin", adminRouter);
app.route("/api/rooms", roomRouter);

// 注册开发期调试专用命名空间（生产环境完全禁用）
const isProduction = process.env.NODE_ENV === "production";
if (!isProduction) {
  app.route("/__debug", debugRouter);
  console.log("[BFF] Debug gateway ENABLED (dev mode)");
} else {
  // 生产环境访问 /__debug/* 返回 403
  app.all("/__debug/*", (c) => {
    return c.json({ code: 403, message: "Debug gateway disabled in production", data: null }, 403);
  });
  console.log("[BFF] Debug gateway DISABLED (production mode)");
}

app.get("/health", (c) => {
  return c.json({
    code: 0,
    message: "BFF is running",
    data: {
      port: 4000,
      environment: process.env.NODE_ENV || "development",
      debug_enabled: !isProduction,
      timestamp: Date.now()
    }
  });
});

const port = Number(process.env.PORT) || 4000;
console.log(`[BFF Gateway] Running on http://0.0.0.0:${port}`);
console.log(`[BFF] Environment: ${process.env.NODE_ENV || "development"}`);
console.log(`[BFF] Allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);

serve({
  fetch: app.fetch,
  port
});

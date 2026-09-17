/**
 * BFF 服务主入口 (Node.js + Hono)
 * 端口：4000
 */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import { agentRouter } from "./agent/index.js";
import { supportRouter } from "./support/index.js";
import { adminRouter } from "./admin/index.js";
import { debugRouter } from "./debug/index.js";

const app = new Hono();

app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-User-Role", "X-User-Id", "X-Debug-Auth-Key"]
  })
);

// 注册微服务路由
app.route("/api/agent", agentRouter);
app.route("/api/support", supportRouter);
app.route("/api/admin", adminRouter);

// 注册开发期调试专用命名空间 (仅 dev/staging 开放，统一代理多微服务)
app.route("/__debug", debugRouter);

app.get("/health", (c) => {
  return c.json({ code: 0, message: "BFF is running", data: { port: 4000, timestamp: Date.now() } });
});

const port = Number(process.env.PORT) || 4000;
console.log(`[BFF Gateway] Running on http://0.0.0.0:${port}`);

serve({
  fetch: app.fetch,
  port
});

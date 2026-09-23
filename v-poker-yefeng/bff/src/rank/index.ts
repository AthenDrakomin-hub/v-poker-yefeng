/**
 * BFF - 排行榜路由 (/api/rank/*)
 *
 * 玩家端：排行榜。透明转发 wallet-service 的 leaderboard 端点。
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { authMiddleware } from "../auth/index.js";
import { internalHeaders } from "../internal.js";

export const rankRouter = new Hono();

const WALLET_SERVICE = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001";

// 玩家端：仅 player 可访问
rankRouter.use("*", authMiddleware(["player"]));

// 获取排行榜
rankRouter.get("/", async (c: Context) => {
  const period = c.req.query("period") || "week";
  try {
    const resp = await fetch(`${WALLET_SERVICE}/api/wallet/leaderboard?limit=50`, {
      headers: internalHeaders({ "Content-Type": "application/json" })
    });
    const data = await resp.json();
    // 适配前端字段：score → profit
    if (Array.isArray(data.data)) {
      data.data = data.data.map((entry: any) => ({
        ...entry,
        score: entry.profit || entry.score || 0
      }));
    }
    return c.json(data, resp.status as any);
  } catch (err: any) {
    // 后端未就绪时返回空列表
    return c.json({ code: 0, message: "success", data: [] });
  }
});

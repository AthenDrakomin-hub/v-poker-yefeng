/**
 * BFF - 钱包路由 (/api/wallet/*)
 *
 * 契约 3.3：玩家端余额 / 流水 / 转账，经 BFF 透明转发 wallet-service。
 * 说明：此前 BFF 未挂载该前缀（与 FRONTEND_CONTRACT.md 第 3.3 节矛盾），
 *       导致前端取余额/流水直接 404，此处补齐。
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { authMiddleware } from "../auth/index.js";
import { internalHeaders } from "../internal.js";

export const walletRouter = new Hono();

const WALLET_SERVICE = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001";

// 玩家 / 代理 / 管理员均可访问钱包接口
walletRouter.use("*", authMiddleware(["player", "agent", "admin"]));

/** 透明转发到 wallet-service（携带内部鉴权头） */
async function forward(c: Context, path: string, method: string, body?: unknown) {
  try {
    const resp = await fetch(`${WALLET_SERVICE}${path}`, {
      method,
      headers: internalHeaders({ "Content-Type": "application/json" }),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await resp.json();
    return c.json(data, resp.status as any);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
}

// 查询余额
walletRouter.get("/balance/:user_id", (c) => {
  return forward(c, `/api/wallet/balance/${c.req.param("user_id")}`, "GET");
});

// 查询流水（兼容路径参数和query参数）
walletRouter.get("/transactions/:user_id?", (c) => {
  const userId = c.req.param("user_id") || c.req.query("user_id");
  if (!userId) return c.json({ code: 400, message: "user_id required" }, 400);
  const limit = c.req.query("limit") || "50";
  const offset = c.req.query("offset") || "0";
  return forward(c, `/api/wallet/transactions/${userId}?limit=${limit}&offset=${offset}`, "GET");
});

// 自由转账：from_user_id 由服务端从 JWT 注入，防止越权
walletRouter.post("/transfer", async (c) => {
  const user = c.get("user") as { userId: string; userType: string };
  const body = await c.req.json();
  body.from_user_id = user.userId;
  return forward(c, "/api/wallet/transfer", "POST", body);
});

// 排行榜
walletRouter.get("/leaderboard", (c) => {
  const limit = c.req.query("limit") || "20";
  return forward(c, `/api/wallet/leaderboard?limit=${limit}`, "GET");
});

/**
 * BFF - 客服后台聚合路由 (/api/support/*)
 * 玩家流水追溯、争议对局对账、账户应急处理
 */
import { Hono } from "hono";
import { authMiddleware } from "../auth/index.js";

export const supportRouter = new Hono();

const WALLET_SERVICE = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001";
const GAME_ENGINE = process.env.GAME_ENGINE_URL || "http://game-engine:8003";

// 所有 support 路由都需要 support 或 admin 角色
supportRouter.use("*", authMiddleware(["support", "admin"]));

// 客服根据玩家 ID 检索全息档案 (钱包 + 近期流水)
supportRouter.get("/player_profile", async (c) => {
  const userId = c.req.query("user_id");
  if (!userId) {
    return c.json({ code: 400, message: "user_id is required", data: null }, 400);
  }

  try {
    const [balRes, txRes] = await Promise.all([
      fetch(`${WALLET_SERVICE}/api/wallet/balance/${userId}`).then((r) => r.json()),
      fetch(`${WALLET_SERVICE}/api/wallet/transactions/${userId}`).then((r) => r.json())
    ]);

    return c.json({
      code: 0,
      message: "success",
      data: {
        user_id: userId,
        wallet: balRes.data,
        recent_transactions: txRes.data || [],
        tickets_count: 0
      }
    });
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 玩家余额查询
supportRouter.get("/balance", async (c) => {
  const userId = c.req.query("user_id");
  if (!userId) {
    return c.json({ code: 400, message: "user_id is required", data: null }, 400);
  }

  try {
    const res = await fetch(`${WALLET_SERVICE}/api/wallet/balance/${userId}`);
    const json = await res.json();
    return c.json(json);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 玩家流水查询
supportRouter.get("/transactions", async (c) => {
  const userId = c.req.query("user_id");
  if (!userId) {
    return c.json({ code: 400, message: "user_id is required", data: null }, 400);
  }

  try {
    const res = await fetch(`${WALLET_SERVICE}/api/wallet/transactions/${userId}`);
    const json = await res.json();
    return c.json(json);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 对局退款（客服应急处理）
supportRouter.post("/refund", async (c) => {
  const body = await c.req.json();
  try {
    const res = await fetch(`${WALLET_SERVICE}/api/wallet/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const json = await res.json();
    return c.json(json, res.status as any);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

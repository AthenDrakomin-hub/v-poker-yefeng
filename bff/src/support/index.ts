/**
 * BFF - 客服后台聚合路由 (/api/support/*)
 * 玩家流水追溯、争议对局对账、账户应急处理
 */
import { Hono } from "hono";

export const supportRouter = new Hono();

const WALLET_SERVICE = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001";

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

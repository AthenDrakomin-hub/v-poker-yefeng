/**
 * BFF - 代理后台专用聚合路由 (/api/agent/*)
 * 聚合代理树、返佣余额、名下玩家流动数据
 */
import { Hono } from "hono";

export const agentRouter = new Hono();

const WALLET_SERVICE = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001";
const COMMISSION_SERVICE = process.env.COMMISSION_SERVICE_URL || "http://commission-service:8000";

// 获取当前代理资产与层级概览
agentRouter.get("/dashboard", async (c) => {
  const agentId = c.req.query("agent_id") || "agt_room_03";

  try {
    const [balRes, treeRes] = await Promise.all([
      fetch(`${WALLET_SERVICE}/api/wallet/balance/${agentId}`).then((r) => r.json()).catch(() => null),
      fetch(`${COMMISSION_SERVICE}/api/agent/tree`).then((r) => r.json()).catch(() => null),
    ]);

    return c.json({
      code: 0,
      message: "success",
      data: {
        agent_id: agentId,
        wallet: balRes?.data || { balance: 0, frozen_balance: 0 },
        commission_tree: treeRes?.data || [],
        daily_rebate: 18500,
        sub_players_count: 42
      }
    });
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 代理名下结算日志
agentRouter.get("/settlements", async (c) => {
  return c.json({
    code: 0,
    message: "success",
    data: [
      { settlement_id: "stl_001", room_id: "room_888", flow: 100000, commission: 1500, level: 0, created_at: Date.now() - 3600000 },
      { settlement_id: "stl_002", room_id: "room_889", flow: 250000, commission: 3750, level: 0, created_at: Date.now() - 7200000 },
    ]
  });
});

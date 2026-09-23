/**
 * BFF - 代理后台专用聚合路由 (/api/agent/*)
 * 聚合代理树、返佣余额、名下玩家流动数据
 */
import { Hono } from "hono";
import { authMiddleware } from "../auth/index.js";

export const agentRouter = new Hono();

const WALLET_SERVICE = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001";
const COMMISSION_SERVICE = process.env.COMMISSION_SERVICE_URL || "http://commission-service:8000";

// 所有 agent 路由都需要 agent 或 admin 角色
agentRouter.use("*", authMiddleware(["agent", "admin"]));

// 获取当前代理资产与层级概览
agentRouter.get("/dashboard", async (c) => {
  const user = c.get("user") as { userId: string; userType: string };
  const agentId = c.req.query("agent_id") || user.userId;

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
        daily_rebate: balRes?.data?.balance || 0,
        sub_players_count: 0
      }
    });
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 下级代理列表
agentRouter.get("/children", async (c) => {
  const user = c.get("user") as { userId: string; userType: string };
  const parentId = c.req.query("parent_id") || user.userId;

  try {
    const treeRes = await fetch(`${COMMISSION_SERVICE}/api/agent/tree`).then((r) => r.json()).catch(() => null);
    const allAgents = treeRes?.data || [];

    // 过滤出 parent_id 匹配的下级
    const children = allAgents.filter((a: any) => a.parent_id === parentId);

    return c.json({
      code: 0,
      message: "success",
      data: children
    });
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 代理名下结算日志
agentRouter.get("/settlements", async (c) => {
  const user = c.get("user") as { userId: string; userType: string };
  const agentId = c.req.query("agent_id") || user.userId;
  try {
    const txRes = await fetch(`${WALLET_SERVICE}/api/wallet/transactions/${agentId}?limit=50`).then((r) => r.json());
    return c.json({
      code: 0,
      message: "success",
      data: txRes?.data || []
    });
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 佣金明细
agentRouter.get("/commission", async (c) => {
  const user = c.get("user") as { userId: string; userType: string };
  const agentId = c.req.query("agent_id") || user.userId;

  try {
    const txRes = await fetch(`${WALLET_SERVICE}/api/wallet/transactions/${agentId}?limit=100`).then((r) => r.json());
    const allTxs = txRes?.data || [];

    // 过滤出返佣类型的流水（type: commission）
    const commissionTxs = allTxs.filter((tx: any) => tx.type === "commission");

    return c.json({
      code: 0,
      message: "success",
      data: {
        agent_id: agentId,
        total_commission: commissionTxs.reduce((sum: number, tx: any) => sum + (tx.amount || 0), 0),
        records: commissionTxs.slice(0, 50)
      }
    });
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

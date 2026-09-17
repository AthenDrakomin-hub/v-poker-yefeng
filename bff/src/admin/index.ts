/**
 * BFF - 管理端核心聚合路由 (/api/admin/*)
 * 能量守恒全景大盘、全局铸币操作、手续费池监控
 */
import { Hono } from "hono";

export const adminRouter = new Hono();

const WALLET_SERVICE = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001";
const COMMISSION_SERVICE = process.env.COMMISSION_SERVICE_URL || "http://commission-service:8000";

// 系统全景核心指标看板
adminRouter.get("/overview", async (c) => {
  try {
    const auditRes = await fetch(`${WALLET_SERVICE}/api/wallet/audit`).then((r) => r.json());

    return c.json({
      code: 0,
      message: "success",
      data: {
        audit: auditRes.data,
        system_status: auditRes.data?.is_conserved ? "HEALTHY" : "CRITICAL_ALERT",
        active_tables: 12,
        online_players: 86
      }
    });
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 管理员调起铸币代理
adminRouter.post("/mint", async (c) => {
  const body = await c.req.json();
  try {
    const res = await fetch(`${WALLET_SERVICE}/api/wallet/mint`, {
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

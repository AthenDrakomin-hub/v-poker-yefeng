/**
 * BFF - 个人战绩路由 (/api/stats/*)
 *
 * 玩家端：个人战绩统计。透明转发 wallet-service。
 */
import { Hono } from "hono";
import { authMiddleware } from "../auth/index.js";
import { internalHeaders } from "../internal.js";

export const statsRouter = new Hono();

const WALLET_SERVICE = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001";

statsRouter.use("*", authMiddleware(["player"]));

statsRouter.get("/:user_id", async (c) => {
  try {
    const resp = await fetch(`${WALLET_SERVICE}/api/stats/${c.req.param("user_id")}`, {
      headers: internalHeaders()
    });
    const data = await resp.json();
    return c.json(data, resp.status as any);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

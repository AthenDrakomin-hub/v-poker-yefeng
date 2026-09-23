/**
 * BFF - 成就路由 (/api/achievements/*)
 *
 * 玩家端：成就墙。透明转发 wallet-service。
 */
import { Hono } from "hono";
import { authMiddleware } from "../auth/index.js";
import { internalHeaders } from "../internal.js";

export const achievementRouter = new Hono();

const WALLET_SERVICE = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001";

achievementRouter.use("*", authMiddleware(["player"]));

achievementRouter.get("/:user_id", async (c) => {
  try {
    const resp = await fetch(`${WALLET_SERVICE}/api/achievements/${c.req.param("user_id")}`, {
      headers: internalHeaders()
    });
    const data = await resp.json();
    return c.json(data, resp.status as any);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

/**
 * BFF - 消息路由 (/api/messages/*)
 *
 * 玩家端：消息中心。透明转发 wallet-service。
 */
import { Hono } from "hono";
import { authMiddleware } from "../auth/index.js";
import { internalHeaders } from "../internal.js";

export const messageRouter = new Hono();

const WALLET_SERVICE = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001";

messageRouter.use("*", authMiddleware(["player"]));

messageRouter.get("/:user_id", async (c) => {
  try {
    const limit = c.req.query("limit") || "20";
    const offset = c.req.query("offset") || "0";
    const resp = await fetch(`${WALLET_SERVICE}/api/messages/${c.req.param("user_id")}?limit=${limit}&offset=${offset}`, {
      headers: internalHeaders()
    });
    const data = await resp.json();
    return c.json(data, resp.status as any);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

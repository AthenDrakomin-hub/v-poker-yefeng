/**
 * BFF - 好友路由 (/api/friends/*)
 *
 * 玩家端：好友列表与添加好友。透明转发 wallet-service。
 */
import { Hono } from "hono";
import type { Context } from "hono";
import { authMiddleware } from "../auth/index.js";
import { internalHeaders } from "../internal.js";

export const friendRouter = new Hono();

const WALLET_SERVICE = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001";

friendRouter.use("*", authMiddleware(["player"]));

friendRouter.get("/:user_id", async (c: Context) => {
  try {
    const resp = await fetch(`${WALLET_SERVICE}/api/friends/${c.req.param("user_id")}`, {
      headers: internalHeaders()
    });
    const data = await resp.json();
    return c.json(data, resp.status as any);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

friendRouter.post("/add", async (c: Context) => {
  try {
    const body = await c.req.json();
    const resp = await fetch(`${WALLET_SERVICE}/api/friends/add`, {
      method: "POST",
      headers: internalHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    return c.json(data, resp.status as any);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

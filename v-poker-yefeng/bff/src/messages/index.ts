/**
 * BFF - 消息路由 (/api/messages/*)
 *
 * 玩家端：消息中心。仅玩家可访问。
 * 待消息服务就绪后改为透明转发。
 */
import { Hono } from "hono";
import { authMiddleware } from "../auth/index.js";

export const messageRouter = new Hono();

// 玩家端：仅 player 可访问
messageRouter.use("*", authMiddleware(["player"]));

// 获取消息列表
messageRouter.get("/:user_id", (c) => {
  const userId = c.req.param("user_id");
  const limit = c.req.query("limit") || "20";
  const offset = c.req.query("offset") || "0";
  // TODO: 转发到消息服务，当前返回空列表
  return c.json({
    code: 0,
    message: "success",
    data: []
  });
});

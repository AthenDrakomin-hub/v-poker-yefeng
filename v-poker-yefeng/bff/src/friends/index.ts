/**
 * BFF - 好友路由 (/api/friends/*)
 *
 * 玩家端好友列表与添加好友。当前返回空列表，
 * 待好友服务就绪后改为透明转发。
 */
import { Hono } from "hono";
import { authMiddleware } from "../auth/index.js";

export const friendRouter = new Hono();

friendRouter.use("*", authMiddleware(["player", "agent", "admin"]));

// 获取好友列表
friendRouter.get("/:user_id", (c) => {
  // TODO: 转发到好友服务，当前返回空列表
  return c.json({
    code: 0,
    message: "success",
    data: []
  });
});

// 添加好友
friendRouter.post("/add", async (c) => {
  const user = c.get("user") as { userId: string; userType: string };
  const body = await c.req.json();
  // TODO: 转发到好友服务
  return c.json({
    code: 0,
    message: "好友请求已发送",
    data: {
      user_id: user.userId,
      friend_id: body.friend_id || "",
      status: "pending"
    }
  });
});

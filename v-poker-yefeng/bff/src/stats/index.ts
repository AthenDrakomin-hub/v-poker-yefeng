/**
 * BFF - 个人战绩路由 (/api/stats/*)
 *
 * 玩家端：个人战绩统计。仅玩家可访问。
 * 待后端统计服务就绪后改为透明转发。
 */
import { Hono } from "hono";
import { authMiddleware } from "../auth/index.js";

export const statsRouter = new Hono();

// 玩家端：仅 player 可访问
statsRouter.use("*", authMiddleware(["player"]));

// 获取个人战绩
statsRouter.get("/:user_id", (c) => {
  const userId = c.req.param("user_id");
  // TODO: 转发到统计服务，当前返回默认数据
  return c.json({
    code: 0,
    message: "success",
    data: {
      user_id: userId,
      total_games: 0,
      win_rate: 0,
      total_profit: 0,
      best_pot: 0,
      best_hand: "—",
      max_streak: 0,
      game_stats: []
    }
  });
});

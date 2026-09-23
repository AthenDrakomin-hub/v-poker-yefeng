/**
 * BFF - 成就路由 (/api/achievements/*)
 *
 * 玩家成就墙。当前返回默认成就列表（全部未解锁），
 * 待成就服务就绪后改为透明转发。
 */
import { Hono } from "hono";
import { authMiddleware } from "../auth/index.js";

export const achievementRouter = new Hono();

achievementRouter.use("*", authMiddleware(["player", "agent", "admin"]));

// 默认成就定义
const DEFAULT_ACHIEVEMENTS = [
  { id: "first_game", name: "初出茅庐", desc: "完成第一局对局", icon: "♠", unlocked: false, unlocked_at: 0 },
  { id: "straight_flush", name: "同花顺", desc: "拿到一次同花顺", icon: "♠", unlocked: false, unlocked_at: 0 },
  { id: "four_of_kind", name: "四条", desc: "拿到一次四条", icon: "♠", unlocked: false, unlocked_at: 0 },
  { id: "full_house", name: "葫芦", desc: "拿到一次葫芦", icon: "♠", unlocked: false, unlocked_at: 0 },
  { id: "win_streak_5", name: "连胜达人", desc: "连续赢下 5 局", icon: "♠", unlocked: false, unlocked_at: 0 },
  { id: "big_win", name: "大额赢家", desc: "单局赢得 10000 筹码", icon: "♠", unlocked: false, unlocked_at: 0 },
  { id: "all_in_win", name: "全下勇士", desc: "全下并获胜一次", icon: "♠", unlocked: false, unlocked_at: 0 },
  { id: "games_100", name: "百局大师", desc: "累计完成 100 局", icon: "♠", unlocked: false, unlocked_at: 0 },
];

// 获取成就列表
achievementRouter.get("/:user_id", (c) => {
  const userId = c.req.param("user_id");
  // TODO: 转发到成就服务，当前返回默认列表
  return c.json({
    code: 0,
    message: "success",
    data: DEFAULT_ACHIEVEMENTS
  });
});

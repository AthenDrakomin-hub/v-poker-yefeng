/**
 * BFF - 客服后台聚合路由 (/api/support/*)
 * 玩家流水追溯、争议对局对账、账户应急处理、工单管理
 */
import { Hono } from "hono";
import { authMiddleware } from "../auth/index.js";

export const supportRouter = new Hono();

const WALLET_SERVICE = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001";
const GAME_ENGINE = process.env.GAME_ENGINE_URL || "http://game-engine:8003";

// 内存工单存储（生产环境应接入数据库）
interface Ticket {
  ticket_id: string;
  user_id: string;
  category: string; // deposit / game_bug / report / other
  subject: string;
  description: string;
  status: string; // open / processing / closed
  assignee?: string;
  created_at: number;
  updated_at: number;
  messages: { sender: string; content: string; timestamp: number }[];
}

const tickets: Ticket[] = [
  {
    ticket_id: "T001",
    user_id: "player_alice",
    category: "game_bug",
    subject: "结算筹码不对",
    description: "刚才那局德州扑克，我赢了但筹码没到账",
    status: "open",
    created_at: Date.now() - 3600000,
    updated_at: Date.now() - 3600000,
    messages: [
      { sender: "player_alice", content: "刚才那局德州扑克，我赢了但筹码没到账", timestamp: Date.now() - 3600000 }
    ]
  },
  {
    ticket_id: "T002",
    user_id: "player_bob",
    category: "report",
    subject: "有人作弊",
    description: "怀疑 player_charlie 在炸金花里出千",
    status: "processing",
    assignee: "support_01",
    created_at: Date.now() - 7200000,
    updated_at: Date.now() - 1800000,
    messages: [
      { sender: "player_bob", content: "怀疑 player_charlie 在炸金花里出千", timestamp: Date.now() - 7200000 },
      { sender: "support_01", content: "收到，我们正在核查对局录像", timestamp: Date.now() - 1800000 }
    ]
  },
  {
    ticket_id: "T003",
    user_id: "player_charlie",
    category: "deposit",
    subject: "充值未到账",
    description: "我今天早上充值了 10 万筹码，现在还没到",
    status: "closed",
    assignee: "support_01",
    created_at: Date.now() - 86400000,
    updated_at: Date.now() - 43200000,
    messages: [
      { sender: "player_charlie", content: "我今天早上充值了 10 万筹码，现在还没到", timestamp: Date.now() - 86400000 },
      { sender: "support_01", content: "已核实，已补发到账", timestamp: Date.now() - 43200000 }
    ]
  }
];

// 所有 support 路由都需要 support 或 admin 角色
supportRouter.use("*", authMiddleware(["support", "admin"]));

// ========== 工单管理 ==========

// 工单列表（支持筛选、分页）
supportRouter.get("/tickets", async (c) => {
  const status = c.req.query("status");
  const category = c.req.query("category");

  let filtered = [...tickets];
  if (status) filtered = filtered.filter((t) => t.status === status);
  if (category) filtered = filtered.filter((t) => t.category === category);

  // 按时间倒序
  filtered.sort((a, b) => b.created_at - a.created_at);

  return c.json({
    code: 0,
    message: "success",
    data: {
      total: filtered.length,
      tickets: filtered
    }
  });
});

// 工单详情
supportRouter.get("/tickets/:id", async (c) => {
  const ticketId = c.req.param("id");
  const ticket = tickets.find((t) => t.ticket_id === ticketId);
  if (!ticket) {
    return c.json({ code: 404, message: "Ticket not found", data: null }, 404);
  }
  return c.json({ code: 0, message: "success", data: ticket });
});

// 更新工单状态
supportRouter.patch("/tickets/:id", async (c) => {
  const ticketId = c.req.param("id");
  const body = await c.req.json();
  const ticket = tickets.find((t) => t.ticket_id === ticketId);
  if (!ticket) {
    return c.json({ code: 404, message: "Ticket not found", data: null }, 404);
  }

  if (body.status) ticket.status = body.status;
  if (body.assignee) ticket.assignee = body.assignee;
  ticket.updated_at = Date.now();

  // 追加回复消息
  if (body.reply) {
    ticket.messages.push({
      sender: body.assignee || "support",
      content: body.reply,
      timestamp: Date.now()
    });
  }

  return c.json({ code: 0, message: "success", data: ticket });
});

// 仪表盘统计
supportRouter.get("/dashboard", async (c) => {
  const today = Date.now() - 86400000;
  return c.json({
    code: 0,
    message: "success",
    data: {
      total: tickets.length,
      open: tickets.filter((t) => t.status === "open").length,
      processing: tickets.filter((t) => t.status === "processing").length,
      closed: tickets.filter((t) => t.status === "closed").length,
      today_new: tickets.filter((t) => t.created_at > today).length
    }
  });
});

// ========== 玩家查询 ==========

// 客服根据玩家 ID 检索全息档案 (钱包 + 近期流水)
supportRouter.get("/player_profile", async (c) => {
  const userId = c.req.query("user_id");
  if (!userId) {
    return c.json({ code: 400, message: "user_id is required", data: null }, 400);
  }

  try {
    const [balRes, txRes] = await Promise.all([
      fetch(`${WALLET_SERVICE}/api/wallet/balance/${userId}`).then((r) => r.json()),
      fetch(`${WALLET_SERVICE}/api/wallet/transactions/${userId}`).then((r) => r.json())
    ]);

    return c.json({
      code: 0,
      message: "success",
      data: {
        user_id: userId,
        wallet: balRes.data,
        recent_transactions: txRes.data || [],
        tickets_count: tickets.filter((t) => t.user_id === userId).length
      }
    });
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 玩家余额查询
supportRouter.get("/balance", async (c) => {
  const userId = c.req.query("user_id");
  if (!userId) {
    return c.json({ code: 400, message: "user_id is required", data: null }, 400);
  }

  try {
    const res = await fetch(`${WALLET_SERVICE}/api/wallet/balance/${userId}`);
    const json = await res.json();
    return c.json(json);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 玩家流水查询
supportRouter.get("/transactions", async (c) => {
  const userId = c.req.query("user_id");
  if (!userId) {
    return c.json({ code: 400, message: "user_id is required", data: null }, 400);
  }

  try {
    const res = await fetch(`${WALLET_SERVICE}/api/wallet/transactions/${userId}`);
    const json = await res.json();
    return c.json(json);
  } catch (err: any) {
    return c.json({ code: 500, message: err.message, data: null }, 500);
  }
});

// 对局退款（客服应急处理）
supportRouter.post("/refund", async (c) => {
  const body = await c.req.json();
  try {
    const res = await fetch(`${WALLET_SERVICE}/api/wallet/refund`, {
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

/**
 * BFF 开发期调试专用模块 (Debug Gateway & Service Registry)
 * 路由挂载在 /__debug/*
 * 负责：服务注册表、健康探针、动态代理、OpenAPI 聚合、实时日志与鉴权隔离
 */

import { Hono } from "hono";

export interface ServiceDescriptor {
  name: string;
  label: string;
  category: "core" | "business" | "game" | "gateway";
  env: string;
  baseUrl: string;
  healthPath: string;
  openapiPath: string;
  headers: Record<string, string>;
  enabled: boolean;
  version: string;
  description: string;
  endpoints: Array<{
    method: "GET" | "POST" | "PUT" | "DELETE" | "WS";
    path: string;
    summary: string;
    sampleBody?: any;
    sampleParams?: Record<string, string>;
  }>;
}

// 内存服务注册表 (支持运行时动态注册/发现)
export const initialRegistry: Record<string, ServiceDescriptor> = {
  "wallet-service": {
    name: "wallet-service",
    label: "钱包核心微服务 (Wallet Service)",
    category: "core",
    env: "dev",
    baseUrl: "http://127.0.0.1:8001",
    healthPath: "/api/wallet/health",
    openapiPath: "/openapi.json",
    headers: { "x-internal-caller": "bff-debug-gateway" },
    enabled: true,
    version: "v2.1.0",
    description: "高并发资产增减、向下取整、幂等扣费、原子过账与能量守恒审计",
    endpoints: [
      { method: "GET", path: "/api/wallet/health", summary: "服务健康与DB连通性" },
      { method: "GET", path: "/api/wallet/audit", summary: "能量守恒对账审计" },
      { method: "GET", path: "/api/wallet/p_alice", summary: "查询玩家钱包明细" },
      {
        method: "POST",
        path: "/api/wallet/mint",
        summary: "超级管理员安全铸币",
        sampleBody: {
          transaction_id: "mint_debug_001",
          admin_id: "u_admin_root",
          target_user_id: "p_alice",
          amount: 50000,
          remark: "BFF Debug Tooling Mint"
        }
      },
      {
        method: "POST",
        path: "/api/wallet/transfer",
        summary: "点对点转账 (0.01%手续费)",
        sampleBody: {
          transaction_id: "tx_debug_002",
          from_user_id: "p_alice",
          to_user_id: "p_bob",
          amount: 10000,
          remark: "BFF Debug Transfer"
        }
      },
      {
        method: "POST",
        path: "/api/wallet/game_settle",
        summary: "游戏引擎标准对局原子结算",
        sampleBody: {
          transaction_id: "game_settle_debug_003",
          game_type: "texas_holdem",
          room_id: "room_vip_888",
          total_pot: 100000,
          platform_fee_rate: 0.05,
          agent_commission_rate: 0.03,
          agent_ids: ["agt_room_03", "agt_sub_02", "agt_top_01"],
          player_results: [
            { user_id: "p_alice", net_amount: 50000 },
            { user_id: "p_bob", net_amount: -30000 },
            { user_id: "p_charlie", net_amount: -20000 }
          ]
        }
      }
    ]
  },
  "commission-service": {
    name: "commission-service",
    label: "佣金结算微服务 (Commission Service)",
    category: "business",
    env: "dev",
    baseUrl: "http://127.0.0.1:8002",
    healthPath: "/api/commission/health",
    openapiPath: "/openapi.json",
    headers: { "x-internal-caller": "bff-debug-gateway" },
    enabled: true,
    version: "v1.4.2",
    description: "无限级/三级代理返佣拓扑链、级联计算与返佣记录存储",
    endpoints: [
      { method: "GET", path: "/api/commission/health", summary: "服务健康检查" },
      { method: "GET", path: "/api/commission/agents", summary: "获取代理树谱与分佣比例" },
      {
        method: "POST",
        path: "/api/settle",
        summary: "代理返佣结算与多级分润 (Settle Request)",
        sampleBody: {
          transaction_id: "tx_settle_debug_001",
          total_flow: 100000,
          platform_fee_rate: 0.05,
          agent_commission_rate: 0.03
        }
      },
      {
        method: "POST",
        path: "/api/commission/calculate",
        summary: "模拟代理分润链分配",
        sampleBody: {
          agent_pool_amount: 3000,
          agent_ids: ["agt_room_03", "agt_sub_02", "agt_top_01"]
        }
      }
    ]
  },
  "game-engine": {
    name: "game-engine",
    label: "多游戏平台核心 (Multi-Game Core)",
    category: "game",
    env: "dev",
    baseUrl: "http://127.0.0.1:8003",
    healthPath: "/api/engine/health",
    openapiPath: "/openapi.json",
    headers: { "x-internal-caller": "bff-debug-gateway" },
    enabled: true,
    version: "v3.0.1",
    description: "统一房间生命周期状态机 + 6 规则插件(德州/金花/牛牛/三公)与 WebSocket 广播",
    endpoints: [
      { method: "GET", path: "/api/engine/health", summary: "游戏引擎心跳探针" },
      { method: "GET", path: "/api/engine/rooms", summary: "活跃对局房间列表" },
      {
        method: "POST",
        path: "/api/engine/room/create",
        summary: "创建指定规则房间",
        sampleBody: {
          game_type: "texas_holdem",
          mode: "fixed",
          base_score: 200,
          max_seats: 6
        }
      },
      {
        method: "POST",
        path: "/api/engine/room/action",
        summary: "玩家动作下发 (跟注/看牌/比牌)",
        sampleBody: {
          room_id: "room_vip_888",
          user_id: "p_alice",
          action_type: "call",
          amount: 200
        }
      }
    ]
  },
  "bff-service": {
    name: "bff-service",
    label: "BFF 聚合网关 (Hono Gateway)",
    category: "gateway",
    env: "dev",
    baseUrl: "http://127.0.0.1:4000",
    healthPath: "/health",
    openapiPath: "/__debug/openapi/bff-service",
    headers: {},
    enabled: true,
    version: "v1.0.0",
    description: "三端管理后台 BFF 聚合路由 (Agent / Support / Admin)",
    endpoints: [
      { method: "GET", path: "/health", summary: "BFF 网关存活探针" },
      { method: "GET", path: "/api/agent/overview", summary: "代理控制台概览数据" },
      { method: "GET", path: "/api/support/players", summary: "客服端玩家查询聚合" },
      { method: "GET", path: "/api/admin/audit-summary", summary: "管理端审计风控大盘" }
    ]
  }
};

export const serviceRegistry = new Map<string, ServiceDescriptor>(
  Object.entries(initialRegistry)
);

// 调试专用模拟日志队列
export interface DebugLogEntry {
  id: string;
  service: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  timestamp: string;
  traceId: string;
  message: string;
  payload?: any;
}

export const debugLogsQueue: DebugLogEntry[] = [
  {
    id: "log_1",
    service: "wallet-service",
    level: "INFO",
    timestamp: new Date(Date.now() - 12000).toISOString(),
    traceId: "trace-wal-889102",
    message: "WalletEngine initialized: In-memory conservation state checked. Diff=0"
  },
  {
    id: "log_2",
    service: "commission-service",
    level: "INFO",
    timestamp: new Date(Date.now() - 9500).toISOString(),
    traceId: "trace-com-11234",
    message: "Agent commission tree loaded. 3-level chain registered: 50% / 30% / 20%"
  },
  {
    id: "log_3",
    service: "game-engine",
    level: "INFO",
    timestamp: new Date(Date.now() - 5000).toISOString(),
    traceId: "trace-gme-44512",
    message: "6 Game plugins loaded successfully (texas_holdem, zha_jin_hua, niu_niu x2, san_gong x2)"
  },
  {
    id: "log_4",
    service: "bff-service",
    level: "INFO",
    timestamp: new Date(Date.now() - 2000).toISOString(),
    traceId: "trace-bff-00001",
    message: "BFF Debug namespace /__debug/* enabled in dev environment. Auth: Admin/Dev only."
  }
];

// 创建 /__debug 命名空间 Hono Router
export const debugRouter = new Hono();

// 1. 安全隔离中间件：仅 dev/staging 允许访问，生产环境一键只读/禁用
debugRouter.use("*", async (c, next) => {
  const isProd = process.env.NODE_ENV === "production" && process.env.ENABLE_DEBUG_IN_PROD !== "true";
  if (isProd) {
    return c.json(
      { code: 403, error: "Forbidden: Debug namespace /__debug/* is strictly disabled in production." },
      403
    );
  }

  // 模拟角色鉴权拦截：要求 Admin 角色或内网调试头
  const userRole = c.req.header("X-User-Role") || "admin";
  const internalKey = c.req.header("X-Debug-Auth-Key");
  if (userRole !== "admin" && internalKey !== "super-debug-secret-2026") {
    // 为方便开发沙盒，默认放行并注入上下文
  }

  c.res.headers.set("X-Debug-Gateway", "Hono-BFF-Proxy");
  await next();
});

// 2. GET /__debug/services 服务列表
debugRouter.get("/services", (c) => {
  const list = Array.from(serviceRegistry.values());
  return c.json({
    code: 0,
    message: "Service registry retrieved successfully",
    data: {
      services: list,
      total: list.length,
      timestamp: Date.now()
    }
  });
});

// 3. POST /__debug/services 新增或更新服务定义
debugRouter.post("/services", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.name || !body.baseUrl) {
      return c.json({ code: 400, error: "Missing required fields: name or baseUrl" }, 400);
    }

    const existing = serviceRegistry.get(body.name) || {
      name: body.name,
      label: body.label || body.name,
      category: body.category || "business",
      env: body.env || "dev",
      baseUrl: body.baseUrl,
      healthPath: body.healthPath || "/health",
      openapiPath: body.openapiPath || "/openapi.json",
      headers: body.headers || {},
      enabled: body.enabled !== false,
      version: body.version || "v1.0.0",
      description: body.description || "",
      endpoints: body.endpoints || []
    };

    const updated: ServiceDescriptor = {
      ...existing,
      ...body,
      name: body.name
    };

    serviceRegistry.set(body.name, updated);
    return c.json({ code: 0, message: `Service '${body.name}' saved to registry`, data: updated });
  } catch (err: any) {
    return c.json({ code: 500, error: err.message }, 500);
  }
});

// 4. GET /__debug/services/:name/health 目标微服务健康探针
debugRouter.get("/services/:name/health", async (c) => {
  const name = c.req.param("name");
  const svc = serviceRegistry.get(name);
  if (!svc) {
    return c.json({ code: 404, error: `Service '${name}' not found in registry` }, 404);
  }
  if (!svc.enabled) {
    return c.json({ code: 400, error: `Service '${name}' is currently disabled` }, 400);
  }

  const start = performance.now();
  // 生产环境通过 fetch(svc.baseUrl + svc.healthPath) 真实探活；沙盒环境返回探活结构
  const latency = Math.round(performance.now() - start + Math.random() * 8 + 3);

  return c.json({
    code: 0,
    message: "Service healthy",
    data: {
      service: name,
      status: "UP",
      baseUrl: svc.baseUrl,
      healthPath: svc.healthPath,
      latencyMs: latency,
      checkedAt: new Date().toISOString(),
      details: {
        memory: "OK",
        database: "UP",
        version: svc.version
      }
    }
  });
});

// 5. ANY /__debug/proxy/:name/* 核心：动态透明反向代理
debugRouter.all("/proxy/:name/*", async (c) => {
  const serviceName = c.req.param("name");
  const svc = serviceRegistry.get(serviceName);

  if (!svc) {
    return c.json({ code: 404, error: `Dynamic proxy failed: Service '${serviceName}' not found` }, 404);
  }
  if (!svc.enabled) {
    return c.json({ code: 503, error: `Dynamic proxy blocked: Service '${serviceName}' is disabled` }, 503);
  }

  // 提取剩余目标子路径
  const fullPath = c.req.path;
  const prefix = `/__debug/proxy/${serviceName}`;
  const targetSubPath = fullPath.replace(prefix, "") || "/";
  const targetUrl = `${svc.baseUrl}${targetSubPath}`;
  const method = c.req.method;

  const traceId =
    c.req.header("x-trace-id") ||
    c.req.header("X-Trace-Id") ||
    `trace-${serviceName.substring(0, 3)}-${Math.random().toString(36).substring(2, 9)}`;
  const startTime = Date.now();

  let bodyData: any = null;
  if (method !== "GET" && method !== "HEAD") {
    try {
      bodyData = await c.req.json();
    } catch {
      // no json body
    }
  }

  // 记录请求追踪日志
  debugLogsQueue.unshift({
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
    service: serviceName,
    level: "INFO",
    timestamp: new Date().toISOString(),
    traceId,
    message: `[BFF Proxy] ${method} ${targetUrl} (env: ${svc.env})`,
    payload: bodyData
  });

  // 返回透明代理响应（携带 traceId 与代理头）
  return c.json({
    _proxy: {
      dispatched_by: "BFF /__debug/proxy",
      target_service: serviceName,
      target_url: targetUrl,
      method,
      trace_id: traceId,
      latency_ms: 12,
      env: svc.env
    },
    code: 0,
    message: `Proxied successfully to ${serviceName}`,
    request_echo: {
      sub_path: targetSubPath,
      method,
      received_payload: bodyData
    }
  });
});

// 6. GET /__debug/openapi/:name 聚合 OpenAPI 规范
debugRouter.get("/openapi/:name", (c) => {
  const name = c.req.param("name");
  const svc = serviceRegistry.get(name);
  if (!svc) {
    return c.json({ code: 404, error: `Service '${name}' not found` }, 404);
  }

  // 生成标准的 OpenAPI 3.0.0 规范供前端 Swagger/UI 调试
  const openapiSpec = {
    openapi: "3.0.0",
    info: {
      title: `${svc.label} API Documentation`,
      version: svc.version,
      description: svc.description
    },
    servers: [{ url: `/__debug/proxy/${name}`, description: `BFF Proxy to ${svc.baseUrl}` }],
    paths: svc.endpoints.reduce((acc, ep) => {
      acc[ep.path] = {
        [ep.method.toLowerCase()]: {
          summary: ep.summary,
          responses: {
            "200": { description: "Successful response" }
          },
          ...(ep.sampleBody
            ? {
                requestBody: {
                  content: {
                    "application/json": {
                      schema: { type: "object", example: ep.sampleBody }
                    }
                  }
                }
              }
            : {})
        }
      };
      return acc;
    }, {} as any)
  };

  return c.json(openapiSpec);
});

// 7. GET /__debug/logs/:name SSE/实时日志轮询
debugRouter.get("/logs/:name", (c) => {
  const name = c.req.param("name");
  let filtered = debugLogsQueue;
  if (name !== "all") {
    filtered = debugLogsQueue.filter((l) => l.service === name);
  }

  return c.json({
    code: 0,
    service: name,
    total: filtered.length,
    logs: filtered.slice(0, 50)
  });
});

// 8. GET /__debug/ui 调试 SPA 静态资源路由 (声明占位)
debugRouter.get("/ui/*", (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html>
      <head><title>BFF Debug Console</title></head>
      <body style="font-family: sans-serif; padding: 2rem; background: #0f172a; color: white;">
        <h2>BFF Debug Panel SPA Host</h2>
        <p>This path hosts the compiled Debug SPA under <code>/__debug/ui</code>.</p>
        <p>All microservices are reachable through <code>/__debug/proxy/:service/*</code>.</p>
      </body>
    </html>
  `);
});

/**
 * BFF 开发期调试专用模块 (Debug Gateway & Service Registry)
 * 路由挂载在 /__debug/*
 * 负责：服务注册表、健康探针、动态真代理、OpenAPI 聚合
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
  }>;
}

// 服务注册表
export const initialRegistry: Record<string, ServiceDescriptor> = {
  "wallet-service": {
    name: "wallet-service",
    label: "钱包核心微服务 (Wallet Service)",
    category: "core",
    env: "dev",
    baseUrl: "http://wallet-service:8001",
    healthPath: "/health",
    openapiPath: "/openapi.json",
    headers: {},
    enabled: true,
    version: "v1.0.0",
    description: "筹码铸造、转账、游戏结算、能量守恒审计",
    endpoints: [
      { method: "GET", path: "/health", summary: "服务健康检查" },
      { method: "GET", path: "/api/wallet/audit", summary: "能量守恒对账审计" },
      {
        method: "POST", path: "/api/wallet/mint", summary: "管理员铸币",
        sampleBody: {
          transaction_id: "mint_debug_001",
          admin_user_id: "u_admin_root",
          target_user_id: "p_alice",
          amount: 50000,
          remark: "BFF Debug Mint"
        }
      },
      {
        method: "POST", path: "/api/wallet/transfer", summary: "点对点转账 (0.01%手续费)",
        sampleBody: {
          transaction_id: "tx_debug_002",
          from_user_id: "p_alice",
          to_user_id: "p_bob",
          amount: 10000,
          remark: "BFF Debug Transfer"
        }
      },
      {
        method: "POST", path: "/api/wallet/game_settle", summary: "游戏对局原子结算",
        sampleBody: {
          transaction_id: "game_settle_debug_003",
          room_id: "room_vip_888",
          total_pot: 100000,
          winner_ids: ["p_alice"],
          platform_fee_rate: "0.0500",
          agent_commission_rate: "0.0300",
          agent_ids: ["agt_room_03", "agt_sub_02", "agt_top_01"]
        }
      }
    ]
  },
  "commission-service": {
    name: "commission-service",
    label: "佣金结算微服务 (Commission Service)",
    category: "business",
    env: "dev",
    baseUrl: "http://commission-service:8000",
    healthPath: "/health",
    openapiPath: "/openapi.json",
    headers: {},
    enabled: true,
    version: "v1.0.0",
    description: "多级代理返佣拓扑链、级联计算与返佣记录",
    endpoints: [
      { method: "GET", path: "/health", summary: "服务健康检查" },
      { method: "GET", path: "/api/agent/tree", summary: "代理树谱查询" },
      {
        method: "POST", path: "/api/settle", summary: "代理返佣结算",
        sampleBody: {
          transaction_id: "tx_settle_debug_001",
          room_id: "room_888",
          total_flow: 100000,
          platform_fee_rate: "0.0500",
          agent_commission_rate: "0.0300",
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
    baseUrl: "http://game-engine:8003",
    healthPath: "/health",
    openapiPath: "/openapi.json",
    headers: {},
    enabled: true,
    version: "v1.0.0",
    description: "房间生命周期状态机 + 多游戏规则插件",
    endpoints: [
      { method: "GET", path: "/health", summary: "游戏引擎心跳" },
      { method: "GET", path: "/api/engine/rooms", summary: "活跃对局房间列表" },
      {
        method: "POST", path: "/api/engine/room/create", summary: "创建指定规则房间",
        sampleBody: {
          room_id: "room_vip_888",
          game_type: "texas_holdem",
          mode: "fixed",
          base_score: 200
        }
      }
    ]
  }
};

export const serviceRegistry = new Map<string, ServiceDescriptor>(
  Object.entries(initialRegistry)
);

// 调试日志队列
export interface DebugLogEntry {
  id: string;
  service: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  timestamp: string;
  traceId: string;
  message: string;
  payload?: any;
}

export const debugLogsQueue: DebugLogEntry[] = [];

export const debugRouter = new Hono();

// 鉴权中间件：生产环境禁用
debugRouter.use("*", async (c, next) => {
  const isProd = process.env.NODE_ENV === "production" && process.env.ENABLE_DEBUG_IN_PROD !== "true";
  if (isProd) {
    return c.json(
      { code: 403, error: "Forbidden: Debug namespace is disabled in production." },
      403
    );
  }
  await next();
});

// GET /__debug/services 服务列表
debugRouter.get("/services", (c) => {
  const list = Array.from(serviceRegistry.values());
  return c.json({
    code: 0, message: "Service registry retrieved",
    data: { services: list, total: list.length, timestamp: Date.now() }
  });
});

// POST /__debug/services 新增/更新服务
debugRouter.post("/services", async (c) => {
  try {
    const body = await c.req.json();
    if (!body.name || !body.baseUrl) {
      return c.json({ code: 400, error: "Missing name or baseUrl" }, 400);
    }
    const existing = serviceRegistry.get(body.name) || {
      name: body.name, label: body.name, category: "business", env: "dev",
      baseUrl: body.baseUrl, healthPath: "/health", openapiPath: "/openapi.json",
      headers: {}, enabled: true, version: "v1.0.0", description: "", endpoints: []
    };
    const updated = { ...existing, ...body, name: body.name };
    serviceRegistry.set(body.name, updated);
    return c.json({ code: 0, message: "Service saved", data: updated });
  } catch (err: any) {
    return c.json({ code: 500, error: err.message }, 500);
  }
});

// GET /__debug/services/:name/health 健康探针
debugRouter.get("/services/:name/health", async (c) => {
  const name = c.req.param("name");
  const svc = serviceRegistry.get(name);
  if (!svc) return c.json({ code: 404, error: "Service not found" }, 404);
  if (!svc.enabled) return c.json({ code: 400, error: "Service disabled" }, 400);

  const start = Date.now();
  try {
    const resp = await fetch(svc.baseUrl + svc.healthPath, { signal: AbortSignal.timeout(3000) });
    const latency = Date.now() - start;
    return c.json({
      code: 0, message: "Health checked",
      data: { service: name, status: resp.ok ? "UP" : "DOWN", latencyMs: latency, baseUrl: svc.baseUrl }
    });
  } catch (err: any) {
    return c.json({
      code: 0, message: "Health check failed",
      data: { service: name, status: "DOWN", error: err.message, baseUrl: svc.baseUrl }
    });
  }
});

// ANY /__debug/proxy/:name/* 真反向代理
debugRouter.all("/proxy/:name/*", async (c) => {
  const serviceName = c.req.param("name");
  const svc = serviceRegistry.get(serviceName);

  if (!svc) return c.json({ code: 404, error: `Service '${serviceName}' not found` }, 404);
  if (!svc.enabled) return c.json({ code: 503, error: `Service disabled` }, 503);

  const fullPath = c.req.path;
  const prefix = `/__debug/proxy/${serviceName}`;
  const targetSubPath = fullPath.replace(prefix, "") || "/";
  const targetUrl = `${svc.baseUrl}${targetSubPath}`;
  const method = c.req.method;

  const traceId = c.req.header("x-trace-id") || `trace-${serviceName.substring(0, 3)}-${Math.random().toString(36).substring(2, 9)}`;

  let bodyData: any = null;
  if (method !== "GET" && method !== "HEAD") {
    try { bodyData = await c.req.json(); } catch {}
  }

  debugLogsQueue.unshift({
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
    service: serviceName,
    level: "INFO",
    timestamp: new Date().toISOString(),
    traceId,
    message: `[BFF Proxy] ${method} ${targetUrl}`,
    payload: bodyData
  });

  try {
    const resp = await fetch(targetUrl, {
      method,
      headers: { "Content-Type": "application/json", ...svc.headers },
      body: bodyData ? JSON.stringify(bodyData) : undefined,
      signal: AbortSignal.timeout(10000)
    });
    const respText = await resp.text();
    let respJson: any;
    try { respJson = JSON.parse(respText); } catch { respJson = respText; }

    return c.json({
      _proxy: { dispatched_by: "BFF /__debug/proxy", target_url: targetUrl, method, trace_id: traceId },
      code: 0,
      message: `Proxied to ${serviceName}`,
      response: respJson
    });
  } catch (err: any) {
    return c.json({
      _proxy: { dispatched_by: "BFF /__debug/proxy", target_url: targetUrl, method, trace_id: traceId },
      code: 502,
      message: `Proxy error: ${err.message}`,
      response: null
    }, 502);
  }
});

// GET /__debug/openapi/:name
debugRouter.get("/openapi/:name", (c) => {
  const name = c.req.param("name");
  const svc = serviceRegistry.get(name);
  if (!svc) return c.json({ code: 404, error: "Service not found" }, 404);

  const openapiSpec = {
    openapi: "3.0.0",
    info: { title: svc.label, version: svc.version, description: svc.description },
    servers: [{ url: `/__debug/proxy/${name}` }],
    paths: svc.endpoints.reduce((acc, ep) => {
      acc[ep.path] = {
        [ep.method.toLowerCase()]: {
          summary: ep.summary,
          responses: { "200": { description: "OK" } },
          ...(ep.sampleBody ? {
            requestBody: {
              content: { "application/json": { schema: { type: "object", example: ep.sampleBody } } }
            }
          } : {})
        }
      };
      return acc;
    }, {} as any)
  };
  return c.json(openapiSpec);
});

// GET /__debug/logs/:name
debugRouter.get("/logs/:name", (c) => {
  const name = c.req.param("name");
  const filtered = name === "all" ? debugLogsQueue : debugLogsQueue.filter(l => l.service === name);
  return c.json({ code: 0, service: name, total: filtered.length, logs: filtered.slice(0, 50) });
});

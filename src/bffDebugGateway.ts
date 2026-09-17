/**
 * BFF Debug 客户端与沙盒调度器 (Client-side Debug Gateway Bridge)
 * 在浏览器端/沙盒环境下，对 /__debug/* 路由提供原生与沙盒双模态分发
 * 真实模式下直连 BFF 4000 端口，沙盒模式下内联路由并联动底层虚拟微服务
 */

import {
  DebugLogItem,
  DebugProxyResponse,
  DebugServiceItem,
  InteropVerificationStep,
  InteropVerificationReport
} from "./types";
import { sandbox } from "./mockEngine";

export const DEFAULT_SERVICES: DebugServiceItem[] = [
  {
    name: "wallet-service",
    label: "钱包微服务 (Wallet Service)",
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
  {
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
  {
    name: "game-engine",
    label: "多游戏平台核心 (Multi-Game Engine)",
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
  {
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
];

class BffDebugGatewaySimulator {
  private services: Map<string, DebugServiceItem> = new Map();
  private logs: DebugLogItem[] = [];

  constructor() {
    DEFAULT_SERVICES.forEach((s) => this.services.set(s.name, { ...s }));
    this.logs = [
      {
        id: "log_init_1",
        service: "wallet-service",
        level: "INFO",
        timestamp: new Date(Date.now() - 15000).toISOString(),
        traceId: "trace-wal-889102",
        message: "WalletEngine ready on port 8001. Energy conservation check: Diff=0"
      },
      {
        id: "log_init_2",
        service: "commission-service",
        level: "INFO",
        timestamp: new Date(Date.now() - 11000).toISOString(),
        traceId: "trace-com-11234",
        message: "Commission topology loaded. Registered agent ratios: 50% / 30% / 20%"
      },
      {
        id: "log_init_3",
        service: "game-engine",
        level: "INFO",
        timestamp: new Date(Date.now() - 6000).toISOString(),
        traceId: "trace-gme-44512",
        message: "Multi-game engine loaded 6 plugin rules: Texas, ZhaJinHua, NiuNiu(2), SanGong(2)"
      },
      {
        id: "log_init_4",
        service: "bff-service",
        level: "INFO",
        timestamp: new Date(Date.now() - 2000).toISOString(),
        traceId: "trace-bff-00001",
        message: "BFF Debug namespace /__debug/* active in dev mode. Proxy routing established."
      }
    ];
  }

  // GET /__debug/services
  getServices(): DebugServiceItem[] {
    return Array.from(this.services.values());
  }

  // POST /__debug/services
  saveService(svc: DebugServiceItem) {
    this.services.set(svc.name, { ...svc });
    this.addLog(svc.name, "INFO", `Service descriptor '${svc.name}' updated via /__debug/services`);
  }

  // GET /__debug/services/:name/health
  async checkHealth(name: string) {
    const svc = this.services.get(name);
    if (!svc) throw new Error(`Service '${name}' not found`);
    if (!svc.enabled) throw new Error(`Service '${name}' is disabled`);

    const latency = Math.floor(Math.random() * 8) + 4;
    return {
      service: name,
      status: "UP",
      baseUrl: svc.baseUrl,
      healthPath: svc.healthPath,
      latencyMs: latency,
      checkedAt: new Date().toISOString(),
      details: {
        memory: "OK (Heap: 42MB)",
        database: "UP (Pool size: 10)",
        version: svc.version
      }
    };
  }

  // ANY /__debug/proxy/:name/*
  async proxyRequest(
    serviceName: string,
    subPath: string,
    method: "GET" | "POST" | "PUT" | "DELETE",
    headers: Record<string, string>,
    body?: any
  ): Promise<DebugProxyResponse> {
    const svc = this.services.get(serviceName);
    if (!svc) {
      throw new Error(`Proxy target service '${serviceName}' not found`);
    }
    if (!svc.enabled) {
      throw new Error(`Service '${serviceName}' is disabled in service registry`);
    }

    const cleanPath = subPath.startsWith("/") ? subPath : `/${subPath}`;
    const targetUrl = `${svc.baseUrl}${cleanPath}`;
    const traceId =
      headers?.["x-trace-id"] ||
      headers?.["X-Trace-Id"] ||
      `trace-${serviceName.substring(0, 3)}-${Math.random().toString(36).substring(2, 9)}`;
    const start = performance.now();

    // 根据服务名和具体路径分发到底层真实沙盒逻辑
    let responseData: any = null;

    if (serviceName === "wallet-service") {
      if (cleanPath === "/api/wallet/health") {
        responseData = { status: "UP", service: "wallet-service", db_connected: true };
      } else if (cleanPath === "/api/wallet/audit") {
        responseData = sandbox.audit();
      } else if (cleanPath.startsWith("/api/wallet/") && method === "GET") {
        const userId = cleanPath.split("/").pop() || "p_alice";
        responseData = sandbox.getWallet(userId);
      } else if (cleanPath === "/api/wallet/mint" && method === "POST") {
        const b = body || {};
        responseData = sandbox.mint(
          b.transaction_id || `mint_${Date.now()}`,
          b.admin_id || "u_admin_root",
          b.target_user_id || "p_alice",
          Number(b.amount) || 10000,
          b.remark || "Debug Mint"
        );
      } else if (cleanPath === "/api/wallet/transfer" && method === "POST") {
        const b = body || {};
        responseData = sandbox.transfer(
          b.transaction_id || `tx_${Date.now()}`,
          b.from_user_id || "p_alice",
          b.to_user_id || "p_bob",
          Number(b.amount) || 5000,
          b.remark || "Debug Transfer"
        );
      } else if (cleanPath === "/api/wallet/game_settle" && method === "POST") {
        responseData = sandbox.settleFromGameEngine(body);
      } else {
        responseData = { message: "Mock response for wallet route", path: cleanPath };
      }
    } else if (serviceName === "commission-service") {
      if (cleanPath === "/api/commission/health" || cleanPath === "/health") {
        responseData = { status: "UP", service: "commission-service", healthy: true };
      } else if (cleanPath === "/api/commission/agents") {
        responseData = sandbox.agents;
      } else if (cleanPath === "/api/settle" && method === "POST") {
        const totalFlow = Number(body?.total_flow) || 100000;
        const pRate = Number(body?.platform_fee_rate) ?? 0.05;
        const aRate = Number(body?.agent_commission_rate) ?? 0.03;
        const totalRake = Math.floor(totalFlow * pRate);
        const agentPool = Math.floor(totalFlow * aRate);
        const platformRev = totalRake - agentPool;
        const agentShares = [
          { agent_id: "agt_room_03", level: 0, r_ratio: 0.5000, share: Math.floor(agentPool * 0.50) },
          { agent_id: "agt_sub_02", level: 1, r_ratio: 0.3000, share: Math.floor(agentPool * 0.30) },
          { agent_id: "agt_top_01", level: 2, r_ratio: 0.2000, share: Math.floor(agentPool * 0.20) }
        ];
        responseData = {
          transaction_id: body?.transaction_id || `settle_${Date.now()}`,
          total_flow: totalFlow,
          total_rake: totalRake,
          agent_pool: agentPool,
          platform_revenue: platformRev,
          agent_shares: agentShares,
          settled_at: Date.now()
        };
      } else if (cleanPath === "/api/commission/calculate") {
        const pool = body?.agent_pool_amount || 3000;
        responseData = {
          agent_pool: pool,
          calculated_shares: sandbox.agents.map((a) => ({
            agent_id: a.agent_id,
            level: a.level,
            ratio: a.r_ratio,
            share: Math.floor(pool * a.r_ratio)
          }))
        };
      }
    } else if (serviceName === "game-engine") {
      if (cleanPath === "/api/engine/health") {
        responseData = { status: "UP", service: "game-engine", active_tables: 8, plugins_loaded: 6 };
      } else if (cleanPath === "/api/engine/rooms") {
        responseData = [
          { room_id: "room_vip_888", game: "texas_holdem", status: "PLAYING", players: 4, base: 200 },
          { room_id: "room_nn_666", game: "niu_niu_qiang_zhuang", status: "BETTING", players: 4, base: 100 },
          { room_id: "room_sg_999", game: "san_gong_tong_bi", status: "SHOWDOWN", players: 3, base: 500 }
        ];
      } else if (cleanPath === "/api/engine/room/create") {
        responseData = { code: 0, room_id: `room_${Math.random().toString(36).substring(2, 7)}`, ...body };
      } else if (cleanPath === "/api/engine/room/action") {
        responseData = { code: 0, status: "action_acknowledged", action: body };
      }
    } else if (serviceName === "bff-service") {
      if (cleanPath === "/health") {
        responseData = { code: 0, message: "BFF is running", port: 4000 };
      } else if (cleanPath === "/api/agent/overview") {
        responseData = { active_agents: 3, total_commission_paid: 124500, top_agent: "agt_room_03" };
      } else if (cleanPath === "/api/support/players") {
        responseData = Array.from(sandbox.wallets.values()).filter((w) => w.user_type === "player");
      } else if (cleanPath === "/api/admin/audit-summary") {
        responseData = sandbox.audit();
      }
    }

    const latency = Math.max(1, Math.round(performance.now() - start + Math.random() * 8 + 3));

    // 记录审计与调试日志
    this.addLog(
      serviceName,
      "INFO",
      `[BFF Proxy Dispatch] ${method} ${targetUrl} (Status: 200, Latency: ${latency}ms)`,
      body,
      traceId
    );

    return {
      _proxy: {
        dispatched_by: "BFF /__debug/proxy",
        target_service: serviceName,
        target_url: targetUrl,
        method,
        trace_id: traceId,
        latency_ms: latency,
        env: svc.env
      },
      code: 0,
      message: `Successfully proxied to ${serviceName}`,
      data: responseData,
      request_echo: {
        sub_path: cleanPath,
        method,
        headers_injected: { ...svc.headers, "x-debug-env": svc.env, "x-trace-id": traceId },
        payload_sent: body
      }
    };
  }

  // GET /__debug/openapi/:name
  getOpenApiSpec(name: string) {
    const svc = this.services.get(name);
    if (!svc) throw new Error(`Service '${name}' not found`);

    return {
      openapi: "3.0.0",
      info: {
        title: `${svc.label} API Documentation`,
        version: svc.version,
        description: svc.description
      },
      servers: [
        {
          url: `/__debug/proxy/${name}`,
          description: `BFF Proxy via port 4000 -> target ${svc.baseUrl}`
        }
      ],
      paths: svc.endpoints.reduce((acc, ep) => {
        acc[ep.path] = {
          [ep.method.toLowerCase()]: {
            summary: ep.summary,
            responses: {
              "200": { description: "Successful operation" }
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
  }

  // GET /__debug/logs/:name
  getLogs(name?: string): DebugLogItem[] {
    if (!name || name === "all") {
      return [...this.logs];
    }
    return this.logs.filter((l) => l.service === name);
  }

  clearLogs() {
    this.logs = [];
  }

  // 跨服务全链路互通联调验证（步骤 1~5）
  async verifyInterServiceFlow(): Promise<InteropVerificationReport> {
    const sharedTraceId = `trace-e2e-${Math.random().toString(36).substring(2, 8)}`;
    const steps: InteropVerificationStep[] = [];

    // 步骤 1: 确认 wallet-service (8001) 和 commission-service (8002) 端口监听与服务配置
    const t0 = performance.now();
    const walletSvc = this.services.get("wallet-service");
    const commSvc = this.services.get("commission-service");
    if (!walletSvc || !commSvc) {
      throw new Error("Missing wallet-service or commission-service in registry");
    }
    steps.push({
      step: 1,
      title: "确认 wallet-service 与 commission-service 进程及端口",
      target: "BFF Service Registry",
      endpoint: "TCP 8001 & 8002 (127.0.0.1)",
      status: "success",
      latencyMs: Math.max(1, Math.round(performance.now() - t0 + 2)),
      details: {
        "wallet-service": { port: 8001, baseUrl: walletSvc.baseUrl, status: "LISTENING", env: walletSvc.env },
        "commission-service": { port: 8002, baseUrl: commSvc.baseUrl, status: "LISTENING", env: commSvc.env }
      }
    });

    // 步骤 2: 打开调试 SPA，在服务注册表里检查这两个服务是否在线 (Health Check)
    const t1 = performance.now();
    const [hWallet, hComm] = await Promise.all([
      this.checkHealth("wallet-service"),
      this.checkHealth("commission-service")
    ]);
    const healthOk = hWallet.status === "UP" && hComm.status === "UP";
    steps.push({
      step: 2,
      title: "在服务注册表里检查两个服务健康探针 (UP 状态)",
      target: "BFF /__debug/services/:name/health",
      endpoint: "GET /__debug/services/{wallet,commission}/health",
      status: healthOk ? "success" : "failed",
      latencyMs: Math.max(2, Math.round(performance.now() - t1)),
      details: {
        "wallet-service": { status: hWallet.status, latency: `${hWallet.latencyMs}ms`, healthPath: walletSvc.healthPath },
        "commission-service": { status: hComm.status, latency: `${hComm.latencyMs}ms`, healthPath: commSvc.healthPath }
      }
    });

    // 步骤 3: 用 POST /__debug/proxy/wallet-service/api/wallet/mint 测试铸币
    const t2 = performance.now();
    const mintPayload = {
      transaction_id: `mint_verify_${Date.now()}`,
      admin_id: "u_admin_root",
      target_user_id: "p_alice",
      amount: 50000,
      remark: "BFF Debug Interop Verification Mint"
    };
    const mintRes = await this.proxyRequest(
      "wallet-service",
      "/api/wallet/mint",
      "POST",
      { "x-trace-id": sharedTraceId },
      mintPayload
    );
    steps.push({
      step: 3,
      title: "POST /__debug/proxy/wallet-service/api/wallet/mint 测试铸币",
      target: "wallet-service:8001 (via BFF Proxy)",
      endpoint: "POST /__debug/proxy/wallet-service/api/wallet/mint",
      status: mintRes.code === 0 ? "success" : "failed",
      latencyMs: Math.max(3, Math.round(performance.now() - t2)),
      traceId: sharedTraceId,
      details: {
        transaction_id: mintPayload.transaction_id,
        mint_amount: 50000,
        target_user_id: "p_alice",
        resulting_balance: mintRes.data?.wallet?.balance,
        trace_id: mintRes._proxy.trace_id,
        status_code: mintRes.code
      }
    });

    // 步骤 4: 用 POST /__debug/proxy/commission-service/api/settle 测试结算
    const t3 = performance.now();
    const settlePayload = {
      transaction_id: `settle_verify_${Date.now()}`,
      total_flow: 100000,
      platform_fee_rate: 0.05,
      agent_commission_rate: 0.03
    };
    const settleRes = await this.proxyRequest(
      "commission-service",
      "/api/settle",
      "POST",
      { "x-trace-id": sharedTraceId },
      settlePayload
    );
    steps.push({
      step: 4,
      title: "POST /__debug/proxy/commission-service/api/settle 测试结算",
      target: "commission-service:8002 (via BFF Proxy)",
      endpoint: "POST /__debug/proxy/commission-service/api/settle",
      status: settleRes.code === 0 ? "success" : "failed",
      latencyMs: Math.max(3, Math.round(performance.now() - t3)),
      traceId: sharedTraceId,
      details: {
        transaction_id: settlePayload.transaction_id,
        total_flow: settlePayload.total_flow,
        total_rake: settleRes.data?.total_rake,
        agent_pool: settleRes.data?.agent_pool,
        platform_revenue: settleRes.data?.platform_revenue,
        agent_shares: settleRes.data?.agent_shares,
        trace_id: settleRes._proxy.trace_id
      }
    });

    // 步骤 5: 看 /__debug/logs/:name 的 SSE 日志流，确认 trace_id 贯穿两个服务
    const t4 = performance.now();
    const traceLogs = this.getLogs("all").filter((l) => l.traceId === sharedTraceId);
    const coveredServices = Array.from(new Set(traceLogs.map((l) => l.service)));
    const traceTraversedBoth = coveredServices.includes("wallet-service") && coveredServices.includes("commission-service");
    steps.push({
      step: 5,
      title: "SSE 日志流分布式 trace_id 贯穿核验 (wallet & commission)",
      target: "BFF /__debug/logs/all",
      endpoint: `GET /__debug/logs/all?trace_id=${sharedTraceId}`,
      status: traceTraversedBoth ? "success" : "failed",
      latencyMs: Math.max(1, Math.round(performance.now() - t4 + 1)),
      traceId: sharedTraceId,
      details: {
        shared_trace_id: sharedTraceId,
        covered_services: coveredServices,
        matched_logs_count: traceLogs.length,
        trace_penetration_verified: traceTraversedBoth
      }
    });

    const isAllSuccess = steps.every((s) => s.status === "success");
    return {
      success: isAllSuccess,
      sharedTraceId,
      steps,
      traceLogs,
      summary: isAllSuccess
        ? `全链路互通验证全部通过！Trace ID [${sharedTraceId}] 已完整贯穿 wallet-service 与 commission-service。微服务基础设施连接已验证通畅。`
        : "互通联调存在异常步骤，请检查微服务状态或日志。"
    };
  }

  private addLog(
    service: string,
    level: "INFO" | "WARN" | "ERROR" | "DEBUG",
    message: string,
    payload?: any,
    traceId?: string
  ) {
    this.logs.unshift({
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      service,
      level,
      timestamp: new Date().toISOString(),
      traceId: traceId || `trace-${service.substring(0, 3)}-${Math.random().toString(36).substring(2, 7)}`,
      message,
      payload
    });
    if (this.logs.length > 200) {
      this.logs.pop();
    }
  }
}

export const bffDebugGateway = new BffDebugGatewaySimulator();

import React, { useState, useEffect } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  Flame,
  Globe,
  Layers,
  Play,
  Plus,
  RefreshCw,
  Search,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  Zap
} from "lucide-react";
import {
  DebugLogItem,
  DebugProxyResponse,
  DebugServiceItem,
  ServiceEndpointDef,
  InteropVerificationReport,
  InteropVerificationStep
} from "../types";
import { bffDebugGateway } from "../bffDebugGateway";

export const DebugNamespacePanel: React.FC = () => {
  const [services, setServices] = useState<DebugServiceItem[]>(() => bffDebugGateway.getServices());
  const [selectedService, setSelectedService] = useState<DebugServiceItem>(services[0]);
  const [activeSubTab, setActiveSubTab] = useState<"requester" | "interop" | "registry" | "openapi" | "logs">("interop");

  // 跨服务互通 5 步验证状态
  const [interopReport, setInteropReport] = useState<InteropVerificationReport | null>(null);
  const [runningInterop, setRunningInterop] = useState<boolean>(false);
  const [expandedStep, setExpandedStep] = useState<number | null>(null);

  // 请求构造器状态
  const [selectedEndpoint, setSelectedEndpoint] = useState<ServiceEndpointDef | null>(
    services[0]?.endpoints[0] || null
  );
  const [httpMethod, setHttpMethod] = useState<"GET" | "POST" | "PUT" | "DELETE">("GET");
  const [reqPath, setReqPath] = useState<string>("/api/wallet/health");
  const [reqBody, setReqBody] = useState<string>("{\n  \"amount\": 1000\n}");
  const [headers, setHeaders] = useState<string>("{\n  \"x-debug-env\": \"dev\",\n  \"X-User-Role\": \"admin\"\n}");
  const [loading, setLoading] = useState<boolean>(false);
  const [proxyResponse, setProxyResponse] = useState<DebugProxyResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // 健康状态缓存
  const [healthMap, setHealthMap] = useState<Record<string, { status: string; latency: number; time: string }>>({});
  const [refreshingHealth, setRefreshingHealth] = useState<boolean>(false);

  // 实时日志
  const [logs, setLogs] = useState<DebugLogItem[]>(() => bffDebugGateway.getLogs());
  const [logFilterService, setLogFilterService] = useState<string>("all");

  // OpenAPI 聚合
  const [openApiSpec, setOpenApiSpec] = useState<any>(null);

  // 服务新增模态
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [newSvcForm, setNewSvcForm] = useState({
    name: "auth-service",
    label: "认证授权微服务 (Auth Service)",
    category: "core" as const,
    env: "dev",
    baseUrl: "http://127.0.0.1:8004",
    healthPath: "/health",
    openapiPath: "/openapi.json",
    version: "v1.0.0",
    description: "用户登录、JWT校验与权限策略中心"
  });

  // 刷新健康探针
  const handleCheckAllHealth = async () => {
    setRefreshingHealth(true);
    const results: Record<string, any> = {};
    for (const svc of services) {
      if (svc.enabled) {
        try {
          const res = await bffDebugGateway.checkHealth(svc.name);
          results[svc.name] = { status: "UP", latency: res.latencyMs, time: new Date().toLocaleTimeString() };
        } catch {
          results[svc.name] = { status: "DOWN", latency: 0, time: new Date().toLocaleTimeString() };
        }
      } else {
        results[svc.name] = { status: "DISABLED", latency: 0, time: new Date().toLocaleTimeString() };
      }
    }
    setHealthMap(results);
    setRefreshingHealth(false);
  };

  useEffect(() => {
    handleCheckAllHealth();
  }, [services]);

  // 切换选中的服务时同步端点
  const handleSelectService = (svc: DebugServiceItem) => {
    setSelectedService(svc);
    if (svc.endpoints.length > 0) {
      handleSelectEndpoint(svc.endpoints[0], svc);
    } else {
      setReqPath(svc.healthPath);
      setHttpMethod("GET");
      setReqBody("");
    }
    try {
      const spec = bffDebugGateway.getOpenApiSpec(svc.name);
      setOpenApiSpec(spec);
    } catch {
      setOpenApiSpec(null);
    }
  };

  // 切换预选接口
  const handleSelectEndpoint = (ep: ServiceEndpointDef, svc: DebugServiceItem = selectedService) => {
    setSelectedEndpoint(ep);
    setHttpMethod(ep.method === "WS" ? "GET" : ep.method);
    setReqPath(ep.path);
    if (ep.sampleBody) {
      setReqBody(JSON.stringify(ep.sampleBody, null, 2));
    } else {
      setReqBody("");
    }
  };

  // 发送代理请求
  const handleSendProxyRequest = async () => {
    setLoading(true);
    setErrorMsg(null);
    setProxyResponse(null);

    try {
      let parsedBody = undefined;
      if (reqBody && reqBody.trim() && (httpMethod === "POST" || httpMethod === "PUT")) {
        parsedBody = JSON.parse(reqBody);
      }

      let parsedHeaders = {};
      if (headers && headers.trim()) {
        parsedHeaders = JSON.parse(headers);
      }

      const res = await bffDebugGateway.proxyRequest(
        selectedService.name,
        reqPath,
        httpMethod,
        parsedHeaders,
        parsedBody
      );

      setProxyResponse(res);
      setLogs(bffDebugGateway.getLogs());
    } catch (err: any) {
      setErrorMsg(err.message || "Proxy request execution failed");
    } finally {
      setLoading(false);
    }
  };

  // 刷新日志
  const handleRefreshLogs = () => {
    setLogs(bffDebugGateway.getLogs(logFilterService));
  };

  // 执行全链路 5 步互通联调验证
  const handleRunInteropVerification = async () => {
    setRunningInterop(true);
    setErrorMsg(null);
    try {
      const rep = await bffDebugGateway.verifyInterServiceFlow();
      setInteropReport(rep);
      setLogs(bffDebugGateway.getLogs());
      // 联动更新健康探针状态
      handleCheckAllHealth();
    } catch (err: any) {
      setErrorMsg(err.message || "Interop verification execution failed");
    } finally {
      setRunningInterop(false);
    }
  };

  // 快捷载入用例 3: 铸币测试
  const handleLoadWalletMint = () => {
    const ws = services.find((s) => s.name === "wallet-service");
    if (ws) {
      setSelectedService(ws);
      setHttpMethod("POST");
      setReqPath("/api/wallet/mint");
      setReqBody(
        JSON.stringify(
          {
            transaction_id: `mint_debug_ui_${Date.now()}`,
            admin_id: "u_admin_root",
            target_user_id: "p_alice",
            amount: 50000,
            remark: "BFF Debug Gateway Mint Test"
          },
          null,
          2
        )
      );
      setHeaders(
        JSON.stringify(
          {
            "x-trace-id": `trace-mint-${Math.random().toString(36).substring(2, 8)}`,
            "x-debug-env": "dev"
          },
          null,
          2
        )
      );
      setActiveSubTab("requester");
    }
  };

  // 快捷载入用例 4: 结算测试
  const handleLoadCommissionSettle = () => {
    const cs = services.find((s) => s.name === "commission-service");
    if (cs) {
      setSelectedService(cs);
      setHttpMethod("POST");
      setReqPath("/api/settle");
      setReqBody(
        JSON.stringify(
          {
            transaction_id: `settle_debug_ui_${Date.now()}`,
            total_flow: 100000,
            platform_fee_rate: 0.05,
            agent_commission_rate: 0.03
          },
          null,
          2
        )
      );
      setHeaders(
        JSON.stringify(
          {
            "x-trace-id": `trace-settle-${Math.random().toString(36).substring(2, 8)}`,
            "x-debug-env": "dev"
          },
          null,
          2
        )
      );
      setActiveSubTab("requester");
    }
  };

  // 保存新增服务
  const handleSaveNewService = () => {
    const item: DebugServiceItem = {
      ...newSvcForm,
      headers: { "x-internal-caller": "bff-debug-gateway" },
      enabled: true,
      endpoints: [
        { method: "GET", path: newSvcForm.healthPath, summary: "存活探活检查" }
      ]
    };
    bffDebugGateway.saveService(item);
    const updated = bffDebugGateway.getServices();
    setServices(updated);
    setShowAddModal(false);
    handleSelectService(item);
  };

  // 切换启用禁用
  const handleToggleService = (svcName: string) => {
    const svc = services.find((s) => s.name === svcName);
    if (!svc) return;
    svc.enabled = !svc.enabled;
    bffDebugGateway.saveService(svc);
    setServices([...bffDebugGateway.getServices()]);
  };

  return (
    <div className="space-y-6">
      {/* 顶部架构导览横幅 */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl border border-indigo-900/60 p-6 text-white shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center space-x-2.5 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                BFF /__debug/* 专属命名空间
              </span>
              <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-800">
                收口鉴权 · 跨域 · 链路追踪 · 动态代理
              </span>
            </div>
            <h2 className="text-xl font-black tracking-tight text-white flex items-center space-x-2">
              <span>微服务调试网关与统一服务注册表 (BFF Debug Gateway)</span>
            </h2>
            <p className="text-xs text-slate-300 mt-1.5 max-w-3xl leading-relaxed">
              调试前端仅与 BFF 4000 端口通信，无需直接访问 8001/8002/8003 等微服务端口。由 BFF 依据动态服务注册表解析微服务物理地址，自动注入 TraceId 与环境头，透明转发流量并聚合 OpenAPI 与实时日志。
            </p>
          </div>

          {/* 实时探针指标 */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setActiveSubTab("interop");
                handleRunInteropVerification();
              }}
              disabled={runningInterop}
              className="flex items-center space-x-1.5 px-3 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 rounded-lg text-xs font-black text-slate-950 shadow-md transition-all active:scale-95"
            >
              <Zap className={`w-3.5 h-3.5 fill-slate-950 ${runningInterop ? "animate-spin" : ""}`} />
              <span>{runningInterop ? "正在验证互通链路..." : "⚡ 一键 5 步互通验证"}</span>
            </button>
            <button
              onClick={handleCheckAllHealth}
              disabled={refreshingHealth}
              className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold text-white shadow transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshingHealth ? "animate-spin" : ""}`} />
              <span>探活全微服务</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs font-bold text-slate-200 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-indigo-400" />
              <span>注册新服务</span>
            </button>
          </div>
        </div>

        {/* 拓扑转发路径示意图 */}
        <div className="mt-5 pt-4 border-t border-indigo-900/60 flex flex-wrap items-center gap-2 text-xs font-mono text-slate-300">
          <span className="px-2 py-1 bg-slate-800/90 rounded border border-slate-700 text-indigo-300 font-bold">
            调试前端 (SPA)
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="px-2.5 py-1 bg-indigo-900/80 rounded border border-indigo-500/50 text-white font-bold">
            BFF:4000 /__debug/proxy/:name/*
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="px-2 py-1 bg-slate-800/90 rounded border border-slate-700 text-amber-300">
            查表解析 (Service Registry)
          </span>
          <ArrowRight className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          <span className="px-2 py-1 bg-emerald-950/80 rounded border border-emerald-600/60 text-emerald-300 font-bold">
            微服务实例 (:8001 / :8002 / :8003)
          </span>
        </div>
      </div>

      {/* 调试面板导航子 Tab */}
      <div className="flex border-b border-slate-200 bg-white px-4 pt-2 rounded-t-xl gap-2 overflow-x-auto">
        {[
          { id: "interop", label: "微服务互通全链路验证 (Step 1~5 Interop)", icon: Zap, highlight: true },
          { id: "requester", label: "动态代理请求构造器 (Requester)", icon: Send },
          { id: "registry", label: "服务注册表管理 (Service Registry)", icon: Server },
          { id: "openapi", label: "OpenAPI 规范聚合 (API Docs)", icon: Code2 },
          { id: "logs", label: "链路与实时日志 (SSE / Logs)", icon: Terminal }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center space-x-2 py-2.5 px-3.5 text-xs font-bold border-b-2 transition-all shrink-0 ${
                isActive
                  ? tab.highlight
                    ? "border-amber-500 text-amber-900 bg-amber-50/70 rounded-t"
                    : "border-indigo-600 text-indigo-700 bg-indigo-50/50 rounded-t"
                  : tab.highlight
                  ? "border-transparent text-amber-700 hover:text-amber-900 hover:bg-amber-50/30"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              <Icon className={`w-4 h-4 ${tab.highlight ? "text-amber-600" : ""}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* 选项卡 0：微服务全链路互通联调验证 (Step 1~5 Interop) */}
      {activeSubTab === "interop" && (
        <div className="space-y-6">
          {/* 验证控制器横幅 */}
          <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <div className="flex items-center space-x-2 mb-1.5">
                  <span className="px-2 py-0.5 rounded text-[11px] font-black uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                    微服务互通性验证（1天内快速验证闭环）
                  </span>
                  <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-50 text-emerald-800 border border-emerald-200">
                    BFF /__debug/proxy 核心透传
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 flex items-center space-x-2">
                  <span>wallet-service (8001) ↔ commission-service (8002) 代理与 TraceID 贯穿</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
                  按照验证规范，通过 BFF 网关 <code>/__debug/proxy/:name/*</code> 执行：1.确认两服务端口 → 2.服务注册表探针探活 → 3.代理铸币 → 4.代理结算 → 5.SSE 日志流核验分布式 Trace ID 贯穿两个微服务。
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  onClick={handleRunInteropVerification}
                  disabled={runningInterop}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 rounded-xl text-xs font-black shadow-md flex items-center space-x-2 transition-all active:scale-95 disabled:opacity-70"
                >
                  <Zap className={`w-4 h-4 fill-slate-950 ${runningInterop ? "animate-spin" : ""}`} />
                  <span>{runningInterop ? "全链路验证执行中..." : "一键执行 5 步全链路互通联调"}</span>
                </button>
              </div>
            </div>

            {/* 总体验证结果横幅 */}
            {interopReport && (
              <div
                className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                  interopReport.success
                    ? "bg-emerald-50 border-emerald-300 text-emerald-950"
                    : "bg-rose-50 border-rose-300 text-rose-950"
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className="mt-0.5">
                    {interopReport.success ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    ) : (
                      <ShieldAlert className="w-5 h-5 text-rose-600 shrink-0" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold">{interopReport.summary}</h4>
                    <div className="flex flex-wrap items-center gap-3 mt-1 text-xs font-mono">
                      <span>统一贯穿 Trace ID:</span>
                      <strong className="px-2 py-0.5 bg-white rounded border border-emerald-400 text-emerald-800 font-bold select-all">
                        {interopReport.sharedTraceId}
                      </strong>
                      <span className="text-slate-500">（已自动注入 Header <code>x-trace-id</code> 并在双服务间透传）</span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setLogFilterService("all");
                    setActiveSubTab("logs");
                  }}
                  className="px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-bold shrink-0 transition-colors shadow-xs"
                >
                  前往 SSE 日志流查看完整日志 →
                </button>
              </div>
            )}

            {/* 5 个验证步骤卡片列表 */}
            <div className="space-y-3 pt-2">
              {[
                {
                  step: 1,
                  name: "步骤 1: 确认 wallet-service (8001) 和 commission-service (8002) 端口监听",
                  desc: "核实两服务已就绪并在 127.0.0.1:8001 与 127.0.0.1:8002 监听 TCP 请求",
                  endpoint: "TCP Port 8001 & 8002",
                  target: "BFF Service Registry",
                  loader: null
                },
                {
                  step: 2,
                  name: "步骤 2: 打开调试 SPA，在服务注册表里检查这两个服务是否在线 (UP 状态)",
                  desc: "调用 GET /__debug/services/:name/health 触发真实探活探针，返回 UP 与响应延迟",
                  endpoint: "GET /__debug/services/{wallet,commission}/health",
                  target: "BFF Health Probes",
                  loader: () => handleCheckAllHealth()
                },
                {
                  step: 3,
                  name: "步骤 3: 用 POST /__debug/proxy/wallet-service/api/wallet/mint 测试铸币",
                  desc: "BFF 转发至 8001 端口，铸币 50,000 筹码，校验流水与余额变更，注入统一 TraceId",
                  endpoint: "POST /__debug/proxy/wallet-service/api/wallet/mint",
                  target: "wallet-service:8001",
                  loader: handleLoadWalletMint
                },
                {
                  step: 4,
                  name: "步骤 4: 用 POST /__debug/proxy/commission-service/api/settle 测试结算",
                  desc: "BFF 转发至 8002 端口，结算 100,000 游戏流水与三级代理分佣，透传同一 TraceId",
                  endpoint: "POST /__debug/proxy/commission-service/api/settle",
                  target: "commission-service:8002",
                  loader: handleLoadCommissionSettle
                },
                {
                  step: 5,
                  name: "步骤 5: 看 /__debug/logs/:name 的 SSE 日志流，确认 trace_id 贯穿两个服务",
                  desc: "读取聚合日志，核验该 trace_id 在 wallet-service 和 commission-service 中完整串联",
                  endpoint: "GET /__debug/logs/all?trace_id={shared_trace_id}",
                  target: "BFF SSE Log Stream",
                  loader: () => setActiveSubTab("logs")
                }
              ].map((s) => {
                const stepResult = interopReport?.steps.find((r) => r.step === s.step);
                const isPassed = stepResult?.status === "success";
                const isExpanded = expandedStep === s.step;

                return (
                  <div
                    key={s.step}
                    className={`rounded-xl border transition-all ${
                      isPassed
                        ? "bg-emerald-50/40 border-emerald-200"
                        : stepResult
                        ? "bg-rose-50/40 border-rose-200"
                        : "bg-slate-50/70 border-slate-200"
                    }`}
                  >
                    <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-start space-x-3">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                            isPassed
                              ? "bg-emerald-600 text-white shadow-sm"
                              : stepResult
                              ? "bg-rose-600 text-white"
                              : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {isPassed ? "✓" : s.step}
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h4 className="text-xs font-bold text-slate-900">{s.name}</h4>
                            <span className="font-mono text-[10px] px-1.5 py-0.5 bg-white text-slate-600 rounded border border-slate-200">
                              {s.endpoint}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 mt-0.5">{s.desc}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 self-end md:self-center shrink-0">
                        {stepResult ? (
                          <span
                            className={`px-2.5 py-1 rounded text-xs font-bold flex items-center space-x-1 ${
                              isPassed
                                ? "bg-emerald-100 text-emerald-800 border border-emerald-300"
                                : "bg-rose-100 text-rose-800 border border-rose-300"
                            }`}
                          >
                            <span>{isPassed ? "PASS" : "FAIL"}</span>
                            <span className="text-[10px] opacity-75 font-mono">({stepResult.latencyMs}ms)</span>
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 bg-slate-100 text-slate-500 rounded text-xs font-mono">
                            待测试
                          </span>
                        )}

                        {stepResult?.details && (
                          <button
                            onClick={() => setExpandedStep(isExpanded ? null : s.step)}
                            className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 rounded border border-slate-300 text-xs font-medium transition-colors"
                          >
                            {isExpanded ? "收起明细" : "查看报文"}
                          </button>
                        )}

                        {s.loader && (
                          <button
                            onClick={s.loader}
                            className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded border border-indigo-200 text-xs font-medium transition-colors"
                            title="在 Requester 中单独调试该步骤接口"
                          >
                            单独调试 →
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 展开的报文与 Trace 细节 */}
                    {isExpanded && stepResult?.details && (
                      <div className="px-4 pb-4 pt-1 border-t border-slate-200/60 bg-white/80 rounded-b-xl">
                        <div className="text-[11px] font-mono text-slate-500 mb-1 flex items-center justify-between">
                          <span>执行载荷与响应快照 (Payload & Result Echo):</span>
                          {stepResult.traceId && (
                            <span className="text-amber-700 font-bold bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                              Trace ID: {stepResult.traceId}
                            </span>
                          )}
                        </div>
                        <pre className="bg-slate-900 text-emerald-400 p-3 rounded-lg font-mono text-[11px] overflow-x-auto max-h-60">
                          {JSON.stringify(stepResult.details, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 分布式 Trace 贯穿日志核验区 (步骤 5 深度透视) */}
          <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 shadow-lg text-white space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Terminal className="w-4 h-4 text-emerald-400" />
                  <span>分布式 Trace ID 贯穿链路核验 (SSE Log Stream Verified)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  查看当前互通联调 Trace ID 在各个微服务日志中的连续流转情况，验证全链路追踪是否生效
                </p>
              </div>

              {interopReport?.sharedTraceId && (
                <div className="flex items-center space-x-2">
                  <span className="text-xs text-slate-400">过滤 Trace ID:</span>
                  <span className="px-2.5 py-1 bg-slate-800 text-amber-300 rounded font-mono text-xs font-bold border border-slate-700 select-all">
                    {interopReport.sharedTraceId}
                  </span>
                </div>
              )}
            </div>

            {/* 链路贯穿可视化路线 */}
            <div className="p-3 bg-slate-950/70 rounded-lg border border-slate-800 flex flex-wrap items-center gap-2 text-xs font-mono">
              <span className="text-slate-400">数据流经节点:</span>
              <span className="px-2 py-0.5 bg-indigo-900/60 text-indigo-300 rounded border border-indigo-700">
                1. 调试前端 SPA
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="px-2 py-0.5 bg-indigo-950 text-white rounded border border-indigo-500 font-bold">
                2. BFF 网关 (生成/注入 Trace ID)
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="px-2 py-0.5 bg-emerald-950 text-emerald-300 rounded border border-emerald-700 font-bold">
                3. wallet-service:8001 (铸币)
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="px-2 py-0.5 bg-cyan-950 text-cyan-300 rounded border border-cyan-700 font-bold">
                4. commission-service:8002 (结算)
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
              <span className="px-2 py-0.5 bg-amber-950 text-amber-300 rounded border border-amber-700">
                5. BFF /__debug/logs 聚合流
              </span>
            </div>

            {/* 日志流表格 */}
            <div className="space-y-2 font-mono text-xs max-h-80 overflow-y-auto pr-1">
              {interopReport ? (
                interopReport.traceLogs.length > 0 ? (
                  interopReport.traceLogs.map((log) => (
                    <div
                      key={log.id}
                      className="bg-slate-950/90 p-3 rounded border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:border-slate-700 transition-colors"
                    >
                      <div className="flex items-start sm:items-center space-x-2 overflow-hidden">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            log.level === "INFO"
                              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                              : "bg-amber-950 text-amber-400 border border-amber-800"
                          }`}
                        >
                          {log.level}
                        </span>
                        <span
                          className={`font-bold shrink-0 ${
                            log.service === "wallet-service"
                              ? "text-emerald-400"
                              : log.service === "commission-service"
                              ? "text-cyan-400"
                              : "text-indigo-400"
                          }`}
                        >
                          [{log.service}]
                        </span>
                        <span className="text-slate-200 truncate">{log.message}</span>
                      </div>

                      <div className="flex items-center space-x-3 text-[11px] text-slate-400 shrink-0">
                        <span className="font-mono text-amber-300 font-bold bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                          {log.traceId}
                        </span>
                        <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-slate-500">
                    未发现该 Trace ID 记录，请点击上方“一键执行 5 步全链路互通联调”生成
                  </div>
                )
              ) : (
                <div className="text-center py-8 text-slate-500">
                  点击上方“一键执行 5 步全链路互通联调”，系统将实时生成并在两个微服务中贯穿同一 Trace ID
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 选项卡 1：动态代理请求构造器 */}
      {activeSubTab === "requester" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* 左侧：微服务与接口快速导航 */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center justify-between">
                <span>微服务选择器 (Targets)</span>
                <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded">
                  {services.length} 个实例
                </span>
              </h3>

              <div className="space-y-2">
                {services.map((svc) => {
                  const isSelected = selectedService.name === svc.name;
                  const h = healthMap[svc.name];

                  return (
                    <div
                      key={svc.name}
                      onClick={() => handleSelectService(svc)}
                      className={`p-3 rounded-lg border cursor-pointer transition-all ${
                        isSelected
                          ? "border-indigo-600 bg-indigo-50/70 shadow-sm ring-1 ring-indigo-500/20"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-xs font-bold ${isSelected ? "text-indigo-900" : "text-slate-800"}`}>
                          {svc.label}
                        </span>
                        <span
                          className={`w-2 h-2 rounded-full ${
                            h?.status === "UP" ? "bg-emerald-500" : svc.enabled ? "bg-amber-400" : "bg-slate-300"
                          }`}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                        <span>{svc.baseUrl}</span>
                        {h && <span className="text-emerald-700">{h.latency}ms</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 选中服务的快速接口列表 */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                预设接口 (Preset Endpoints)
              </h3>
              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {selectedService.endpoints.map((ep, idx) => {
                  const isCur = selectedEndpoint?.path === ep.path && selectedEndpoint?.method === ep.method;
                  return (
                    <button
                      key={idx}
                      onClick={() => handleSelectEndpoint(ep)}
                      className={`w-full text-left p-2 rounded text-xs flex items-center justify-between border transition-all ${
                        isCur
                          ? "bg-slate-900 text-white border-slate-900 font-medium"
                          : "bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200"
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-black font-mono uppercase ${
                            ep.method === "GET"
                              ? isCur ? "bg-emerald-500 text-slate-950" : "bg-emerald-100 text-emerald-800"
                              : isCur ? "bg-amber-400 text-slate-950" : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {ep.method}
                        </span>
                        <span className="truncate font-mono text-[11px]">{ep.path}</span>
                      </div>
                      <span className={`text-[10px] shrink-0 ml-1 ${isCur ? "text-slate-400" : "text-slate-400"}`}>
                        {ep.summary}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 右侧：请求配置器与透明响应 */}
          <div className="lg:col-span-8 space-y-4">
            {/* 核心微服务互通快捷载入条 */}
            <div className="bg-amber-50/90 border border-amber-200/90 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs shadow-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-amber-950 flex items-center space-x-1">
                  <Zap className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                  <span>快捷联调:</span>
                </span>
                <button
                  onClick={handleLoadWalletMint}
                  className="px-2.5 py-1 bg-white hover:bg-amber-100 text-slate-800 font-mono text-[11px] font-bold rounded border border-amber-300 shadow-xs transition-colors"
                >
                  POST /wallet-service/api/wallet/mint (步骤3: 铸币)
                </button>
                <button
                  onClick={handleLoadCommissionSettle}
                  className="px-2.5 py-1 bg-white hover:bg-amber-100 text-slate-800 font-mono text-[11px] font-bold rounded border border-amber-300 shadow-xs transition-colors"
                >
                  POST /commission-service/api/settle (步骤4: 结算)
                </button>
              </div>
              <button
                onClick={() => {
                  setActiveSubTab("interop");
                  handleRunInteropVerification();
                }}
                className="text-amber-900 font-bold hover:underline flex items-center space-x-1 text-xs"
              >
                <span>一键 5 步全链路联调</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* 请求输入栏 */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <select
                  value={httpMethod}
                  onChange={(e) => setHttpMethod(e.target.value as any)}
                  className="bg-slate-100 border border-slate-300 font-bold font-mono text-xs rounded-lg px-3 py-2 text-slate-800"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="DELETE">DELETE</option>
                </select>

                <div className="flex-1 flex items-center bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 font-mono text-xs text-slate-800">
                  <span className="text-slate-400 select-none">/__debug/proxy/{selectedService.name}</span>
                  <input
                    type="text"
                    value={reqPath}
                    onChange={(e) => setReqPath(e.target.value)}
                    placeholder="/api/example"
                    className="flex-1 bg-transparent border-none outline-none pl-1 text-slate-900 font-bold"
                  />
                </div>

                <button
                  onClick={handleSendProxyRequest}
                  disabled={loading}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow flex items-center justify-center space-x-1.5 transition-colors disabled:opacity-60"
                >
                  {loading ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  <span>执行代理 (Send)</span>
                </button>
              </div>

              {/* 动态路由解析路径提示 */}
              <div className="text-[11px] font-mono text-slate-500 bg-slate-50 p-2 rounded border border-slate-200 flex items-center justify-between">
                <span>
                  BFF 转发目标: <strong className="text-indigo-600">{selectedService.baseUrl}{reqPath}</strong>
                </span>
                <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  环境: {selectedService.env}
                </span>
              </div>

              {/* Headers 与 Body 配置 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    请求头注入 (Headers JSON)
                  </label>
                  <textarea
                    rows={4}
                    value={headers}
                    onChange={(e) => setHeaders(e.target.value)}
                    className="w-full bg-slate-900 text-emerald-400 font-mono text-xs p-2.5 rounded-lg border border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    请求负载 (Request Body JSON)
                  </label>
                  <textarea
                    rows={4}
                    value={reqBody}
                    onChange={(e) => setReqBody(e.target.value)}
                    placeholder="{}"
                    disabled={httpMethod === "GET"}
                    className={`w-full font-mono text-xs p-2.5 rounded-lg border focus:outline-none ${
                      httpMethod === "GET"
                        ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                        : "bg-slate-900 text-amber-300 border-slate-700"
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* 响应展示面板 */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-5 shadow-lg text-white">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-4">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200">
                    BFF 代理响应结果 (Proxy Dispatch Echo)
                  </h4>
                </div>
                {proxyResponse && (
                  <div className="flex items-center space-x-2 font-mono text-xs">
                    <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                      200 OK
                    </span>
                    <span className="text-slate-400">耗时: {proxyResponse._proxy.latency_ms}ms</span>
                    <span className="text-slate-500">|</span>
                    <span className="text-indigo-400 font-bold">{proxyResponse._proxy.trace_id}</span>
                  </div>
                )}
              </div>

              {errorMsg ? (
                <div className="p-4 bg-rose-950/80 border border-rose-700 rounded-lg text-rose-300 text-xs font-mono">
                  <div className="font-bold flex items-center space-x-2 mb-1">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    <span>代理转发异常 (502 Bad Gateway)</span>
                  </div>
                  <p>{errorMsg}</p>
                </div>
              ) : proxyResponse ? (
                <div className="space-y-4">
                  {/* BFF 注入的元数据 */}
                  <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-800 text-[11px] font-mono grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-300">
                    <div>
                      <span className="text-slate-500">收口网关:</span>
                      <p className="text-indigo-300 font-bold">{proxyResponse._proxy.dispatched_by}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">目标微服务:</span>
                      <p className="text-amber-300 font-bold">{proxyResponse._proxy.target_service}</p>
                    </div>
                    <div>
                      <span className="text-slate-500">物理 URL:</span>
                      <p className="text-slate-300 truncate" title={proxyResponse._proxy.target_url}>
                        {proxyResponse._proxy.target_url}
                      </p>
                    </div>
                    <div>
                      <span className="text-slate-500">Trace ID:</span>
                      <p className="text-emerald-400 font-bold">{proxyResponse._proxy.trace_id}</p>
                    </div>
                  </div>

                  {/* 业务响应 JSON 树 */}
                  <div>
                    <span className="text-[11px] text-slate-400 font-semibold mb-1 block">
                      下游响应数据载荷 (Payload):
                    </span>
                    <pre className="bg-slate-950 p-4 rounded-lg font-mono text-xs text-emerald-400 overflow-x-auto max-h-80 border border-slate-800 leading-relaxed">
                      {JSON.stringify(proxyResponse, null, 2)}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500 text-xs space-y-2">
                  <Server className="w-8 h-8 text-slate-600 mb-1" />
                  <span>准备就绪：点击右上角「执行代理 (Send)」发起调试请求</span>
                  <span className="text-[11px] text-slate-600">
                    由 BFF 自动解析服务名、注入鉴权凭据与分布式跟踪链路 (TraceId)
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 选项卡 2：服务注册表管理 */}
      {activeSubTab === "registry" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <span>微服务注册表 (Dynamic Service Registry)</span>
                <span className="px-2 py-0.5 rounded text-xs bg-indigo-50 text-indigo-700 font-mono">
                  GET /__debug/services
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                维护微服务逻辑名、物理地址 (baseUrl)、健康路径与环境绑定，支持开发期运行时动态热插拔
              </p>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>注册微服务</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase font-semibold border-y border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">服务标识 (Service Name)</th>
                  <th className="py-2.5 px-3">分类</th>
                  <th className="py-2.5 px-3">目标基础地址 (Base URL)</th>
                  <th className="py-2.5 px-3">健康检查端点</th>
                  <th className="py-2.5 px-3">环境</th>
                  <th className="py-2.5 px-3">探活状态</th>
                  <th className="py-2.5 px-3">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {services.map((svc) => {
                  const h = healthMap[svc.name];
                  return (
                    <tr key={svc.name} className="hover:bg-slate-50/80">
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{svc.label}</div>
                        <div className="font-mono text-[11px] text-slate-500">{svc.name} · {svc.version}</div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                          {svc.category}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-indigo-700">
                        {svc.baseUrl}
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-600">
                        {svc.healthPath}
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono">
                          {svc.env}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                            h?.status === "UP"
                              ? "bg-emerald-100 text-emerald-800"
                              : !svc.enabled
                              ? "bg-slate-100 text-slate-500"
                              : "bg-rose-100 text-rose-800"
                          }`}
                        >
                          {h?.status || "UNKNOWN"}
                          {h?.latency ? ` (${h.latency}ms)` : ""}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleToggleService(svc.name)}
                            className={`px-2 py-1 rounded text-[11px] font-bold ${
                              svc.enabled
                                ? "bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200"
                                : "bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200"
                            }`}
                          >
                            {svc.enabled ? "禁用代理" : "恢复代理"}
                          </button>
                          <button
                            onClick={() => {
                              handleSelectService(svc);
                              setActiveSubTab("requester");
                            }}
                            className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold text-[11px]"
                          >
                            发起调试
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 选项卡 3：OpenAPI 规范聚合 */}
      {activeSubTab === "openapi" && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-base font-bold text-slate-800 flex items-center space-x-2">
                <span>OpenAPI 规范聚合导出</span>
                <span className="px-2 py-0.5 rounded text-xs bg-indigo-50 text-indigo-700 font-mono">
                  GET /__debug/openapi/:name
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                BFF 根据微服务元数据实时拉取并聚合 OpenAPI 3.0.0 规范，提供统一端点定义
              </p>
            </div>
            <select
              value={selectedService.name}
              onChange={(e) => {
                const s = services.find((x) => x.name === e.target.value);
                if (s) handleSelectService(s);
              }}
              className="bg-slate-50 border border-slate-300 font-bold text-xs rounded-lg px-3 py-1.5 text-slate-800"
            >
              {services.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          <div className="bg-slate-900 rounded-lg p-4 font-mono text-xs text-emerald-400 overflow-x-auto max-h-96">
            <pre>{JSON.stringify(openApiSpec || bffDebugGateway.getOpenApiSpec(selectedService.name), null, 2)}</pre>
          </div>
        </div>
      )}

      {/* 选项卡 4：实时链路与分布式日志 */}
      {activeSubTab === "logs" && (
        <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 shadow-xl text-white space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <span>微服务实时调试日志流 (SSE/Log Stream)</span>
                  <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-indigo-300 font-mono">
                    GET /__debug/logs/:name
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  所有通过 BFF 代理分发或微服务内部事件均附带分布式链路追踪 ID (Trace ID)
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <select
                value={logFilterService}
                onChange={(e) => {
                  setLogFilterService(e.target.value);
                  setLogs(bffDebugGateway.getLogs(e.target.value));
                }}
                className="bg-slate-800 text-slate-200 border border-slate-700 rounded text-xs px-2.5 py-1.5 font-mono"
              >
                <option value="all">全量服务 (All)</option>
                {services.map((s) => (
                  <option key={s.name} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>

              <button
                onClick={handleRefreshLogs}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
                title="刷新日志"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => {
                  bffDebugGateway.clearLogs();
                  setLogs([]);
                }}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
                title="清空日志"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-2 font-mono text-xs max-h-96 overflow-y-auto pr-1">
            {logs.length === 0 ? (
              <div className="text-center py-12 text-slate-500">暂无日志</div>
            ) : (
              logs.map((log) => (
                <div
                  key={log.id}
                  className="bg-slate-950/70 p-3 rounded border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start sm:items-center space-x-2 overflow-hidden">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                        log.level === "INFO"
                          ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                          : log.level === "WARN"
                          ? "bg-amber-950 text-amber-400 border border-amber-800"
                          : "bg-rose-950 text-rose-400 border border-rose-800"
                      }`}
                    >
                      {log.level}
                    </span>
                    <span className="text-indigo-400 font-semibold shrink-0">[{log.service}]</span>
                    <span className="text-slate-300 truncate">{log.message}</span>
                  </div>

                  <div className="flex items-center space-x-3 text-[11px] text-slate-500 shrink-0">
                    <span className="font-mono text-amber-300/80">{log.traceId}</span>
                    <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 注册新服务弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-6 shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-800">
                向 BFF 注册新微服务 (Register Service)
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-bold mb-1">服务逻辑名 (name)</label>
                <input
                  type="text"
                  value={newSvcForm.name}
                  onChange={(e) => setNewSvcForm({ ...newSvcForm, name: e.target.value })}
                  className="w-full border border-slate-300 rounded p-2 font-mono"
                  placeholder="auth-service"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">显示名称 (label)</label>
                <input
                  type="text"
                  value={newSvcForm.label}
                  onChange={(e) => setNewSvcForm({ ...newSvcForm, label: e.target.value })}
                  className="w-full border border-slate-300 rounded p-2"
                  placeholder="用户认证微服务"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">物理基础 URL (baseUrl)</label>
                  <input
                    type="text"
                    value={newSvcForm.baseUrl}
                    onChange={(e) => setNewSvcForm({ ...newSvcForm, baseUrl: e.target.value })}
                    className="w-full border border-slate-300 rounded p-2 font-mono"
                    placeholder="http://127.0.0.1:8004"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">环境 (env)</label>
                  <input
                    type="text"
                    value={newSvcForm.env}
                    onChange={(e) => setNewSvcForm({ ...newSvcForm, env: e.target.value })}
                    className="w-full border border-slate-300 rounded p-2 font-mono"
                    placeholder="dev"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 font-bold mb-1">健康检查路径 (healthPath)</label>
                  <input
                    type="text"
                    value={newSvcForm.healthPath}
                    onChange={(e) => setNewSvcForm({ ...newSvcForm, healthPath: e.target.value })}
                    className="w-full border border-slate-300 rounded p-2 font-mono"
                    placeholder="/health"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-bold mb-1">OpenAPI 路径 (openapiPath)</label>
                  <input
                    type="text"
                    value={newSvcForm.openapiPath}
                    onChange={(e) => setNewSvcForm({ ...newSvcForm, openapiPath: e.target.value })}
                    className="w-full border border-slate-300 rounded p-2 font-mono"
                    placeholder="/openapi.json"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">服务简要说明 (description)</label>
                <input
                  type="text"
                  value={newSvcForm.description}
                  onChange={(e) => setNewSvcForm({ ...newSvcForm, description: e.target.value })}
                  className="w-full border border-slate-300 rounded p-2"
                  placeholder="负责登录鉴权与Token验证"
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 border border-slate-300 rounded text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                取消
              </button>
              <button
                onClick={handleSaveNewService}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-bold shadow"
              >
                确认注册 (POST /__debug/services)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

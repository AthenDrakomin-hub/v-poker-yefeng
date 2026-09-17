import React, { useState } from "react";
import { Server, ArrowRight, Database, Globe, Shield, Activity, Laptop, ExternalLink, Cpu } from "lucide-react";

export const ArchitectureMap: React.FC = () => {
  const [selectedService, setSelectedService] = useState<string>("wallet-service");

  const services: Record<
    string,
    {
      title: string;
      port: string;
      tech: string;
      role: string;
      endpoints: string[];
      codeRef: string;
    }
  > = {
    "wallet-service": {
      title: "钱包微服务 (Wallet Service)",
      port: "8001",
      tech: "Python 3.11 + FastAPI + Async SQLAlchemy + aiosqlite",
      role: "系统核心资产账本与能量守恒核算机。负责管理员铸币、用户转账扣 0.01% 手续费、对局抽水分账落地及能量守恒审计。",
      endpoints: [
        "POST /api/wallet/mint (管理员铸币)",
        "POST /api/wallet/transfer (自由转账 0.01% 扣费)",
        "POST /api/wallet/game_settle (游戏对局抽水分账)",
        "GET /api/wallet/balance/{user_id} (查询余额)",
        "GET /api/wallet/transactions/{user_id} (查询流水)",
        "GET /api/wallet/audit (能量守恒对账)"
      ],
      codeRef: "wallet_service/app/main.py & wallet_engine.py"
    },
    "commission-service": {
      title: "结算微服务 (Commission Service)",
      port: "8000",
      tech: "Python 3.11 + FastAPI + Pydantic v2",
      role: "负责代理树维护与层级返佣分水计算。根据 S (底池)、p (平台抽水率)、a (代理佣金率) 与 r_list 级联计算各级佣金与平台净留存。",
      endpoints: [
        "POST /api/settle (代理返佣计算与分账)",
        "POST /api/agent (新增代理)",
        "GET /api/agent/tree (代理层级拓扑树)"
      ],
      codeRef: "commission_service/app/main.py & settlement_engine.py"
    },
    "bff": {
      title: "BFF 聚合网关 (Backend-For-Frontend)",
      port: "4000",
      tech: "Node.js 20 + Hono.js + TypeScript",
      role: "聚合下游微服务接口，专供代理端、客服端、管理端三类异构客户端，统一鉴权与数据组装。",
      endpoints: [
        "GET/POST /api/agent/* (代理后台接口)",
        "GET/POST /api/support/* (客服工单与流水追溯)",
        "GET/POST /api/admin/* (管理端全景总控与铸币代理)"
      ],
      codeRef: "bff/src/index.ts"
    },
    "game-engine": {
      title: "多游戏平台核心 + 6 规则插件 (Multi-Game Engine)",
      port: "8003 / 3001",
      tech: "Node.js 20 + Hono.js + WebSocket + Plugin Interface",
      role: "负责统一房间、座位、生命周期状态机管理；通过统一 GamePlugin 插件规范驱动 6 大游戏（德州扑克、炸金花、抢庄牛牛、抢庄三公、通比牛牛、通比三公）。计算出玩家 net_amount 后通过 walletClient.ts 组装 GameSettleRequest 调用钱包微服务原子结算。",
      endpoints: [
        "WebSocket /ws/table (牌局实时下注与状态同步)",
        "POST /api/engine/room/create (创建指定规则房间)",
        "POST /api/engine/room/:id/action (统一玩家动作路由)",
        "POST /api/engine/room/:id/settle (结算对局并上报钱包)",
        "Bridge: walletClient.ts -> POST /api/wallet/game_settle"
      ],
      codeRef: "game-engine/src/core/* & game-engine/src/games/*"
    },
    "dashboards": {
      title: "三大独立管理后台",
      port: "3002 (Refine) / 8080 (UVdesk) / 8088 (FastAPI-Admin)",
      tech: "Refine (React) + UVdesk + FastAPI-Admin",
      role: "为代理、客服、总管理员提供权限隔离的独立控制台，无需直接访问核心数据库。",
      endpoints: [
        "代理后台: 佣金提现看板、下级玩家流水",
        "客服后台: 争议对局排查、玩家账户全息日志",
        "管理后台: 能量守恒熔断报警、全局铸币控制台"
      ],
      codeRef: "agent-dashboard/, support-dashboard/, admin-dashboard/"
    },
    "metabase": {
      title: "Metabase BI 监控大屏",
      port: "3030",
      tech: "Metabase Official Docker Container",
      role: "可视化数据大屏，实时执行能量守恒对账 SQL，并在 difference != 0 时触发自动化 Webhook 告警。",
      endpoints: [
        "Card 1: 能量守恒红线监控看板",
        "Card 2: 每日 0.01% 手续费收入趋势",
        "Card 3: 代理返佣排行榜"
      ],
      codeRef: "dashboard/metabase-setup.md"
    }
  };

  const current = services[selectedService];

  return (
    <div className="space-y-6">
      {/* Visual Service Topology Diagram */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 text-white shadow-md">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Server className="w-5 h-5 text-indigo-400" />
              微服务架构拓扑与数据流转图
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              点击下方服务节点，在右侧/底部面板查看完整的服务职责、端口与 API 契约
            </p>
          </div>
          <span className="text-[11px] font-mono bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700">
            Docker Compose 一键编排
          </span>
        </div>

        {/* Nodes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6">
          {/* Column 1: Client & Game Engine */}
          <div className="space-y-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              1. 游戏引擎与接入层
            </div>
            <div
              onClick={() => setSelectedService("game-engine")}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedService === "game-engine"
                  ? "bg-indigo-950/80 border-indigo-500 shadow-md shadow-indigo-500/20"
                  : "bg-slate-800/60 border-slate-700 hover:border-slate-500"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-indigo-300">开源德扑引擎</span>
                <span className="text-[10px] font-mono bg-indigo-900/60 text-indigo-200 px-2 py-0.5 rounded">
                  Port 3001
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                lhz960904/texas-holdem 游戏逻辑
              </p>
              <div className="mt-3 text-[11px] font-mono text-emerald-400 bg-slate-900/80 p-2 rounded border border-slate-700/60">
                ★ bridge: settlementClient.ts
              </div>
            </div>

            <div
              onClick={() => setSelectedService("dashboards")}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedService === "dashboards"
                  ? "bg-indigo-950/80 border-indigo-500 shadow-md shadow-indigo-500/20"
                  : "bg-slate-800/60 border-slate-700 hover:border-slate-500"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-indigo-300">三大独立后台</span>
                <span className="text-[10px] font-mono bg-indigo-900/60 text-indigo-200 px-2 py-0.5 rounded">
                  3002/8080/8088
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                代理端 (Refine) · 客服端 (UVdesk) · 管理端 (FastAPI-Admin)
              </p>
            </div>
          </div>

          {/* Column 2: Gateway & Core Services */}
          <div className="space-y-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              2. 网关与核心微服务
            </div>

            <div
              onClick={() => setSelectedService("bff")}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedService === "bff"
                  ? "bg-indigo-950/80 border-indigo-500 shadow-md shadow-indigo-500/20"
                  : "bg-slate-800/60 border-slate-700 hover:border-slate-500"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-indigo-300">BFF 聚合网关</span>
                <span className="text-[10px] font-mono bg-indigo-900/60 text-indigo-200 px-2 py-0.5 rounded">
                  Port 4000
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                Node.js + Hono · /api/agent, /api/support, /api/admin
              </p>
            </div>

            <div
              onClick={() => setSelectedService("wallet-service")}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedService === "wallet-service"
                  ? "bg-amber-950/80 border-amber-500 shadow-md shadow-amber-500/20"
                  : "bg-slate-800/60 border-slate-700 hover:border-slate-500"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-amber-300">★ 钱包微服务</span>
                <span className="text-[10px] font-mono bg-amber-900/60 text-amber-200 px-2 py-0.5 rounded">
                  Port 8001
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                FastAPI + Async SQLAlchemy · 铸币 / 0.01%转账 / 守恒对账
              </p>
              <div className="mt-3 text-[11px] font-mono text-amber-400 bg-slate-900/80 p-2 rounded border border-slate-700/60">
                Sum(wallets) + fee_pool == Sum(mint)
              </div>
            </div>
          </div>

          {/* Column 3: Settlement & Analytics */}
          <div className="space-y-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              3. 结算与监控大屏
            </div>

            <div
              onClick={() => setSelectedService("commission-service")}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedService === "commission-service"
                  ? "bg-indigo-950/80 border-indigo-500 shadow-md shadow-indigo-500/20"
                  : "bg-slate-800/60 border-slate-700 hover:border-slate-500"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-indigo-300">结算返佣微服务</span>
                <span className="text-[10px] font-mono bg-indigo-900/60 text-indigo-200 px-2 py-0.5 rounded">
                  Port 8000
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                FastAPI · 代理树级联返佣分水引擎 (r_list)
              </p>
            </div>

            <div
              onClick={() => setSelectedService("metabase")}
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                selectedService === "metabase"
                  ? "bg-indigo-950/80 border-indigo-500 shadow-md shadow-indigo-500/20"
                  : "bg-slate-800/60 border-slate-700 hover:border-slate-500"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-sm text-indigo-300">Metabase BI 大屏</span>
                <span className="text-[10px] font-mono bg-indigo-900/60 text-indigo-200 px-2 py-0.5 rounded">
                  Port 3030
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-2">
                能量守恒 SQL 实时监控 · 手续费损耗趋势
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Service Detail Card */}
      {current && (
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-lg font-bold text-slate-900">{current.title}</h3>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                端口: {current.port} · 技术栈: {current.tech}
              </p>
            </div>
            <div className="text-xs text-indigo-600 font-mono bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
              代码路径: {current.codeRef}
            </div>
          </div>

          <div className="mt-4 text-xs text-slate-700 leading-relaxed">
            <span className="font-bold text-slate-900 block mb-1">服务职责与业务边界:</span>
            {current.role}
          </div>

          <div className="mt-4">
            <span className="font-bold text-xs text-slate-900 block mb-2">对外暴露 API 契约:</span>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {current.endpoints.map((ep, idx) => (
                <div
                  key={idx}
                  className="p-2.5 bg-slate-50 border border-slate-200/80 rounded-xl font-mono text-[11px] text-slate-700 flex items-center gap-2"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                  <span>{ep}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

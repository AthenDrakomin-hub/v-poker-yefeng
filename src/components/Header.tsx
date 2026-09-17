import React from "react";
import { AuditMetrics } from "../types";
import { ShieldCheck, AlertTriangle, RefreshCw, Cpu, Database, BookOpen, PlayCircle, Code2, Layers, Sparkles, Terminal } from "lucide-react";

interface HeaderProps {
  audit: AuditMetrics;
  onRefreshAudit: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  audit,
  onRefreshAudit,
  activeTab,
  setActiveTab
}) => {
  const tabs = [
    { id: "debug_gateway", label: "BFF调试网关 (/__debug/*)", icon: Terminal },
    { id: "multi_game", label: "多游戏引擎 (6合1)", icon: Sparkles },
    { id: "playground", label: "沙盒经济引擎", icon: Cpu },
    { id: "test_runner", label: "自动化测试套件", icon: PlayCircle },
    { id: "ledger", label: "实时账本与资产", icon: Database },
    { id: "architecture", label: "微服务拓扑图谱", icon: Layers },
    { id: "schema", label: "全局契约字典", icon: BookOpen },
    { id: "code", label: "全套源码浏览", icon: Code2 }
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-30 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Logo & Title */}
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center shadow-md shadow-indigo-500/20">
              <span className="text-xl font-black text-white">♠</span>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-bold tracking-tight text-slate-100">
                  棋牌平台微服务架构与虚拟经济系统
                </h1>
                <span className="text-[11px] font-mono uppercase bg-indigo-950 text-indigo-300 border border-indigo-800/80 px-2 py-0.5 rounded-full">
                  Closed Economy
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                基于 FastAPI + SQLAlchemy + Hono BFF + 德扑开源引擎桥接 · 0.01% 手续费 · 零损耗守恒
              </p>
            </div>
          </div>

          {/* Energy Conservation Live Badge */}
          <div className="flex items-center gap-3">
            <div
              className={`flex items-center space-x-2.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
                audit.is_conserved
                  ? "bg-emerald-950/60 border-emerald-600/40 text-emerald-300"
                  : "bg-rose-950/80 border-rose-600 text-rose-300 animate-pulse"
              }`}
            >
              {audit.is_conserved ? (
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <div>
                <div className="font-semibold flex items-center gap-1.5">
                  <span>{audit.is_conserved ? "能量绝对守恒" : "守恒被破坏!"}</span>
                  <span className="text-[10px] opacity-80">(差额: {audit.difference})</span>
                </div>
                <div className="text-[10px] text-slate-400">
                  发行: {audit.total_minted.toLocaleString()} = 钱包: {audit.wallets_balance_sum.toLocaleString()} + 池: {audit.fee_pool_balance.toLocaleString()}
                </div>
              </div>
            </div>

            <button
              onClick={onRefreshAudit}
              title="重新核算能量守恒"
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700 text-xs flex items-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">对账</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="flex space-x-1 mt-3 overflow-x-auto pb-1 scrollbar-none">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/30"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};

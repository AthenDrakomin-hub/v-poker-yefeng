import React, { useState, useEffect } from "react";
import { Header } from "./components/Header";
import { DebugNamespacePanel } from "./components/DebugNamespacePanel";
import { MultiGamePlayground } from "./components/MultiGamePlayground";
import { EconomyPlayground } from "./components/EconomyPlayground";
import { TestSuiteRunner } from "./components/TestSuiteRunner";
import { LedgerViewer } from "./components/LedgerViewer";
import { ArchitectureMap } from "./components/ArchitectureMap";
import { SchemaViewer } from "./components/SchemaViewer";
import { CodeExplorer } from "./components/CodeExplorer";
import { sandbox } from "./mockEngine";
import { AuditMetrics } from "./types";
import { Shield, Sparkles } from "lucide-react";

export default function App() {
  const [activeTab, setActiveTab] = useState("debug_gateway");
  const [audit, setAudit] = useState<AuditMetrics>(() => sandbox.audit());

  const handleUpdate = () => {
    setAudit(sandbox.audit());
  };

  useEffect(() => {
    // 首次进入时，如果钱包为空，预注入基础演示例数据
    if (sandbox.transactions.length === 0) {
      sandbox.mint("tx_init_mint_001", "u_admin_root", "p_alice", 1000000, "系统初始化发行");
      sandbox.transfer("tx_init_tf_001", "p_alice", "p_bob", 200000, "初始流动性转移");
      setAudit(sandbox.audit());
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navigation & Status */}
      <Header
        audit={audit}
        onRefreshAudit={handleUpdate}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === "debug_gateway" && <DebugNamespacePanel />}
        {activeTab === "multi_game" && <MultiGamePlayground />}
        {activeTab === "playground" && (
          <EconomyPlayground audit={audit} onUpdate={handleUpdate} />
        )}
        {activeTab === "test_runner" && (
          <TestSuiteRunner onStateChange={handleUpdate} />
        )}
        {activeTab === "ledger" && <LedgerViewer />}
        {activeTab === "architecture" && <ArchitectureMap />}
        {activeTab === "schema" && <SchemaViewer />}
        {activeTab === "code" && <CodeExplorer />}
      </main>

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-800/80 py-4 mt-8 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>封闭式虚拟经济协议 · 严禁任何法币存取款接口 · 严格能量守恒检验</span>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            FastAPI 8001 · Commission 8000 · BFF 4000 · Metabase 3030
          </div>
        </div>
      </footer>
    </div>
  );
}

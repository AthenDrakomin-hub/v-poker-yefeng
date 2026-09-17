import React, { useState } from "react";
import { sandbox } from "../mockEngine";
import { Database, Filter, ArrowUpRight, ArrowDownLeft, Shield, Users, Trophy } from "lucide-react";

export const LedgerViewer: React.FC = () => {
  const [subTab, setSubTab] = useState<"wallets" | "transactions" | "agents" | "games">("wallets");
  const [txTypeFilter, setTxTypeFilter] = useState<string>("all");

  const wallets = Array.from(sandbox.wallets.values());
  const transactions = sandbox.transactions.filter(
    (t) => txTypeFilter === "all" || t.type === txTypeFilter
  );
  const agents = sandbox.agents;
  const gameRecords = sandbox.gameRecords;
  const settlementLogs = sandbox.settlementLogs;

  return (
    <div className="space-y-6">
      {/* Sub Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {[
          { id: "wallets", label: `账户钱包表 (${wallets.length})`, icon: Database },
          { id: "transactions", label: `流水账本 (${transactions.length})`, icon: Filter },
          { id: "agents", label: `代理层级表 (${agents.length})`, icon: Users },
          { id: "games", label: `对局与分账日志 (${gameRecords.length})`, icon: Trophy },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setSubTab(tab.id as any)}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                active
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Wallets */}
      {subTab === "wallets" && (
        <div className="space-y-4">
          {/* Fee Pool Highlight Box */}
          <div className="bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-sm shadow-amber-500/30">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs text-amber-800 font-semibold uppercase tracking-wider">
                  平台唯一手续费归集池 (fee_pool)
                </div>
                <div className="text-xl font-extrabold font-mono text-amber-900 mt-0.5">
                  {sandbox.feePool.balance.toLocaleString()} <span className="text-xs font-normal">筹码</span>
                </div>
              </div>
            </div>
            <div className="text-xs text-amber-700 bg-white/80 px-3 py-1.5 rounded-lg border border-amber-200 font-mono">
              pool_id: {sandbox.feePool.pool_id} · 自动沉淀 0.01% 转账费及房费平台留存
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-xs tracking-wider uppercase">
                系统全角色钱包列表 (wallets)
              </h3>
              <span className="text-xs text-slate-400">金额单位: 筹码整数 (BigInt)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-mono uppercase text-[11px] border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">wallet_id</th>
                    <th className="px-4 py-3">user_id</th>
                    <th className="px-4 py-3">user_type</th>
                    <th className="px-4 py-3 text-right">可用余额 (balance)</th>
                    <th className="px-4 py-3 text-right">冻结余额 (frozen)</th>
                    <th className="px-4 py-3 text-right">updated_at</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {wallets.map((w) => (
                    <tr key={w.wallet_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 text-slate-500">{w.wallet_id}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">{w.user_id}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold uppercase ${
                            w.user_type === "admin"
                              ? "bg-rose-100 text-rose-700"
                              : w.user_type === "agent"
                              ? "bg-indigo-100 text-indigo-700"
                              : w.user_type === "support"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-emerald-100 text-emerald-700"
                          }`}
                        >
                          {w.user_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {w.balance.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400">
                        {w.frozen_balance.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-400 text-[11px]">
                        {new Date(w.updated_at).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Transactions */}
      {subTab === "transactions" && (
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap justify-between items-center gap-3 bg-slate-50/50">
            <div>
              <h3 className="font-bold text-slate-800 text-xs tracking-wider uppercase">
                全局真实账本明细 (transactions)
              </h3>
              <p className="text-[11px] text-slate-400">全局唯一流水号，严格防重放幂等支持</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">类型筛选:</span>
              <select
                value={txTypeFilter}
                onChange={(e) => setTxTypeFilter(e.target.value)}
                className="text-xs px-2.5 py-1 border rounded-lg bg-white text-slate-700"
              >
                <option value="all">全部流水 (All)</option>
                <option value="mint">铸币 (mint)</option>
                <option value="transfer">转账 (transfer)</option>
                <option value="game_settle">游戏结算 (game_settle)</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-mono uppercase text-[11px] border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">transaction_id</th>
                  <th className="px-4 py-3">类型 (type)</th>
                  <th className="px-4 py-3">支出方 (from)</th>
                  <th className="px-4 py-3">接收方 (to)</th>
                  <th className="px-4 py-3 text-right">金额 (amount)</th>
                  <th className="px-4 py-3 text-right">手续费 (fee)</th>
                  <th className="px-4 py-3">状态</th>
                  <th className="px-4 py-3">备注 (remark)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-slate-400 font-sans">
                      暂无流水数据，可在「沙盒业务引擎」中执行铸币或转账测试。
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.transaction_id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-semibold text-slate-800">{tx.transaction_id}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-sans font-bold ${
                            tx.type === "mint"
                              ? "bg-amber-100 text-amber-800"
                              : tx.type === "transfer"
                              ? "bg-indigo-100 text-indigo-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {tx.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500">{tx.from_wallet_id || "— (铸造注入)"}</td>
                      <td className="px-4 py-3 text-slate-700 font-medium">{tx.to_wallet_id}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-900">
                        {tx.amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right text-amber-700 font-bold">
                        {tx.fee > 0 ? `${tx.fee}` : "0"}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px]">
                          {tx.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-500 max-w-xs truncate" title={tx.remark || ""}>
                        {tx.remark || "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 3: Agents Hierarchy */}
      {subTab === "agents" && (
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-800 text-xs tracking-wider uppercase">
              多级代理分销树 (agents)
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              开房代理 (level 0, r_0) 向上递归追溯二级代与总代，每笔牌局房费按比例分润
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-500 font-mono uppercase text-[11px] border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">agent_id</th>
                  <th className="px-4 py-3">直属上级 (parent_id)</th>
                  <th className="px-4 py-3">代理层级 (level)</th>
                  <th className="px-4 py-3 text-right">分佣比例 (r_ratio)</th>
                  <th className="px-4 py-3 text-right">累计未提佣金</th>
                  <th className="px-4 py-3">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {agents.map((agt) => (
                  <tr key={agt.agent_id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3 font-semibold text-indigo-700">{agt.agent_id}</td>
                    <td className="px-4 py-3 text-slate-400">{agt.parent_id || "— (顶级公会)"}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-sans font-medium text-[10px]">
                        Level {agt.level} {agt.level === 0 ? "(直接开房代)" : agt.level === 1 ? "(二级代理)" : "(总代)"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-indigo-900">
                      {(agt.r_ratio * 100).toFixed(2)}%
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-emerald-700">
                      {agt.commission_balance.toLocaleString()} 筹码
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px]">
                        {agt.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 4: Game & Settlement Logs */}
      {subTab === "games" && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-xs tracking-wider uppercase">
                牌桌对局流水记录 (game_records)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-mono uppercase text-[11px] border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">transaction_id</th>
                    <th className="px-4 py-3">房间桌号 (room_id)</th>
                    <th className="px-4 py-3 text-right">总底池流水 (S)</th>
                    <th className="px-4 py-3 text-right">局内人数</th>
                    <th className="px-4 py-3">结算状态</th>
                    <th className="px-4 py-3 text-right">对局时间</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {gameRecords.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-400 font-sans">
                        暂无对局流水，可在沙盒中模拟一局德州扑克结算。
                      </td>
                    </tr>
                  ) : (
                    gameRecords.map((gr) => (
                      <tr key={gr.transaction_id}>
                        <td className="px-4 py-3 font-semibold text-slate-800">{gr.transaction_id}</td>
                        <td className="px-4 py-3 text-indigo-700">{gr.room_id}</td>
                        <td className="px-4 py-3 text-right font-bold text-slate-900">
                          {gr.total_flow.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600">{gr.player_count}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[10px]">
                            {gr.settlement_status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-400">
                          {new Date(gr.created_at).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
            <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50/50">
              <h3 className="font-bold text-slate-800 text-xs tracking-wider uppercase">
                结算分账日志明细 (settlement_logs)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-mono uppercase text-[11px] border-b border-slate-100">
                  <tr>
                    <th className="px-4 py-3">settlement_id</th>
                    <th className="px-4 py-3">关联流水 (transaction_id)</th>
                    <th className="px-4 py-3">代理ID</th>
                    <th className="px-4 py-3">层级</th>
                    <th className="px-4 py-3 text-right">获佣金额</th>
                    <th className="px-4 py-3 text-right">平台净留存</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {settlementLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-6 text-center text-slate-400 font-sans">
                        暂无分账明细
                      </td>
                    </tr>
                  ) : (
                    settlementLogs.map((sl) => (
                      <tr key={sl.settlement_id}>
                        <td className="px-4 py-3 text-slate-500">{sl.settlement_id}</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{sl.transaction_id}</td>
                        <td className="px-4 py-3 text-indigo-700">{sl.agent_id}</td>
                        <td className="px-4 py-3">Level {sl.level}</td>
                        <td className="px-4 py-3 text-right font-bold text-emerald-700">
                          {sl.commission_amount.toLocaleString()} 筹码
                        </td>
                        <td className="px-4 py-3 text-right text-amber-700">
                          {sl.platform_revenue.toLocaleString()} 筹码
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

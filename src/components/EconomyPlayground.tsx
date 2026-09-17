import React, { useState } from "react";
import { sandbox } from "../mockEngine";
import { AuditMetrics } from "../types";
import { Coins, ArrowRightLeft, Trophy, Scale, CheckCircle2, AlertCircle } from "lucide-react";

interface EconomyPlaygroundProps {
  audit: AuditMetrics;
  onUpdate: () => void;
}

export const EconomyPlayground: React.FC<EconomyPlaygroundProps> = ({ audit, onUpdate }) => {
  // Mint state
  const [mintTarget, setMintTarget] = useState("p_alice");
  const [mintAmount, setMintAmount] = useState(1000000);
  const [mintRemark, setMintRemark] = useState("管理员初始注入");
  const [mintTxId, setMintTxId] = useState(`tx_mint_${Date.now().toString().slice(-6)}`);

  // Transfer state
  const [fromUser, setFromUser] = useState("p_alice");
  const [toUser, setToUser] = useState("p_bob");
  const [transferAmount, setTransferAmount] = useState(200000);
  const [transferTxId, setTransferTxId] = useState(`tx_tf_${Date.now().toString().slice(-6)}`);

  // Game settle state
  const [settleRoom, setSettleRoom] = useState("room_888");
  const [settlePot, setSettlePot] = useState(100000);
  const [settleWinner, setSettleWinner] = useState("p_charlie");
  const [platformRakeRate, setPlatformRakeRate] = useState(0.05); // 5%
  const [agentRate, setAgentRate] = useState(0.03); // 3%
  const [settleTxId, setSettleTxId] = useState(`tx_game_${Date.now().toString().slice(-6)}`);

  // Message feedback
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const calculatedFee = Math.floor(transferAmount * 0.0001);
  const calculatedNet = Math.max(0, transferAmount - calculatedFee);

  const calculatedRake = Math.floor(settlePot * platformRakeRate);
  const calculatedAgentPool = Math.floor(settlePot * agentRate);
  const calculatedWinnerPayout = settlePot - calculatedRake;
  const calculatedPlatformNet = calculatedRake - calculatedAgentPool;

  const handleMint = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      sandbox.mint(mintTxId, "u_admin_root", mintTarget, Number(mintAmount), mintRemark);
      setFeedback({
        type: "success",
        text: `铸币成功：已向 ${mintTarget} 注入 ${mintAmount.toLocaleString()} 筹码！流水号: ${mintTxId}`
      });
      setMintTxId(`tx_mint_${Date.now().toString().slice(-6)}`);
      onUpdate();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message });
    }
  };

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = sandbox.transfer(transferTxId, fromUser, toUser, Number(transferAmount));
      setFeedback({
        type: "success",
        text: `转账成功：${fromUser} 转出 ${transferAmount.toLocaleString()}，扣除 0.01% 手续费 ${res.fee} 筹码，${toUser} 实收 ${res.netAmount.toLocaleString()} 筹码！`
      });
      setTransferTxId(`tx_tf_${Date.now().toString().slice(-6)}`);
      onUpdate();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message });
    }
  };

  const handleSettle = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = sandbox.gameSettle(
        settleTxId,
        settleRoom,
        Number(settlePot),
        6,
        [{ userId: settleWinner, weight: 1 }],
        platformRakeRate,
        agentRate,
        "agt_room_03"
      );
      setFeedback({
        type: "success",
        text: `结算成功：房间 ${settleRoom} 底池 ${settlePot.toLocaleString()}，赢家实得 ${res.winnersPayout.toLocaleString()}，房费抽水 ${res.totalRake} (代理返佣池 ${res.agentPool}，平台留存 ${res.platformRevenue})！`
      });
      setSettleTxId(`tx_game_${Date.now().toString().slice(-6)}`);
      onUpdate();
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Feedback banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-sm ${
            feedback.type === "success"
              ? "bg-emerald-50 border-emerald-200 text-emerald-800"
              : "bg-rose-50 border-rose-200 text-rose-800"
          }`}
        >
          <div className="flex items-center space-x-2.5">
            {feedback.type === "success" ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            )}
            <span className="font-medium">{feedback.text}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-xs underline opacity-70 hover:opacity-100 ml-4"
          >
            关闭
          </button>
        </div>
      )}

      {/* Audit Balance Sheet Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <div className="flex items-center space-x-2">
              <Scale className="w-5 h-5 text-indigo-400" />
              <h2 className="text-base font-bold text-slate-100">能量守恒实时对账天平</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              系统公理：所有钱包余额之和 + 平台手续费池累计余额 ≡ 历史所有铸币发行总量 (差额必须为 0)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`px-3 py-1 rounded-full text-xs font-mono font-bold ${
                audit.is_conserved
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
              }`}
            >
              {audit.is_conserved ? "✓ 零损耗平衡" : "✗ 差额报警"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-center">
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-800">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono">系统历史总铸币</div>
            <div className="text-xl font-bold font-mono text-amber-400 mt-1">
              {audit.total_minted.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">发行总基准 S_mint</div>
          </div>
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-800">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono">流通钱包总额</div>
            <div className="text-xl font-bold font-mono text-indigo-300 mt-1">
              {audit.wallets_balance_sum.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{audit.wallets_count} 个在册钱包</div>
          </div>
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-800">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono">手续费池沉淀</div>
            <div className="text-xl font-bold font-mono text-emerald-400 mt-1">
              {audit.fee_pool_balance.toLocaleString()}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">platform_fee 沉淀池</div>
          </div>
          <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-800">
            <div className="text-[11px] uppercase tracking-wider text-slate-400 font-mono">检验差额 (Difference)</div>
            <div
              className={`text-xl font-bold font-mono mt-1 ${
                audit.difference === 0 ? "text-emerald-400" : "text-rose-400"
              }`}
            >
              {audit.difference}
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">
              {audit.difference === 0 ? "无缝闭环" : "系统发生资产泄漏!"}
            </div>
          </div>
        </div>
      </div>

      {/* 3 Core Business Action Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel 1: Minting */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-100">
              <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">1. 管理员铸币 (Mint)</h3>
                <p className="text-xs text-slate-400 font-mono">POST /api/wallet/mint</p>
              </div>
            </div>

            <form onSubmit={handleMint} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">幂等流水号 (transaction_id)</label>
                <input
                  type="text"
                  value={mintTxId}
                  onChange={(e) => setMintTxId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg bg-slate-50 font-mono text-slate-700"
                  required
                />
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">目标账户 (target_user_id)</label>
                <select
                  value={mintTarget}
                  onChange={(e) => setMintTarget(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg bg-white text-slate-700"
                >
                  <option value="p_alice">Alice (玩家 p_alice)</option>
                  <option value="p_bob">Bob (玩家 p_bob)</option>
                  <option value="p_charlie">Charlie (玩家 p_charlie)</option>
                  <option value="agt_room_03">开房代理 (agt_room_03)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">铸币金额 (amount 整数筹码)</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={mintAmount}
                  onChange={(e) => setMintAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg bg-white font-mono text-slate-800 font-semibold"
                  required
                />
                <div className="flex gap-1.5 mt-1.5">
                  {[100000, 500000, 1000000].map((val) => (
                    <button
                      type="button"
                      key={val}
                      onClick={() => setMintAmount(val)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[11px]"
                    >
                      {val.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">交易备注 (remark)</label>
                <input
                  type="text"
                  value={mintRemark}
                  onChange={(e) => setMintRemark(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg bg-white text-slate-700"
                />
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold shadow-sm shadow-amber-600/20 transition-colors"
              >
                执行铸币发行
              </button>
            </form>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
            * 铸币不扣除任何账户，直接由系统增发并计入总资产对账基数。
          </div>
        </div>

        {/* Panel 2: Transfer with 0.01% fee */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-100">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
                <ArrowRightLeft className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">2. 自由转账 (Transfer)</h3>
                <p className="text-xs text-slate-400 font-mono">扣 0.01% 手续费 · 向下取整</p>
              </div>
            </div>

            <form onSubmit={handleTransfer} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">流水号 (transaction_id)</label>
                <input
                  type="text"
                  value={transferTxId}
                  onChange={(e) => setTransferTxId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg bg-slate-50 font-mono text-slate-700"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">转出方 (from)</label>
                  <select
                    value={fromUser}
                    onChange={(e) => setFromUser(e.target.value)}
                    className="w-full px-2.5 py-2 border rounded-lg bg-white text-slate-700"
                  >
                    <option value="p_alice">Alice ({sandbox.getWallet("p_alice").balance})</option>
                    <option value="p_bob">Bob ({sandbox.getWallet("p_bob").balance})</option>
                    <option value="p_charlie">Charlie ({sandbox.getWallet("p_charlie").balance})</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">接收方 (to)</label>
                  <select
                    value={toUser}
                    onChange={(e) => setToUser(e.target.value)}
                    className="w-full px-2.5 py-2 border rounded-lg bg-white text-slate-700"
                  >
                    <option value="p_bob">Bob ({sandbox.getWallet("p_bob").balance})</option>
                    <option value="p_alice">Alice ({sandbox.getWallet("p_alice").balance})</option>
                    <option value="p_charlie">Charlie ({sandbox.getWallet("p_charlie").balance})</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">转账总额 (gross amount)</label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={transferAmount}
                  onChange={(e) => setTransferAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg bg-white font-mono text-slate-800 font-semibold"
                  required
                />
                <div className="flex gap-1.5 mt-1.5">
                  {[20000, 100000, 200000].map((val) => (
                    <button
                      type="button"
                      key={val}
                      onClick={() => setTransferAmount(val)}
                      className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[11px]"
                    >
                      {val.toLocaleString()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Fee Breakdown Box */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1 text-[11px]">
                <div className="flex justify-between text-slate-600">
                  <span>手续费率 (0.01%):</span>
                  <span className="font-mono text-amber-700 font-bold">{calculatedFee} 筹码 (进池)</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>接收方净到账:</span>
                  <span className="font-mono text-emerald-700 font-bold">{calculatedNet} 筹码</span>
                </div>
                <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-200">
                  公式: floor({transferAmount} × 0.0001) = {calculatedFee}
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold shadow-sm shadow-indigo-600/20 transition-colors"
              >
                确认自由转账
              </button>
            </form>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
            * 支出方 -{transferAmount} = 接收方 +{calculatedNet} + 费池 +{calculatedFee}
          </div>
        </div>

        {/* Panel 3: Game Settle & Commission Cascade */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2.5 pb-3 border-b border-slate-100">
              <div className="p-2 bg-emerald-50 text-emerald-600 rounded-xl">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">3. 牌局结算与分水 (Game Settle)</h3>
                <p className="text-xs text-slate-400 font-mono">德扑开源引擎 bridge 挂接</p>
              </div>
            </div>

            <form onSubmit={handleSettle} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-medium mb-1">结算流水号 (transaction_id)</label>
                <input
                  type="text"
                  value={settleTxId}
                  onChange={(e) => setSettleTxId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg bg-slate-50 font-mono text-slate-700"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">房间桌号 (room_id)</label>
                  <input
                    type="text"
                    value={settleRoom}
                    onChange={(e) => setSettleRoom(e.target.value)}
                    className="w-full px-2.5 py-2 border rounded-lg bg-white text-slate-700"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">本手赢家 (winner)</label>
                  <select
                    value={settleWinner}
                    onChange={(e) => setSettleWinner(e.target.value)}
                    className="w-full px-2.5 py-2 border rounded-lg bg-white text-slate-700"
                  >
                    <option value="p_charlie">Charlie (玩家)</option>
                    <option value="p_alice">Alice (玩家)</option>
                    <option value="p_bob">Bob (玩家)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-medium mb-1">总底池 (total_pot S)</label>
                <input
                  type="number"
                  step="1"
                  min="10"
                  value={settlePot}
                  onChange={(e) => setSettlePot(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg bg-white font-mono text-slate-800 font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-600 font-medium mb-1">房费抽水率 p</label>
                  <select
                    value={platformRakeRate}
                    onChange={(e) => setPlatformRakeRate(Number(e.target.value))}
                    className="w-full px-2 py-1.5 border rounded-lg bg-white text-slate-700"
                  >
                    <option value={0.05}>5.00% (标准)</option>
                    <option value={0.03}>3.00%</option>
                    <option value={0.08}>8.00%</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 font-medium mb-1">代理返佣率 a</label>
                  <select
                    value={agentRate}
                    onChange={(e) => setAgentRate(Number(e.target.value))}
                    className="w-full px-2 py-1.5 border rounded-lg bg-white text-slate-700"
                  >
                    <option value={0.03}>3.00% (标准)</option>
                    <option value={0.02}>2.00%</option>
                    <option value={0.04}>4.00%</option>
                  </select>
                </div>
              </div>

              {/* Settle breakdown */}
              <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-1 text-[11px]">
                <div className="flex justify-between text-slate-700">
                  <span>赢家实得 (S - 抽水):</span>
                  <span className="font-mono text-emerald-800 font-bold">{calculatedWinnerPayout} 筹码</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>代理返佣池 (S × a):</span>
                  <span className="font-mono text-indigo-700 font-bold">{calculatedAgentPool} 筹码</span>
                </div>
                <div className="flex justify-between text-slate-700">
                  <span>平台净留存 (抽水 - 返佣):</span>
                  <span className="font-mono text-amber-700 font-bold">{calculatedPlatformNet} 筹码</span>
                </div>
                <div className="text-[10px] text-emerald-700 pt-1 border-t border-emerald-200">
                  三级代理按 r_0=50%, r_1=30%, r_2=20% 级联分润
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold shadow-sm shadow-emerald-600/20 transition-colors"
              >
                模拟对局结束分账
              </button>
            </form>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
            * 严格满足: 赢家实得 + 代理各级佣金 + 平台留存 == 本局总底池 S
          </div>
        </div>
      </div>
    </div>
  );
};

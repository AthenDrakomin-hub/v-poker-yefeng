/**
 * UVdesk 嵌入式客诉追溯面板组件
 * 允许客服在工单内秒级查询玩家钱包余额、冻结状态及近期每一笔 transfer/settle 流水
 */
import React, { useState } from "react";

export const PlayerInspection: React.FC = () => {
  const [userId, setUserId] = useState("p_alice");
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:4000/api/support/player_profile?user_id=${userId}`);
      const json = await res.json();
      setProfile(json.data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-slate-50 border rounded-lg">
      <h3 className="font-semibold text-slate-800">玩家虚拟筹码账本检索</h3>
      <div className="flex gap-2 mt-3">
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="输入玩家ID (如 p_alice)"
          className="px-3 py-1.5 border rounded text-sm w-64 bg-white"
        />
        <button
          onClick={fetchProfile}
          className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          {loading ? "检索中..." : "全息排查"}
        </button>
      </div>

      {profile && (
        <div className="mt-4 bg-white p-3 border rounded text-sm">
          <div className="flex justify-between border-b pb-2">
            <span>用户ID: <strong>{profile.user_id}</strong></span>
            <span>可用余额: <strong className="text-emerald-600">{profile.wallet?.balance} 筹码</strong></span>
            <span>冻结余额: <strong className="text-amber-600">{profile.wallet?.frozen_balance} 筹码</strong></span>
          </div>
          <div className="mt-3">
            <span className="text-xs text-gray-400">近期关联流水 (前 5 笔)</span>
            <ul className="mt-1 space-y-1">
              {profile.recent_transactions?.map((tx: any) => (
                <li key={tx.transaction_id} className="text-xs text-gray-600 flex justify-between">
                  <span>{tx.transaction_id} [{tx.type}]</span>
                  <span>{tx.amount} 筹码 (手续费: {tx.fee})</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
};

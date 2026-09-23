/**
 * UVdesk 嵌入式客诉追溯面板组件
 * 允许客服在工单内秒级查询玩家钱包余额、冻结状态及近期每一笔 transfer/settle 流水
 * 视觉统一：深色 token，与后台其余页面一致。
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
    <div className="vp-card p-4">
      <h3 className="font-semibold text-vp-text">玩家虚拟筹码账本检索</h3>
      <div className="flex gap-2 mt-3">
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="输入玩家ID (如 p_alice)"
          className="px-3 py-1.5 border border-vp-border rounded-lg text-sm w-64 bg-vp-surface-2 text-vp-text outline-none focus:border-vp-gold"
        />
        <button
          onClick={fetchProfile}
          className="vp-btn-primary !px-4 !py-1.5 !text-sm"
        >
          {loading ? "检索中..." : "全息排查"}
        </button>
      </div>

      {profile && (
        <div className="mt-4 bg-vp-surface-2 p-3 border border-vp-border rounded-lg text-sm">
          <div className="flex justify-between border-b border-vp-border pb-2">
            <span className="text-vp-text">用户ID: <strong>{profile.user_id}</strong></span>
            <span className="text-vp-muted">可用余额: <strong className="text-vp-success">{profile.wallet?.balance} 筹码</strong></span>
            <span className="text-vp-muted">冻结余额: <strong className="text-vp-warning">{profile.wallet?.frozen_balance} 筹码</strong></span>
          </div>
          <div className="mt-3">
            <span className="text-xs text-vp-muted">近期关联流水 (前 5 笔)</span>
            <ul className="mt-1 space-y-1">
              {profile.recent_transactions?.map((tx: any) => (
                <li key={tx.transaction_id} className="text-xs text-vp-muted flex justify-between">
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

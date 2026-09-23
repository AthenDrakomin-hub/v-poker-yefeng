import { useState } from 'react';

/**
 * V-POKER 代理端仪表盘页面
 * 视觉统一：使用 packages/ui/theme.css 的 vp-* token。
 */

interface AgentDashboardProps {
  onLogout: () => void;
}

export default function AgentDashboard({ onLogout }: AgentDashboardProps) {
  const [stats] = useState({
    totalCommission: 125000,
    todayCommission: 3500,
    subAgents: 12,
    activePlayers: 45,
  });

  const [commissionList] = useState([
    { id: 1, date: '2024-01-15', amount: 1200, type: '德州扑克', player: 'player_alice' },
    { id: 2, date: '2024-01-15', amount: 800, type: '炸金花', player: 'player_bob' },
    { id: 3, date: '2024-01-14', amount: 2500, type: '德州扑克', player: 'player_charlie' },
    { id: 4, date: '2024-01-14', amount: 1500, type: '牛牛', player: 'player_david' },
  ]);

  return (
    <div className="min-h-screen bg-vp-ink">
      {/* 顶部导航 */}
      <header className="border-b border-vp-border bg-vp-surface px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img src="/assets/ui/logo.png" alt="V-POKER" className="h-10" />
            <h1 className="text-xl font-bold text-vp-gold">代理后台</h1>
          </div>
          <button onClick={onLogout} className="vp-btn-danger">退出登录</button>
        </div>
      </header>

      <div className="p-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="vp-card p-6">
            <div className="text-vp-muted text-sm mb-2">累计佣金</div>
            <div className="text-3xl font-bold text-vp-gold">{stats.totalCommission.toLocaleString()}</div>
          </div>
          <div className="vp-card p-6">
            <div className="text-vp-muted text-sm mb-2">今日佣金</div>
            <div className="text-3xl font-bold text-vp-success">{stats.todayCommission.toLocaleString()}</div>
          </div>
          <div className="vp-card p-6">
            <div className="text-vp-muted text-sm mb-2">下级代理</div>
            <div className="text-3xl font-bold text-vp-text">{stats.subAgents}</div>
          </div>
          <div className="vp-card p-6">
            <div className="text-vp-muted text-sm mb-2">活跃玩家</div>
            <div className="text-3xl font-bold text-vp-text">{stats.activePlayers}</div>
          </div>
        </div>

        {/* 佣金明细 */}
        <div className="vp-card p-6">
          <h2 className="text-xl font-bold text-vp-text mb-4">佣金明细</h2>
          <table className="w-full">
            <thead>
              <tr className="text-vp-muted text-sm">
                <th className="text-left py-3">日期</th>
                <th className="text-left py-3">游戏类型</th>
                <th className="text-left py-3">玩家</th>
                <th className="text-right py-3">佣金金额</th>
              </tr>
            </thead>
            <tbody>
              {commissionList.map((item) => (
                <tr key={item.id} className="border-t border-vp-border">
                  <td className="py-3 text-vp-text">{item.date}</td>
                  <td className="py-3 text-vp-text">{item.type}</td>
                  <td className="py-3 text-vp-text">{item.player}</td>
                  <td className="py-3 text-right text-vp-success">+{item.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

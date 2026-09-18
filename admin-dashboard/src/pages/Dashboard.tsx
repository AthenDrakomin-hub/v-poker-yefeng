import { useState } from 'react';

/**
 * V-POKER 管理端仪表盘页面
 * 视觉统一：全部使用 packages/ui/theme.css 的 vp-* token，不再用 Tailwind 默认灰板/随机色。
 */

interface AdminDashboardProps {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [stats] = useState({
    totalPlayers: 1250,
    activeRooms: 23,
    totalRevenue: 456000,
    feePool: 125000,
  });

  const [recentPlayers] = useState([
    { id: '1', username: 'player_alice', balance: 50000, created_at: '2024-01-15' },
    { id: '2', username: 'player_bob', balance: 30000, created_at: '2024-01-15' },
    { id: '3', username: 'player_charlie', balance: 80000, created_at: '2024-01-14' },
    { id: '4', username: 'player_david', balance: 45000, created_at: '2024-01-14' },
  ]);

  const statColor = 'text-3xl font-bold text-vp-gold';

  return (
    <div className="min-h-screen bg-vp-ink">
      {/* 顶部导航 */}
      <header className="border-b border-vp-border bg-vp-surface px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img src="/assets/ui/logo.png" alt="V-POKER" className="h-10" />
            <h1 className="text-xl font-bold text-vp-gold">管理后台</h1>
          </div>
          <button onClick={onLogout} className="vp-btn-danger">
            退出登录
          </button>
        </div>
      </header>

      <div className="p-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="vp-card p-6">
            <div className="text-vp-muted text-sm mb-2">总玩家数</div>
            <div className={statColor}>{stats.totalPlayers.toLocaleString()}</div>
          </div>
          <div className="vp-card p-6">
            <div className="text-vp-muted text-sm mb-2">活跃房间</div>
            <div className={statColor}>{stats.activeRooms}</div>
          </div>
          <div className="vp-card p-6">
            <div className="text-vp-muted text-sm mb-2">平台总收入</div>
            <div className={statColor}>{stats.totalRevenue.toLocaleString()}</div>
          </div>
          <div className="vp-card p-6">
            <div className="text-vp-muted text-sm mb-2">手续费池</div>
            <div className={statColor}>{stats.feePool.toLocaleString()}</div>
          </div>
        </div>

        {/* 最近注册玩家 */}
        <div className="vp-card p-6">
          <h2 className="text-xl font-bold text-vp-text mb-4">最近注册玩家</h2>
          <table className="w-full">
            <thead>
              <tr className="text-vp-muted text-sm">
                <th className="text-left py-3">用户名</th>
                <th className="text-left py-3">余额</th>
                <th className="text-left py-3">注册时间</th>
                <th className="text-right py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {recentPlayers.map((player) => (
                <tr key={player.id} className="border-t border-vp-border">
                  <td className="py-3 text-vp-text">{player.username}</td>
                  <td className="py-3 text-vp-gold">{player.balance.toLocaleString()}</td>
                  <td className="py-3 text-vp-muted">{player.created_at}</td>
                  <td className="py-3 text-right">
                    <button className="vp-btn-primary !px-3 !py-1 !text-sm">查看详情</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

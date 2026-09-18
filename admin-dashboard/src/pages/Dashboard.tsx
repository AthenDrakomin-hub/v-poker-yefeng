import { useState, useEffect } from 'react';

/**
 * V-POKER 管理端仪表盘页面
 */

interface AdminDashboardProps {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [stats, setStats] = useState({
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

  return (
    <div className="min-h-screen bg-gray-900">
      {/* 顶部导航 */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img src="/assets/ui/logo.png" alt="V-POKER" className="h-10" />
            <h1 className="text-xl font-bold text-amber-400">管理后台</h1>
          </div>
          <button
            onClick={onLogout}
            className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600"
          >
            退出登录
          </button>
        </div>
      </header>

      <div className="p-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-6 mb-8">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">总玩家数</div>
            <div className="text-3xl font-bold text-blue-400">{stats.totalPlayers.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">活跃房间</div>
            <div className="text-3xl font-bold text-green-400">{stats.activeRooms}</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">平台总收入</div>
            <div className="text-3xl font-bold text-amber-400">{stats.totalRevenue.toLocaleString()}</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">手续费池</div>
            <div className="text-3xl font-bold text-purple-400">{stats.feePool.toLocaleString()}</div>
          </div>
        </div>

        {/* 最近注册玩家 */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">最近注册玩家</h2>
          <table className="w-full">
            <thead>
              <tr className="text-gray-400 text-sm">
                <th className="text-left py-3">用户名</th>
                <th className="text-left py-3">余额</th>
                <th className="text-left py-3">注册时间</th>
                <th className="text-right py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {recentPlayers.map((player) => (
                <tr key={player.id} className="border-t border-gray-700">
                  <td className="py-3 text-gray-300">{player.username}</td>
                  <td className="py-3 text-amber-400">{player.balance.toLocaleString()}</td>
                  <td className="py-3 text-gray-300">{player.created_at}</td>
                  <td className="py-3 text-right">
                    <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-500">
                      查看详情
                    </button>
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

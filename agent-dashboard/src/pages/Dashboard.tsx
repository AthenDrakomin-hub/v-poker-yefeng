import { useState, useEffect } from 'react';

/**
 * V-POKER 代理端仪表盘页面
 */

interface AgentDashboardProps {
  onLogout: () => void;
}

export default function AgentDashboard({ onLogout }: AgentDashboardProps) {
  const [stats, setStats] = useState({
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
    <div className="min-h-screen bg-gray-900">
      {/* 顶部导航 */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img src="/assets/ui/logo.png" alt="V-POKER" className="h-10" />
            <h1 className="text-xl font-bold text-amber-400">代理后台</h1>
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
            <div className="text-gray-400 text-sm mb-2">累计佣金</div>
            <div className="text-3xl font-bold text-amber-400">
              {stats.totalCommission.toLocaleString()}
            </div>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">今日佣金</div>
            <div className="text-3xl font-bold text-green-400">
              {stats.todayCommission.toLocaleString()}
            </div>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">下级代理</div>
            <div className="text-3xl font-bold text-blue-400">{stats.subAgents}</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">活跃玩家</div>
            <div className="text-3xl font-bold text-purple-400">{stats.activePlayers}</div>
          </div>
        </div>

        {/* 佣金明细 */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">佣金明细</h2>
          <table className="w-full">
            <thead>
              <tr className="text-gray-400 text-sm">
                <th className="text-left py-3">日期</th>
                <th className="text-left py-3">游戏类型</th>
                <th className="text-left py-3">玩家</th>
                <th className="text-right py-3">佣金金额</th>
              </tr>
            </thead>
            <tbody>
              {commissionList.map((item) => (
                <tr key={item.id} className="border-t border-gray-700">
                  <td className="py-3 text-gray-300">{item.date}</td>
                  <td className="py-3 text-gray-300">{item.type}</td>
                  <td className="py-3 text-gray-300">{item.player}</td>
                  <td className="py-3 text-right text-green-400">+{item.amount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

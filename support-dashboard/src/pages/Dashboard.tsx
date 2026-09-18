import { useState } from 'react';

/**
 * V-POKER 客服端仪表盘页面
 */

interface SupportDashboardProps {
  onLogout: () => void;
}

export default function SupportDashboard({ onLogout }: SupportDashboardProps) {
  const [tickets] = useState([
    { id: '1', player: 'player_alice', subject: '筹码丢失问题', status: 'open', created_at: '2024-01-15 10:30' },
    { id: '2', player: 'player_bob', subject: '游戏卡顿', status: 'processing', created_at: '2024-01-15 09:15' },
    { id: '3', player: 'player_charlie', subject: '提现问题', status: 'closed', created_at: '2024-01-14 16:45' },
  ]);

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      open: 'bg-red-500/20 text-red-400',
      processing: 'bg-yellow-500/20 text-yellow-400',
      closed: 'bg-green-500/20 text-green-400',
    };
    const labels: Record<string, string> = {
      open: '待处理',
      processing: '处理中',
      closed: '已关闭',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs ${colors[status]}`}>
        {labels[status]}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-900">
      {/* 顶部导航 */}
      <header className="bg-gray-800 border-b border-gray-700 px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img src="/assets/ui/logo.png" alt="V-POKER" className="h-10" />
            <h1 className="text-xl font-bold text-amber-400">客服后台</h1>
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
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">待处理工单</div>
            <div className="text-3xl font-bold text-red-400">1</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">处理中</div>
            <div className="text-3xl font-bold text-yellow-400">1</div>
          </div>
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
            <div className="text-gray-400 text-sm mb-2">已关闭</div>
            <div className="text-3xl font-bold text-green-400">1</div>
          </div>
        </div>

        {/* 工单列表 */}
        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">工单列表</h2>
          <table className="w-full">
            <thead>
              <tr className="text-gray-400 text-sm">
                <th className="text-left py-3">工单号</th>
                <th className="text-left py-3">玩家</th>
                <th className="text-left py-3">问题</th>
                <th className="text-left py-3">状态</th>
                <th className="text-left py-3">时间</th>
                <th className="text-right py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id} className="border-t border-gray-700">
                  <td className="py-3 text-gray-300">#{ticket.id}</td>
                  <td className="py-3 text-gray-300">{ticket.player}</td>
                  <td className="py-3 text-gray-300">{ticket.subject}</td>
                  <td className="py-3">{getStatusBadge(ticket.status)}</td>
                  <td className="py-3 text-gray-300">{ticket.created_at}</td>
                  <td className="py-3 text-right">
                    <button className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-500">
                      处理
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

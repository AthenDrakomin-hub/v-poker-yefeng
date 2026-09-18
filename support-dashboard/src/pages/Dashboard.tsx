import { useState } from 'react';

/**
 * V-POKER 客服端仪表盘页面
 * 视觉统一：使用 packages/ui/theme.css 的 vp-* token，状态用语义色。
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
      open: 'bg-vp-danger/20 text-vp-danger',
      processing: 'bg-vp-warning/20 text-vp-warning',
      closed: 'bg-vp-success/20 text-vp-success',
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
    <div className="min-h-screen bg-vp-ink">
      {/* 顶部导航 */}
      <header className="border-b border-vp-border bg-vp-surface px-6 py-4">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-4">
            <img src="/assets/ui/logo.png" alt="V-POKER" className="h-10" />
            <h1 className="text-xl font-bold text-vp-gold">客服后台</h1>
          </div>
          <button onClick={onLogout} className="vp-btn-danger">退出登录</button>
        </div>
      </header>

      <div className="p-6">
        {/* 统计卡片 */}
        <div className="grid grid-cols-3 gap-6 mb-8">
          <div className="vp-card p-6">
            <div className="text-vp-muted text-sm mb-2">待处理工单</div>
            <div className="text-3xl font-bold text-vp-danger">1</div>
          </div>
          <div className="vp-card p-6">
            <div className="text-vp-muted text-sm mb-2">处理中</div>
            <div className="text-3xl font-bold text-vp-warning">1</div>
          </div>
          <div className="vp-card p-6">
            <div className="text-vp-muted text-sm mb-2">已关闭</div>
            <div className="text-3xl font-bold text-vp-success">1</div>
          </div>
        </div>

        {/* 工单列表 */}
        <div className="vp-card p-6">
          <h2 className="text-xl font-bold text-vp-text mb-4">工单列表</h2>
          <table className="w-full">
            <thead>
              <tr className="text-vp-muted text-sm">
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
                <tr key={ticket.id} className="border-t border-vp-border">
                  <td className="py-3 text-vp-text">#{ticket.id}</td>
                  <td className="py-3 text-vp-text">{ticket.player}</td>
                  <td className="py-3 text-vp-text">{ticket.subject}</td>
                  <td className="py-3">{getStatusBadge(ticket.status)}</td>
                  <td className="py-3 text-vp-muted">{ticket.created_at}</td>
                  <td className="py-3 text-right">
                    <button className="vp-btn-primary !px-3 !py-1 !text-sm">处理</button>
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

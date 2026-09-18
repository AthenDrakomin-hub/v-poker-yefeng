import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * V-POKER 排行榜页面
 */

interface RankItem {
  rank: number;
  user_id: string;
  username: string;
  avatar?: string;
  value: number;
  trend?: 'up' | 'down' | 'same';
}

// 排行榜标签页类型
type TabType = 'wealth' | 'winrate' | 'streak' | 'agent';

export default function Leaderboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabType>('wealth');
  const [data, setData] = useState<RankItem[]>([]);
  const [loading, setLoading] = useState(false);

  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'wealth', label: '财富榜', icon: '💰' },
    { id: 'winrate', label: '胜率榜', icon: '🎯' },
    { id: 'streak', label: '连胜榜', icon: '🔥' },
    { id: 'agent', label: '代理榜', icon: '👑' },
  ];

  useEffect(() => {
    loadData(activeTab);
  }, [activeTab]);

  const loadData = async (_tab: TabType) => {
    setLoading(true);
    // 模拟数据
    setTimeout(() => {
      const mockData: RankItem[] = [
        { rank: 1, user_id: 'player_king', username: '扑克之王', value: 1250000, trend: 'same' },
        { rank: 2, user_id: 'player_ace', username: 'Ace', value: 980000, trend: 'up' },
        { rank: 3, user_id: 'player_pro', username: '职业玩家', value: 850000, trend: 'down' },
        { rank: 4, user_id: 'player_lucky', username: '幸运星', value: 720000, trend: 'up' },
        { rank: 5, user_id: 'player_winner', username: '常胜将军', value: 650000, trend: 'same' },
        { rank: 6, user_id: 'player_master', username: '大师', value: 580000, trend: 'down' },
        { rank: 7, user_id: 'player_champ', username: '冠军', value: 520000, trend: 'up' },
        { rank: 8, user_id: 'player_expert', username: '专家', value: 450000, trend: 'same' },
        { rank: 9, user_id: 'player_novice', username: '新手', value: 380000, trend: 'down' },
        { rank: 10, user_id: 'player_beginner', username: '初学者', value: 320000, trend: 'up' },
      ];
      setData(mockData);
      setLoading(false);
    }, 500);
  };

  const getRankStyle = (rank: number) => {
    if (rank === 1) return { color: '#ffd700', bg: 'rgba(255, 215, 0, 0.1)' };
    if (rank === 2) return { color: '#c0c0c0', bg: 'rgba(192, 192, 192, 0.1)' };
    if (rank === 3) return { color: '#cd7f32', bg: 'rgba(205, 127, 50, 0.1)' };
    return { color: '#9ca3af', bg: 'rgba(255, 255, 255, 0.05)' };
  };

  const getTrendIcon = (trend?: 'up' | 'down' | 'same') => {
    if (trend === 'up') return '📈';
    if (trend === 'down') return '📉';
    return '➡️';
  };

  const formatValue = (value: number, tab: TabType) => {
    if (tab === 'winrate') return `${value}%`;
    return value.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-vp-black p-6">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="mb-8">
          <button
            onClick={() => navigate('/')}
            className="text-vp-text-muted hover:text-vp-gold transition-colors mb-4"
          >
            ← 返回大厅
          </button>
          <h1 className="text-3xl font-bold text-vp-gold">🏆 排行榜</h1>
        </div>

        {/* 标签页 */}
        <div className="grid grid-cols-4 gap-2 mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`p-4 rounded-xl transition-all ${
                activeTab === tab.id
                  ? 'bg-vp-gold/20 border border-vp-gold/50 text-vp-gold'
                  : 'bg-white/5 border border-white/10 text-vp-text-muted hover:bg-white/10'
              }`}
            >
              <div className="text-2xl mb-1">{tab.icon}</div>
              <div className="text-sm font-medium">{tab.label}</div>
            </button>
          ))}
        </div>

        {/* 排行榜列表 */}
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-vp-text-muted">加载中...</div>
          ) : (
            data.map((item) => {
              const rankStyle = getRankStyle(item.rank);
              return (
                <div
                  key={item.rank}
                  className="glass-card p-4 flex items-center gap-4 hover:border-vp-gold/30 transition-colors"
                >
                  {/* 排名 */}
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg"
                    style={rankStyle}
                  >
                    {item.rank}
                  </div>

                  {/* 用户信息 */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-lg">{item.username}</span>
                      {item.rank <= 3 && <span className="text-xl">👑</span>}
                    </div>
                    <p className="text-sm text-vp-text-muted">ID: {item.user_id}</p>
                  </div>

                  {/* 数值 */}
                  <div className="text-right">
                    <div className="text-xl font-bold text-vp-gold">
                      {formatValue(item.value, activeTab)}
                    </div>
                    <div className="text-sm text-vp-text-muted">
                      {getTrendIcon(item.trend)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

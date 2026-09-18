import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * V-POKER 成就系统页面
 */

interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  unlocked: boolean;
  progress: number; // 0-100
  reward?: number;
}

export default function Achievements() {
  const navigate = useNavigate();
  const [achievements] = useState<Achievement[]>([
    {
      id: 'first_win',
      name: '初出茅庐',
      description: '赢得第一场比赛',
      icon: '🏅',
      unlocked: true,
      progress: 100,
      reward: 1000,
    },
    {
      id: 'ten_wins',
      name: '小有所成',
      description: '累计赢得 10 场比赛',
      icon: '🥈',
      unlocked: true,
      progress: 100,
      reward: 5000,
    },
    {
      id: 'fifty_wins',
      name: '身经百战',
      description: '累计赢得 50 场比赛',
      icon: '🥇',
      unlocked: false,
      progress: 60,
      reward: 20000,
    },
    {
      id: 'hundred_wins',
      name: '百场战神',
      description: '累计赢得 100 场比赛',
      icon: '💎',
      unlocked: false,
      progress: 30,
      reward: 50000,
    },
    {
      id: 'five_streak',
      name: '势不可挡',
      description: '连续赢得 5 场比赛',
      icon: '🔥',
      unlocked: true,
      progress: 100,
      reward: 8000,
    },
    {
      id: 'ten_streak',
      name: '十连胜',
      description: '连续赢得 10 场比赛',
      icon: '⚡',
      unlocked: false,
      progress: 50,
      reward: 15000,
    },
    {
      id: 'first_deposit',
      name: '金主驾到',
      description: '首次充值（本平台无充值，改为首次铸币领取）',
      icon: '💰',
      unlocked: true,
      progress: 100,
      reward: 2000,
    },
    {
      id: 'vip_bronze',
      name: '青铜 VIP',
      description: '累计游玩达到 10 小时',
      icon: '🏆',
      unlocked: true,
      progress: 100,
      reward: 3000,
    },
    {
      id: 'vip_silver',
      name: '白银 VIP',
      description: '累计游玩达到 50 小时',
      icon: '🏆',
      unlocked: false,
      progress: 40,
      reward: 10000,
    },
    {
      id: 'vip_gold',
      name: '黄金 VIP',
      description: '累计游玩达到 100 小时',
      icon: '👑',
      unlocked: false,
      progress: 20,
      reward: 30000,
    },
    {
      id: 'friend_first',
      name: '交友广泛',
      description: '添加 1 个好友',
      icon: '👥',
      unlocked: true,
      progress: 100,
      reward: 500,
    },
    {
      id: 'friend_ten',
      name: '人脉广阔',
      description: '添加 10 个好友',
      icon: '🤝',
      unlocked: false,
      progress: 30,
      reward: 5000,
    },
  ]);

  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  const totalCount = achievements.length;
  const progressPercent = Math.round((unlockedCount / totalCount) * 100);

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
          <h1 className="text-3xl font-bold text-vp-gold mb-2">🏅 成就系统</h1>
          <p className="text-vp-text-muted">
            已解锁 {unlockedCount}/{totalCount} 个成就
          </p>

          {/* 进度条 */}
          <div className="mt-4 h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-vp-gold-dark to-vp-gold transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* 成就网格 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {achievements.map((achievement) => (
            <div
              key={achievement.id}
              className={`glass-card p-4 transition-all ${
                achievement.unlocked
                  ? 'border-vp-gold/30'
                  : 'opacity-60'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* 图标 */}
                <div
                  className={`w-14 h-14 rounded-full flex items-center justify-center text-3xl ${
                    achievement.unlocked
                      ? 'bg-vp-gold/20 border-2 border-vp-gold/50'
                      : 'bg-white/5 border-2 border-white/10'
                  }`}
                >
                  {achievement.icon}
                </div>

                {/* 内容 */}
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-lg">{achievement.name}</h3>
                    {achievement.unlocked && (
                      <span className="text-xs px-2 py-0.5 bg-vp-gold/20 text-vp-gold rounded-full">
                        已解锁
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-vp-text-muted mb-2">
                    {achievement.description}
                  </p>

                  {/* 进度条 */}
                  {!achievement.unlocked && (
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-2">
                      <div
                        className="h-full bg-vp-gold"
                        style={{ width: `${achievement.progress}%` }}
                      />
                    </div>
                  )}

                  {/* 奖励 */}
                  {achievement.reward && (
                    <p className="text-xs text-vp-text-muted">
                      奖励: <span className="text-vp-gold">{achievement.reward.toLocaleString()} 筹码</span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

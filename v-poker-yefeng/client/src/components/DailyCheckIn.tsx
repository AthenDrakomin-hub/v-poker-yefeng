import { useState } from 'react';

/**
 * V-POKER 每日签到组件
 */

interface DailyCheckInProps {
  onClose: () => void;
  onCheckIn: (reward: number) => void;
}

// 签到奖励配置（连续签到）
const checkInRewards = [
  { day: 1, reward: 1000, label: '第1天' },
  { day: 2, reward: 2000, label: '第2天' },
  { day: 3, reward: 3000, label: '第3天' },
  { day: 4, reward: 5000, label: '第4天' },
  { day: 5, reward: 8000, label: '第5天' },
  { day: 6, reward: 12000, label: '第6天' },
  { day: 7, reward: 20000, label: '第7天' },
];

export default function DailyCheckIn({ onClose, onCheckIn }: DailyCheckInProps) {
  const [currentStreak, setCurrentStreak] = useState(3); // 当前连续签到天数
  const [checkedToday, setCheckedToday] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCheckIn = async () => {
    setLoading(true);
    try {
      // 这里调用后端 API
      const nextDay = currentStreak + 1;
      const reward = checkInRewards[(nextDay - 1) % 7].reward;

      setTimeout(() => {
        setCheckedToday(true);
        setCurrentStreak(nextDay);
        onCheckIn(reward);
        setLoading(false);
      }, 1000);
    } catch (err) {
      setLoading(false);
      alert('签到失败，请重试');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="glass-card p-8 w-full max-w-md mx-4">
        {/* 头部 */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-vp-gold mb-2">🎁 每日签到</h2>
          <p className="text-vp-text-muted">连续签到赢取更多筹码</p>
        </div>

        {/* 签到日历 */}
        <div className="grid grid-cols-7 gap-2 mb-6">
          {checkInRewards.map((item, index) => {
            const isChecked = index < currentStreak % 7 || (index === currentStreak % 7 && checkedToday);
            const isToday = index === currentStreak % 7;

            return (
              <div
                key={item.day}
                className={`flex flex-col items-center p-2 rounded-lg border ${
                  isChecked
                    ? 'bg-vp-gold/20 border-vp-gold/50'
                    : isToday && !checkedToday
                    ? 'bg-white/5 border-vp-gold/30'
                    : 'bg-white/5 border-white/10'
                }`}
              >
                <span className="text-xs text-vp-text-muted mb-1">{item.label}</span>
                <span className={`text-lg font-bold ${isChecked ? 'text-vp-gold' : 'text-vp-text'}`}>
                  {item.reward.toLocaleString()}
                </span>
                {isChecked && <span className="text-xs mt-1">✅</span>}
              </div>
            );
          })}
        </div>

        {/* 当前连续天数 */}
        <div className="text-center mb-6">
          <p className="text-vp-text-muted">
            已连续签到 <span className="text-vp-gold font-bold">{currentStreak}</span> 天
          </p>
        </div>

        {/* 签到按钮 */}
        {!checkedToday ? (
          <button
            onClick={handleCheckIn}
            disabled={loading}
            className="btn-gold w-full mb-4"
          >
            {loading ? '签到中...' : '立即签到'}
          </button>
        ) : (
          <div className="text-center mb-4 p-4 bg-vp-gold/10 rounded-lg">
            <p className="text-vp-gold font-bold">🎉 签到成功！</p>
            <p className="text-vp-text-muted text-sm mt-1">
              获得 {checkInRewards[currentStreak % 7].reward.toLocaleString()} 筹码
            </p>
          </div>
        )}

        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-white/5 border border-white/20 rounded-lg hover:bg-white/10 transition-colors"
        >
          {checkedToday ? '关闭' : '取消'}
        </button>
      </div>
    </div>
  );
}

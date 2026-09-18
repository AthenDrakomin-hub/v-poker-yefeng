import { useState } from 'react';

/**
 * V-POKER 新手引导组件
 */

interface GuideStep {
  title: string;
  description: string;
  icon: string;
}

interface OnboardingGuideProps {
  onComplete: () => void;
}

const guideSteps: GuideStep[] = [
  {
    title: '欢迎来到 V-POKER',
    description: '高端棋牌竞技平台，纯筹码对战，无充值无提现，公平透明。',
    icon: '👋',
  },
  {
    title: '选择游戏',
    description: '我们提供 4 款经典棋牌游戏：德州扑克、炸金花、牛牛、三公。选择你喜欢的游戏开始吧！',
    icon: '🎮',
  },
  {
    title: '快速赛',
    description: '点击「快速匹配」，3 秒开局，3 分钟一局，碎片时间也能玩得尽兴。',
    icon: '⚡',
  },
  {
    title: '好友对战',
    description: '创建私密房间，邀请好友一起对战。房间号 + 密码，私密又安全。',
    icon: '👥',
  },
  {
    title: '每日签到',
    description: '每天登录签到，连续 7 天可赢取 20000 筹码大奖，越签越多！',
    icon: '🎁',
  },
  {
    title: '成就系统',
    description: '完成各种成就任务，赢取额外筹码奖励。百场战神、十连胜等你解锁！',
    icon: '🏅',
  },
  {
    title: '公平保证',
    description: '所有对局都可回放，资金能量守恒审计，每一分筹码都有据可查。',
    icon: '🛡️',
  },
];

export default function OnboardingGuide({ onComplete }: OnboardingGuideProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const step = guideSteps[currentStep];
  const isLastStep = currentStep === guideSteps.length - 1;

  const handleNext = () => {
    if (isLastStep) {
      localStorage.setItem('vpoker_onboarded', 'true');
      onComplete();
    } else {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentStep((prev) => prev + 1);
        setIsAnimating(false);
      }, 300);
    }
  };

  const handleSkip = () => {
    localStorage.setItem('vpoker_onboarded', 'true');
    onComplete();
  };

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50">
      <div className="glass-card p-8 w-full max-w-lg mx-4 relative overflow-hidden">
        {/* 跳过按钮 */}
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 text-sm text-vp-text-muted hover:text-vp-gold transition-colors"
        >
          跳过 →
        </button>

        {/* 步骤指示器 */}
        <div className="flex justify-center gap-2 mb-8">
          {guideSteps.map((_, index) => (
            <div
              key={index}
              className={`h-2 rounded-full transition-all ${
                index === currentStep
                  ? 'w-8 bg-vp-gold'
                  : index < currentStep
                  ? 'w-2 bg-vp-gold/50'
                  : 'w-2 bg-white/20'
              }`}
            />
          ))}
        </div>

        {/* 内容 */}
        <div
          className={`text-center transition-all duration-300 ${
            isAnimating ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'
          }`}
        >
          {/* 图标 */}
          <div className="text-8xl mb-6 animate-bounce">
            {step.icon}
          </div>

          {/* 标题 */}
          <h2 className="text-2xl font-bold text-vp-gold mb-4">
            {step.title}
          </h2>

          {/* 描述 */}
          <p className="text-vp-text-muted leading-relaxed mb-8">
            {step.description}
          </p>

          {/* 下一步按钮 */}
          <button
            onClick={handleNext}
            className="btn-gold w-full"
          >
            {isLastStep ? '开始游戏 🎮' : '下一步 →'}
          </button>
        </div>

        {/* 进度文字 */}
        <p className="text-center text-sm text-vp-text-muted mt-6">
          {currentStep + 1} / {guideSteps.length}
        </p>
      </div>
    </div>
  );
}

/**
 * 检查是否需要显示新手引导
 */
export function shouldShowOnboarding(): boolean {
  return !localStorage.getItem('vpoker_onboarded');
}

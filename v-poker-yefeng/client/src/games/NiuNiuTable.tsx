import { useState } from 'react';

/**
 * 牛牛游戏组件
 * 特点：抢庄模式 + 通比模式
 */

interface NiuNiuTableProps {
  roomState: any;
  userId: string;
  onAction: (actionType: string, amount?: number) => void;
  isMyTurn: boolean;
}

export default function NiuNiuTable({ roomState, userId, onAction, isMyTurn }: NiuNiuTableProps) {
  const [mode] = useState<'banker' | 'all'>('banker'); // 抢庄模式/通比模式

  // 我的座位
  const mySeat = roomState?.seats?.find((s: any) => s.user_id === userId);
  const myCards = mySeat?.hole_cards || [];

  // 抢庄动作
  const handleBecomeBanker = () => {
    onAction('become_banker');
  };

  // 获取牌型描述
  const getNiuType = (cards: string[]) => {
    if (!cards || cards.length !== 5) return '';
    // 简化版牛牛判断
    const values = cards.map((c) => {
      const v = parseInt(c[1] || c);
      return isNaN(v) ? 0 : Math.min(v, 10);
    });

    // 尝试找 3 张凑 10 的倍数
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 4; j++) {
        for (let k = j + 1; k < 5; k++) {
          const sum = values[i] + values[j] + values[k];
          if (sum % 10 === 0) {
            const remaining = values.filter((_, idx) => idx !== i && idx !== j && idx !== k);
            const niu = (remaining[0] + remaining[1]) % 10;
            if (niu === 0) return '牛牛';
            return `牛${niu}`;
          }
        }
      }
    }
    return '没牛';
  };

  // 获取倍数
  const getMultiplier = (niuType: string) => {
    switch (niuType) {
      case '牛牛': return 4;
      case '牛9': return 3;
      case '牛8': return 2;
      case '牛7': return 2;
      default: return 1;
    }
  };

  const myNiuType = myCards.length === 5 ? getNiuType(myCards) : '';
  const multiplier = myNiuType ? getMultiplier(myNiuType) : 1;

  return (
    <div style={styles.container}>
      {/* 游戏标题 */}
      <div style={styles.titleBar}>
        <h3 style={styles.title}>🐂 牛牛</h3>
        <div style={styles.modeBadge}>
          {mode === 'banker' ? '🏦 抢庄模式' : '⚖️ 通比模式'}
        </div>
      </div>

      {/* 庄家显示 */}
      {roomState?.banker_id && (
        <div style={styles.bankerBadge}>
          👑 庄家: {roomState.banker_id}
        </div>
      )}

      {/* 桌面区域 */}
      <div style={styles.table}>
        {/* 底池 */}
        <div style={styles.pot}>
          底池: {roomState?.round_state?.total_pot || 0}
        </div>

        {/* 我的手牌 */}
        <div style={styles.myCards}>
          <div style={styles.cardsLabel}>我的手牌</div>
          <div style={styles.cardsRow}>
            {myCards.map((card: string, idx: number) => (
              <div key={idx} style={styles.card}>
                {card}
              </div>
            ))}
          </div>
          {myCards.length === 5 && (
            <div style={styles.niuInfo}>
              <div style={styles.niuType}>{myNiuType}</div>
              <div style={styles.multiplier}>×{multiplier}</div>
            </div>
          )}
        </div>

        {/* 抢庄按钮 */}
        {isMyTurn && !roomState?.banker_id && (
          <button style={styles.bankerBtn} onClick={handleBecomeBanker}>
            🏦 抢庄
          </button>
        )}

        {/* 其他玩家座位 */}
        <div style={styles.otherPlayers}>
          {roomState?.seats?.filter((s: any) => s.user_id !== userId).map((seat: any, idx: number) => (
            <div
              key={idx}
              style={{
                ...styles.playerSeat,
                ...(seat.user_id === roomState?.banker_id ? styles.bankerSeat : {}),
              }}
            >
              {seat.user_id === roomState?.banker_id && (
                <div style={styles.crown}>👑</div>
              )}
              <div style={styles.playerName}>{seat.user_id}</div>
              <div style={styles.playerChips}>筹码: {seat.chips}</div>
              {seat.current_bet > 0 && (
                <div style={styles.playerBet}>下注: {seat.current_bet}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 操作按钮 */}
      {isMyTurn && !roomState?.banker_id && (
        <div style={styles.actions}>
          <button style={styles.betBtn} onClick={() => onAction('bet', 100)}>
            下注 100
          </button>
          <button style={styles.betBtn} onClick={() => onAction('bet', 500)}>
            下注 500
          </button>
          <button style={styles.betBtn} onClick={() => onAction('bet', 1000)}>
            下注 1000
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
  },
  titleBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px',
  },
  title: {
    color: 'var(--vp-success)',
    fontSize: '24px',
    margin: 0,
  },
  modeBadge: {
    background: 'rgba(16, 185, 129, 0.2)',
    color: 'var(--vp-success)',
    padding: '4px 12px',
    borderRadius: '16px',
    fontSize: '14px',
  },
  bankerBadge: {
    textAlign: 'center',
    color: 'var(--vp-warning)',
    fontSize: '16px',
    marginBottom: '10px',
  },
  table: {
    background: 'linear-gradient(135deg, var(--vp-felt) 0%, var(--vp-felt) 100%)',
    padding: '30px',
    borderRadius: '30px',
    border: '3px solid var(--vp-success)',
    position: 'relative',
  },
  pot: {
    textAlign: 'center',
    color: 'var(--vp-warning)',
    fontSize: '20px',
    fontWeight: 'bold',
    marginBottom: '20px',
  },
  myCards: {
    textAlign: 'center',
    marginBottom: '20px',
  },
  cardsLabel: {
    color: '#fff',
    fontSize: '14px',
    marginBottom: '10px',
  },
  cardsRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '10px',
  },
  card: {
    width: '50px',
    height: '70px',
    background: '#fff',
    borderRadius: '6px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '20px',
    fontWeight: 'bold',
    boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
  },
  niuInfo: {
    marginTop: '10px',
  },
  niuType: {
    color: 'var(--vp-warning)',
    fontSize: '20px',
    fontWeight: 'bold',
  },
  multiplier: {
    color: 'var(--vp-danger)',
    fontSize: '16px',
  },
  bankerBtn: {
    display: 'block',
    margin: '0 auto 20px',
    padding: '10px 24px',
    background: 'rgba(251, 191, 36, 0.2)',
    color: 'var(--vp-warning)',
    border: '2px solid var(--vp-warning)',
    borderRadius: '24px',
    cursor: 'pointer',
    fontSize: '16px',
  },
  otherPlayers: {
    display: 'flex',
    justifyContent: 'center',
    gap: '20px',
    marginTop: '20px',
  },
  playerSeat: {
    background: 'rgba(0,0,0,0.4)',
    padding: '15px',
    borderRadius: '8px',
    textAlign: 'center',
    minWidth: '120px',
    position: 'relative',
  },
  bankerSeat: {
    border: '2px solid var(--vp-warning)',
  },
  crown: {
    position: 'absolute',
    top: '-15px',
    left: '50%',
    transform: 'translateX(-50%)',
    fontSize: '20px',
  },
  playerName: {
    color: '#fff',
    fontWeight: 'bold',
    marginBottom: '8px',
  },
  playerChips: {
    color: 'var(--vp-warning)',
    fontSize: '14px',
  },
  playerBet: {
    color: 'var(--vp-danger)',
    fontSize: '14px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
    marginTop: '20px',
  },
  betBtn: {
    padding: '10px 20px',
    background: 'var(--vp-success)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
};

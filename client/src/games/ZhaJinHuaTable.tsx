import { useState } from 'react';

/**
 * 炸金花游戏组件
 * 特点：闷牌/看牌/比牌
 */

interface ZhaJinHuaTableProps {
  roomState: any;
  userId: string;
  onAction: (actionType: string, amount?: number) => void;
  isMyTurn: boolean;
}

export default function ZhaJinHuaTable({ roomState, userId, onAction, isMyTurn }: ZhaJinHuaTableProps) {
  const [isBlind, setIsBlind] = useState(true); // 是否闷牌
  const [showCards, setShowCards] = useState(false); // 是否看了牌

  // 我的座位
  const mySeat = roomState?.seats?.find((s: any) => s.user_id === userId);
  const myCards = mySeat?.hole_cards || [];

  // 看牌动作
  const handleSeeCards = () => {
    setIsBlind(false);
    setShowCards(true);
    onAction('see_cards');
  };

  // 比牌动作
  const handleCompare = (_targetUserId: string) => {
    onAction('compare', undefined);
  };

  // 获取牌型描述
  const getCardType = (cards: string[]) => {
    if (!cards || cards.length === 0) return '';
    if (cards.length === 3) {
      // 简化版牌型判断
      const values = cards.map((c) => c[1] || c);
      if (values[0] === values[1] && values[1] === values[2]) return '豹子';
      if (values[0] === values[1] || values[1] === values[2] || values[0] === values[2]) return '对子';
      return '单张';
    }
    return '';
  };

  return (
    <div style={styles.container}>
      {/* 游戏标题 */}
      <div style={styles.titleBar}>
        <h3 style={styles.title}>🃏 炸金花</h3>
        <div style={styles.blindStatus}>
          {showCards ? (
            <span style={styles.seenBadge}>👁️ 已看牌</span>
          ) : (
            <span style={styles.blindBadge}>🌫️ 闷牌中</span>
          )}
        </div>
      </div>

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
              <div
                key={idx}
                style={{
                  ...styles.card,
                  ...(showCards ? styles.cardSeen : styles.cardBlind),
                }}
              >
                {showCards ? card : '?'}
              </div>
            ))}
          </div>
          {myCards.length > 0 && (
            <div style={styles.cardType}>{getCardType(myCards)}</div>
          )}
        </div>

        {/* 看牌按钮 */}
        {!showCards && isMyTurn && (
          <button style={styles.seeBtn} onClick={handleSeeCards}>
            👁️ 看牌
          </button>
        )}

        {/* 其他玩家座位 */}
        <div style={styles.otherPlayers}>
          {roomState?.seats?.filter((s: any) => s.user_id !== userId).map((seat: any, idx: number) => (
            <div key={idx} style={styles.playerSeat}>
              <div style={styles.playerName}>{seat.user_id}</div>
              <div style={styles.playerChips}>筹码: {seat.chips}</div>
              {seat.current_bet > 0 && (
                <div style={styles.playerBet}>下注: {seat.current_bet}</div>
              )}
              {/* 其他玩家的牌 */}
              <div style={styles.otherCards}>
                {[0, 1, 2].map((i) => (
                  <div key={i} style={{ ...styles.card, ...styles.cardBlind, width: 36, height: 50, fontSize: 16 }}>
                    ?
                  </div>
                ))}
              </div>
              {/* 比牌按钮 */}
              {isMyTurn && (
                <button
                  style={styles.compareBtn}
                  onClick={() => handleCompare(seat.user_id)}
                >
                  ⚔️ 比牌
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* 操作按钮 */}
      {isMyTurn && (
        <div style={styles.actions}>
          <button style={styles.foldBtn} onClick={() => onAction('fold')}>
            弃牌
          </button>
          <button style={styles.callBtn} onClick={() => onAction('call')}>
            {isBlind ? '跟注(半价)' : '跟注'}
          </button>
          <button style={styles.raiseBtn} onClick={() => onAction('raise', 200)}>
            加注
          </button>
          <button style={styles.allInBtn} onClick={() => onAction('all_in', 1000)}>
            全下
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
    color: 'var(--vp-warning)',
    fontSize: '24px',
    margin: 0,
  },
  blindStatus: {},
  seenBadge: {
    background: 'rgba(16, 185, 129, 0.2)',
    color: 'var(--vp-success)',
    padding: '4px 12px',
    borderRadius: '16px',
    fontSize: '14px',
  },
  blindBadge: {
    background: 'rgba(245, 158, 11, 0.2)',
    color: 'var(--vp-warning)',
    padding: '4px 12px',
    borderRadius: '16px',
    fontSize: '14px',
  },
  table: {
    background: 'linear-gradient(135deg, var(--vp-gold-press) 0%, var(--vp-gold-press) 100%)',
    padding: '30px',
    borderRadius: '30px',
    border: '3px solid var(--vp-warning)',
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
    gap: '10px',
    marginBottom: '10px',
  },
  card: {
    width: '60px',
    height: '80px',
    background: '#fff',
    borderRadius: '6px',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    fontSize: '24px',
    fontWeight: 'bold',
    boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
  },
  cardSeen: {
    border: '2px solid var(--vp-success)',
  },
  cardBlind: {
    background: 'linear-gradient(135deg, var(--vp-info) 0%, var(--vp-info) 100%)',
    color: 'var(--vp-warning)',
  },
  cardType: {
    color: 'var(--vp-warning)',
    fontSize: '14px',
  },
  seeBtn: {
    display: 'block',
    margin: '0 auto 20px',
    padding: '8px 20px',
    background: 'rgba(245, 158, 11, 0.2)',
    color: 'var(--vp-warning)',
    border: '1px solid var(--vp-warning)',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '14px',
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
  otherCards: {
    display: 'flex',
    justifyContent: 'center',
    gap: '4px',
    margin: '10px 0',
  },
  compareBtn: {
    padding: '4px 12px',
    background: 'rgba(239, 68, 68, 0.2)',
    color: 'var(--vp-danger)',
    border: '1px solid var(--vp-danger)',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'center',
    gap: '12px',
    marginTop: '20px',
  },
  foldBtn: {
    padding: '10px 20px',
    background: '#666',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  callBtn: {
    padding: '10px 20px',
    background: 'var(--vp-success)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  raiseBtn: {
    padding: '10px 20px',
    background: 'var(--vp-warning)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  allInBtn: {
    padding: '10px 20px',
    background: 'var(--vp-danger)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
};

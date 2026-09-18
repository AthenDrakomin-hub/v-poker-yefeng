import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { gameClient } from "../ws/gameSocket";
import type { RoomState } from "../ws/gameSocket";
import { api } from "../api/client";
import { soundManager } from "../utils/sound";
import ZhaJinHuaTable from "../games/ZhaJinHuaTable";
import NiuNiuTable from "../games/NiuNiuTable";
import SanGongTable from "../games/SanGongTable";

/** 每轮操作倒计时（秒） */
const ACTION_TIMEOUT = 15;

export default function PokerTable() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const userId = localStorage.getItem('vp_user_id') || '';
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [balance, setBalance] = useState(0);
  const [message, setMessage] = useState("");
  const [settleResult, setSettleResult] = useState<any>(null);
  const [countdown, setCountdown] = useState(ACTION_TIMEOUT);
  const [gameType, setGameType] = useState<string>("texas_holdem"); // 默认德州
  const timerRef = useRef<number | null>(null);

  // 初始化：创建房间 + 加载余额 + 连接 WebSocket
  useEffect(() => {
    if (!roomId) return;
    initRoom();
    loadBalance();

    // 连接 WebSocket 实时推送
    gameClient.connect(roomId, userId);

    // 订阅状态更新
    const unsubscribe = gameClient.onStateUpdate((state) => {
      setRoomState(state);
      // 检查是否进入结算阶段
      if (state.round_state?.phase === "SETTLING") {
        handleSettle();
      }
    });

    return () => {
      unsubscribe();
      gameClient.disconnect();
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [roomId, userId]);

  // 倒计时逻辑：轮到当前玩家行动时启动
  useEffect(() => {
    const isMyTurn = roomState?.round_state?.current_turn_seat_index !== undefined
      && roomState?.seats?.[roomState.round_state.current_turn_seat_index]?.user_id === userId
      && roomState?.round_state?.phase === "BETTING";

    if (isMyTurn) {
      // 开始倒计时
      setCountdown(ACTION_TIMEOUT);
      timerRef.current = window.setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            // 倒计时结束，自动执行默认动作
            clearInterval(timerRef.current!);
            handleTimeoutAction();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      // 不是我的回合，清除计时器
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [roomState?.round_state?.current_turn_seat_index, roomState?.round_state?.phase]);

  /** 倒计时结束自动执行默认动作 */
  const handleTimeoutAction = async () => {
    // 如果当前有人下注，默认弃牌；否则默认过牌
    const highestBet = roomState?.round_state?.current_highest_bet || 0;
    const myCurrentBet = roomState?.seats?.find((s) => s.user_id === userId)?.current_bet || 0;

    if (highestBet > myCurrentBet) {
      await handleAction("fold");
      setMessage("⏰ 超时自动弃牌");
    } else {
      await handleAction("check");
      setMessage("⏰ 超时自动过牌");
    }
  };

  const initRoom = async () => {
    try {
      await gameClient.createRoom(roomId!, "texas_holdem", "fixed", 100);
      console.log("房间创建成功:", roomId);
    } catch (err) {
      console.log("房间可能已存在:", err);
    }
    // 首次加载用 HTTP
    const state = await gameClient.getRoomState(roomId!);
    if (state) {
      setRoomState(state);
      // 设置游戏类型
      if (state.room?.game_type) {
        setGameType(state.room.game_type);
      }
    }
  };

  const loadBalance = async () => {
    try {
      const data = await api.getBalance(userId);
      setBalance(data.balance);
    } catch (err) {
      console.error("Failed to load balance:", err);
    }
  };

  const handleAction = async (actionType: string, amount?: number) => {
    try {
      // 播放按钮音效
      soundManager.playClick();

      const res = await gameClient.performAction(roomId!, userId, {
        action_type: actionType as any,
        user_id: userId,
        amount
      });

      if (res.code === 0) {
        // 根据动作类型播放不同音效
        if (actionType === 'call' || actionType === 'raise' || actionType === 'bet') {
          soundManager.playChipBet();
        } else if (actionType === 'check' || actionType === 'fold') {
          soundManager.playFlipCard();
        }
        setMessage(`✅ 动作成功: ${actionType}`);
      } else {
        setMessage(`❌ ${res.message}`);
      }
    } catch (err: any) {
      setMessage(`❌ ${err.message}`);
    }
  };

  const handleSettle = async () => {
    try {
      const res = await gameClient.settleRound(roomId!);
      if (res.code === 0) {
        setSettleResult(res.data);
        setMessage("🎉 本局结算完成！");

        // 播放结算音效
        soundManager.playSettle();

        // 检查是否赢牌
        const winners = res.data?.request?.winner_ids || [];
        if (winners.includes(userId)) {
          soundManager.playWin();
        } else {
          soundManager.playLose();
        }

        await loadBalance();
        setTimeout(() => {
          setSettleResult(null);
        }, 5000);
      }
    } catch (err: any) {
      console.error("结算失败:", err);
    }
  };

  // 渲染座位
  const renderSeats = () => {
    if (!roomState) return null;
    return roomState.seats.map((seat, idx) => (
      <div key={idx} style={{
        ...styles.seat,
        ...(seat.user_id === userId ? styles.mySeat : {}),
      }}>
        <div style={styles.seatUser}>
          {seat.user_id || "空座位"}
        </div>
        {seat.user_id && (
          <>
            <div style={styles.seatChips}>筹码: {seat.chips || 0}</div>
            {seat.current_bet > 0 && (
              <div style={styles.seatBet}>下注: {seat.current_bet}</div>
            )}
            <div style={styles.seatStatus}>{seat.status}</div>
          </>
        )}
      </div>
    ));
  };

  const totalPot = roomState?.round_state?.total_pot || 0;
  const phase = roomState?.round_state?.phase || "WAITING";
  const isMyTurn = roomState?.round_state?.current_turn_seat_index !== undefined
    && roomState?.seats?.[roomState.round_state.current_turn_seat_index]?.user_id === userId
    && phase === "BETTING";

  // 我的手牌
  const mySeat = roomState?.seats?.find((s) => s.user_id === userId);
  const myCards = mySeat?.hole_cards || [];

  // 倒计时颜色：最后5秒变红闪烁
  const countdownColor = countdown <= 5 ? "var(--vp-danger)" : "var(--vp-success)";
  const countdownAnimation = countdown <= 5 ? "blink 1s infinite" : "none";

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>← 返回大厅</button>
        <h2 style={styles.title}>房间: {roomId}</h2>
        <div style={styles.headerRight}>
          <span style={styles.phase}>阶段: {phase}</span>
          <span style={styles.balance}>💰 {balance.toLocaleString()}</span>
        </div>
      </header>

      {/* 结算弹窗 */}
      {settleResult && (
        <div style={styles.settleModal}>
          <div style={styles.settleContent}>
            <h3>🎉 本局结算</h3>
            <p>总池: {settleResult.response?.data?.winners_payout || "?"}</p>
            <p>赢家: {settleResult.request?.winner_ids?.join(", ")}</p>
            <button onClick={() => setSettleResult(null)} style={styles.settleClose}>
              继续游戏
            </button>
          </div>
        </div>
      )}

      <div style={styles.tableArea}>
        {/* 根据游戏类型渲染不同的牌桌 UI */}
        {gameType === 'zha_jin_hua' ? (
          <ZhaJinHuaTable
            roomState={roomState}
            userId={userId}
            onAction={handleAction}
            isMyTurn={isMyTurn}
          />
        ) : gameType === 'niu_niu' ? (
          <NiuNiuTable
            roomState={roomState}
            userId={userId}
            onAction={handleAction}
            isMyTurn={isMyTurn}
          />
        ) : gameType === 'san_gong' ? (
          <SanGongTable
            roomState={roomState}
            userId={userId}
            onAction={handleAction}
            isMyTurn={isMyTurn}
          />
        ) : (
          /* 默认德州扑克 UI */
          <div style={styles.table}>
            {/* 倒计时显示 */}
            {isMyTurn && (
              <div style={{
                ...styles.countdown,
                color: countdownColor,
                animation: countdownAnimation,
              }}>
                {countdown}s
              </div>
            )}
            <div style={styles.pot}>
              底池: {totalPot}
            </div>

            {/* 公共牌展示区域 */}
            <div style={styles.communityCards}>
              {((roomState?.community_cards || []) as string[]).map((card: string, idx: number) => (
                <div
                  key={idx}
                  style={{
                    ...styles.card,
                    ...styles.communityCard,
                    animation: `dealCard 0.4s ease-out ${idx * 0.1}s both`,
                  }}
                >
                  {card}
                </div>
              ))}
            </div>

            {/* 我的手牌 */}
            {myCards && myCards.length > 0 && (
              <div style={styles.myCards}>
                <span style={styles.cardsLabel}>我的手牌:</span>
                {(myCards as string[]).map((card: string, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      ...styles.card,
                      ...styles.holeCard,
                      animation: `flipCard 0.5s ease-out ${idx * 0.15}s both`,
                    }}
                  >
                    {card}
                  </div>
                ))}
              </div>
            )}

            <div style={styles.seatsGrid}>
              {renderSeats()}
            </div>
            {message && <p style={styles.message}>{message}</p>}
          </div>
        )}
      </div>

      {/* 德州扑克操作按钮 */}
      {gameType === 'texas_holdem' && (
        <div style={styles.actions}>
          <button style={styles.foldBtn} onClick={() => handleAction("fold")}>
            弃牌
          </button>
          <button style={styles.checkBtn} onClick={() => handleAction("check")}>
            过牌
          </button>
          <button style={styles.callBtn} onClick={() => handleAction("call")}>
            跟注
          </button>
          <button style={styles.raiseBtn} onClick={() => handleAction("raise", 200)}>
            加注
          </button>
          <button style={styles.allInBtn} onClick={() => handleAction("all_in", 1000)}>
            全下
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, var(--vp-surface) 0%, var(--vp-info) 100%)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "15px 30px",
    background: "rgba(0,0,0,0.3)",
  },
  backBtn: {
    padding: "8px 16px",
    background: "rgba(255,255,255,0.1)",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
  },
  title: {
    color: "#fff",
    margin: 0,
  },
  headerRight: {
    display: "flex",
    gap: "20px",
    alignItems: "center",
  },
  phase: {
    color: "var(--vp-gold)",
    fontSize: "14px",
  },
  balance: {
    color: "#fff",
    fontSize: "16px",
  },
  tableArea: {
    display: "flex",
    justifyContent: "center",
    padding: "40px 20px",
  },
  table: {
    position: "relative",
    background: "linear-gradient(135deg, var(--vp-felt) 0%, var(--vp-felt) 100%)",
    width: "100%",
    maxWidth: "900px",
    padding: "40px",
    borderRadius: "40px",
    border: "4px solid var(--vp-gold-press)",
  },
  countdown: {
    position: "absolute",
    top: "20px",
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: "36px",
    fontWeight: "bold",
    textShadow: "0 0 20px currentColor",
    zIndex: 10,
  },
  pot: {
    textAlign: "center",
    color: "var(--vp-gold)",
    fontSize: "24px",
    fontWeight: "bold",
    marginBottom: "30px",
  },
  seatsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
    gap: "15px",
    marginBottom: "30px",
  },
  seat: {
    background: "rgba(0,0,0,0.4)",
    padding: "15px",
    borderRadius: "8px",
    textAlign: "center",
  },
  mySeat: {
    border: "2px solid var(--vp-gold)",
  },
  seatUser: {
    color: "#fff",
    fontWeight: "bold",
    marginBottom: "8px",
  },
  seatChips: {
    color: "var(--vp-gold)",
    fontSize: "14px",
  },
  seatBet: {
    color: "var(--vp-gold)",
    fontSize: "14px",
  },
  seatStatus: {
    color: "#999",
    fontSize: "12px",
  },
  message: {
    textAlign: "center",
    color: "var(--vp-gold)",
    marginTop: "20px",
  },
  settleModal: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.7)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  settleContent: {
    background: "#fff",
    padding: "40px",
    borderRadius: "12px",
    textAlign: "center",
    minWidth: "300px",
  },
  settleClose: {
    marginTop: "20px",
    padding: "10px 30px",
    background: "var(--vp-gold)",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  actions: {
    display: "flex",
    justifyContent: "center",
    gap: "15px",
    padding: "20px",
  },
  foldBtn: {
    padding: "12px 24px",
    background: "#666",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  checkBtn: {
    padding: "12px 24px",
    background: "var(--vp-info)",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  callBtn: {
    padding: "12px 24px",
    background: "var(--vp-felt)",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  raiseBtn: {
    padding: "12px 24px",
    background: "var(--vp-gold)",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  allInBtn: {
    padding: "12px 24px",
    background: "var(--vp-danger)",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
  },
  communityCards: {
    display: "flex",
    justifyContent: "center",
    gap: "10px",
    marginBottom: "30px",
    minHeight: "80px",
  },
  card: {
    width: "60px",
    height: "80px",
    background: "#fff",
    borderRadius: "6px",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    fontSize: "24px",
    fontWeight: "bold",
    boxShadow: "0 4px 8px rgba(0,0,0,0.3)",
  },
  communityCard: {
    border: "2px solid var(--vp-gold-press)",
  },
  myCards: {
    display: "flex",
    justifyContent: "center",
    gap: "10px",
    marginBottom: "30px",
    alignItems: "center",
  },
  cardsLabel: {
    color: "#fff",
    fontSize: "14px",
    marginRight: "10px",
  },
  holeCard: {
    border: "2px solid var(--vp-gold)",
    transformStyle: "preserve-3d",
  },
};

// CSS 动画
const styleSheet = document.createElement("style");
styleSheet.textContent = `
  @keyframes dealCard {
    from {
      opacity: 0;
      transform: translateY(-50px) rotateY(90deg);
    }
    to {
      opacity: 1;
      transform: translateY(0) rotateY(0deg);
    }
  }
  @keyframes flipCard {
    from {
      opacity: 0;
      transform: rotateY(180deg);
    }
    to {
      opacity: 1;
      transform: rotateY(0deg);
    }
  }
  @keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
`;
document.head.appendChild(styleSheet);

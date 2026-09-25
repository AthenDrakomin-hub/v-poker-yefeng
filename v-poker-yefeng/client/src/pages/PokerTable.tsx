import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { gameClient } from "../ws/gameSocket";
import { useAuthStore } from "../store/authStore";
import { useGameStore } from "../store/gameStore";
import { soundManager } from "../utils/sound";
import { useTableAnimations } from "../hooks/useTableAnimations";
import ZhaJinHuaTable from "../games/ZhaJinHuaTable";
import NiuNiuTable from "../games/NiuNiuTable";
import SanGongTable from "../games/SanGongTable";
import TrickTakingTable from "../games/TrickTakingTable";
import PokerTableGeneric from "../games/PokerTableGeneric";

export default function PokerTable() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  // 从 store 取状态
  const userId = useAuthStore((s) => s.userId);
  const balance = useAuthStore((s) => s.balance);
  const refreshBalance = useAuthStore((s) => s.refreshBalance);

  const roomState = useGameStore((s) => s.roomState);
  const turnTimer = useGameStore((s) => s.turnTimer);
  const notifications = useGameStore((s) => s.notifications);
  const setRoomState = useGameStore((s) => s.setRoomState);
  const updateTurnTimer = useGameStore((s) => s.updateTurnTimer);
  const pushNotification = useGameStore((s) => s.pushNotification);
  const connectRoom = useGameStore((s) => s.connectRoom);
  const disconnectRoom = useGameStore((s) => s.disconnectRoom);

  const [gameType, setGameType] = useState("texas_holdem");
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 动画 refs
  const potRef = useRef<HTMLDivElement>(null);
  const communityRef = useRef<HTMLDivElement>(null);
  const myCardsRef = useRef<HTMLDivElement>(null);

  // 接入动画 hook
  useTableAnimations({
    roomState,
    userId,
    potRef,
    communityRef,
    myCardsRef,
    settleResult: null, // 赢家高亮由 round_result 通知触发
  });

  // 初始化：连接 WS + 订阅事件
  useEffect(() => {
    if (!roomId || !userId) return;

    // HTTP 首次加载
    (async () => {
      try {
        await gameClient.createRoom(roomId, "texas_holdem", "fixed", 100);
      } catch {}
      const state = await gameClient.getRoomState(roomId);
      if (state) {
        setRoomState(state);
        if (state.room?.game_type) setGameType(state.room.game_type);
      }
    })();

    refreshBalance();

    // 连接 WS
    connectRoom(roomId, userId);

    // 订阅房间状态
    const unsubState = gameClient.onStateUpdate((state) => {
      setRoomState(state);
      if (state.round_state?.phase === "SETTLING") {
        handleSettle();
      }
    });

    // 订阅服务端回合倒计时
    const unsubTurn = gameClient.onTurnTimer((info) => {
      updateTurnTimer({
        event: info.event,
        seat_index: info.seat_index,
        user_id: info.user_id || null,
        deadline_ms: info.deadline_ms || null,
        remaining_ms: info.remaining_ms || null,
      });
    });

    // 订阅通知（断线/重连/自动弃牌）
    const unsubNotif = gameClient.onNotification((n) => {
      pushNotification(n);
    });

    return () => {
      unsubState();
      unsubTurn();
      unsubNotif();
      disconnectRoom();
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    };
  }, [roomId, userId]);

  // 我的回合判断
  const isMyTurn = roomState?.round_state?.current_turn_seat_index !== undefined
    && roomState?.seats?.[roomState.round_state.current_turn_seat_index]?.user_id === userId
    && roomState?.round_state?.phase === "BETTING";

  // 服务端推的倒计时（秒）
  const countdown = turnTimer.remaining_ms
    ? Math.ceil(turnTimer.remaining_ms / 1000)
    : (isMyTurn ? 30 : 0);

  const handleAction = async (actionType: string, amount?: number) => {
    soundManager.playClick();
    try {
      const ack = await gameClient.sendAction({
        action_type: actionType as any,
        user_id: userId,
        amount,
      });

      if (ack.success) {
        if (["call", "raise", "bet"].includes(actionType)) soundManager.playChipBet();
        else soundManager.playFlipCard();
        pushNotification({ type: "success", message: `动作: ${actionType}` });
      } else {
        pushNotification({ type: "error", message: ack.message });
      }
    } catch (err: any) {
      pushNotification({ type: "error", message: err.message });
    }
  };

  const handleSettle = async () => {
    try {
      const res = await gameClient.settleRound(roomId!);
      if (res.code === 0) {
        soundManager.playSettle();
        const winners = res.data?.request?.winner_ids || [];
        if (winners.includes(userId)) soundManager.playWin();
        else soundManager.playLose();

        pushNotification({ type: "success", message: "本局结算完成" });
        refreshBalance();
      }
    } catch (err) {
      console.error("结算失败:", err);
    }
  };

  const handleLeave = async () => {
    try {
      await fetch(`/api/engine/room/${roomId}/leave`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId }),
      });
      navigate("/");
    } catch (err: any) {
      pushNotification({ type: "error", message: "离座失败: " + err.message });
    }
  };

  const handleAddBot = async () => {
    try {
      await fetch(`/api/engine/room/${roomId}/bots`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 1 }),
      });
      pushNotification({ type: "success", message: "已添加机器人" });
    } catch (err: any) {
      pushNotification({ type: "error", message: "加机器人失败: " + err.message });
    }
  };

  // 渲染座位
  const renderSeats = () => {
    if (!roomState) return null;
    return roomState.seats.map((seat, idx) => (
      <div key={idx} data-seat-user={seat.user_id || ""} style={{
        ...styles.seat,
        ...(seat.user_id === userId ? styles.mySeat : {}),
        ...(seat.is_disconnected ? styles.disconnectedSeat : {}),
      }}>
        <div style={styles.seatUser}>{seat.user_id || "空座位"}</div>
        {seat.user_id && (
          <>
            <div style={styles.seatChips}>筹码: {seat.chips || 0}</div>
            {seat.current_bet > 0 && <div style={styles.seatBet}>下注: {seat.current_bet}</div>}
            <div style={styles.seatStatus}>{seat.is_disconnected ? "断线" : seat.status}</div>
          </>
        )}
      </div>
    ));
  };

  const totalPot = roomState?.round_state?.total_pot || 0;
  const phase = roomState?.round_state?.phase || "WAITING";
  const mySeat = roomState?.seats?.find((s) => s.user_id === userId);
  const myCards = mySeat?.cards || [];
  const countdownColor = countdown <= 5 ? "var(--vp-danger)" : "var(--vp-success)";

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate("/")}>← 返回大厅</button>
        <h2 style={styles.title}>房间: {roomId}</h2>
        <div style={styles.headerRight}>
          <span style={styles.phase}>阶段: {phase}</span>
          <span style={styles.balance}>💰 {balance.toLocaleString()}</span>
        </div>
      </header>

      {/* 通知 Toast */}
      <div style={styles.toastContainer}>
        {notifications.map((n) => (
          <div key={n.id} style={{
            ...styles.toast,
            ...(n.type === "error" ? styles.toastError :
              n.type === "auto_fold" ? styles.toastWarning :
              n.type === "success" ? styles.toastSuccess : {}),
          }}>{n.message}</div>
        ))}
      </div>

      <div style={styles.tableArea}>
        {gameType === "zha_jin_hua" ? (
          <ZhaJinHuaTable roomState={roomState} userId={userId} onAction={handleAction} isMyTurn={isMyTurn} />
        ) : gameType === "niu_niu" ? (
          <NiuNiuTable roomState={roomState} userId={userId} onAction={handleAction} isMyTurn={isMyTurn} />
        ) : gameType === "san_gong" ? (
          <SanGongTable roomState={roomState} userId={userId} onAction={handleAction} isMyTurn={isMyTurn} />
        ) : ["doudizhu", "guandan", "double_kong", "hong_wu"].includes(gameType) ? (
          <TrickTakingTable roomState={roomState} userId={userId} onAction={handleAction} isMyTurn={isMyTurn} />
        ) : ["texas_holdem", "omaha", "short_deck", "squid_game", "fight_bomb"].includes(gameType) ? (
          <PokerTableGeneric roomState={roomState} userId={userId} onAction={handleAction} isMyTurn={isMyTurn} />
        ) : (
          <div style={styles.table}>
            {isMyTurn && (
              <div style={{ ...styles.countdown, color: countdownColor }}>{countdown}s</div>
            )}
            <div ref={potRef} style={styles.pot}>底池: {totalPot}</div>
            <div ref={communityRef} style={styles.communityCards}>
              {((roomState?.round_state?.community_cards || []) as any[]).map((card, idx) => (
                <div key={idx} style={{ ...styles.card, ...styles.communityCard }}>
                  {typeof card === "string" ? card : card.code}
                </div>
              ))}
            </div>
            {myCards.length > 0 && (
              <div ref={myCardsRef} style={styles.myCards}>
                <span style={styles.cardsLabel}>我的手牌:</span>
                {myCards.map((card: any, idx: number) => (
                  <div key={idx} style={{ ...styles.card, ...styles.holeCard }}>
                    {typeof card === "string" ? card : card.code}
                  </div>
                ))}
              </div>
            )}
            <div style={styles.seatsGrid}>{renderSeats()}</div>
          </div>
        )}
      </div>

      {/* 通用操作栏 */}
      <div style={styles.bottomBar}>
        <button onClick={handleLeave} style={styles.leaveBtn}>离座</button>
        <button onClick={handleAddBot} style={styles.botBtn}>+ 加机器人</button>
        {["texas_holdem", "omaha", "short_deck", "squid_game", "fight_bomb"].includes(gameType) && (
          <div style={styles.pokerActions}>
            <button style={styles.foldBtn} onClick={() => handleAction("fold")}>弃牌</button>
            <button style={styles.checkBtn} onClick={() => handleAction("check")}>过牌</button>
            <button style={styles.callBtn} onClick={() => handleAction("call")}>跟注</button>
            <button style={styles.raiseBtn} onClick={() => handleAction("raise", 200)}>加注</button>
            <button style={styles.allInBtn} onClick={() => handleAction("all_in", 1000)}>全下</button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "100vh", background: "linear-gradient(135deg, var(--vp-surface) 0%, var(--vp-info) 100%)" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 30px", background: "rgba(0,0,0,0.3)" },
  backBtn: { padding: "8px 16px", background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" },
  title: { color: "#fff", margin: 0 },
  headerRight: { display: "flex", gap: "20px", alignItems: "center" },
  phase: { color: "var(--vp-gold)", fontSize: "14px" },
  balance: { color: "#fff", fontSize: "16px" },
  tableArea: { display: "flex", justifyContent: "center", padding: "40px 20px" },
  table: {
    background: "linear-gradient(135deg, var(--vp-felt) 0%, var(--vp-felt-dark) 100%)",
    borderRadius: "40px",
    border: "4px solid var(--vp-gold-press)",
    padding: "40px",
    position: "relative",
    maxWidth: "900px",
    width: "100%",
    margin: "0 auto",
  },
  countdown: { position: "absolute", top: "20px", left: "50%", transform: "translateX(-50%)", fontSize: "36px", fontWeight: "bold", textShadow: "0 0 20px currentColor", zIndex: 10 },
  pot: { textAlign: "center", color: "var(--vp-gold)", fontSize: "24px", fontWeight: "bold", marginBottom: "30px" },
  seatsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))",
    gap: "10px",
    marginBottom: "30px",
  },
  seat: { background: "rgba(0,0,0,0.4)", padding: "12px", borderRadius: "8px", textAlign: "center" },
  mySeat: { border: "2px solid var(--vp-gold)" },
  disconnectedSeat: { opacity: 0.5 },
  seatUser: { color: "#fff", fontWeight: "bold", marginBottom: "8px" },
  seatChips: { color: "var(--vp-gold)", fontSize: "14px" },
  seatBet: { color: "var(--vp-gold)", fontSize: "14px" },
  seatStatus: { color: "#999", fontSize: "12px" },
  toastContainer: { position: "fixed", top: "70px", right: "20px", zIndex: 9999, display: "flex", flexDirection: "column", gap: "8px" },
  toast: { padding: "10px 16px", borderRadius: "8px", color: "#fff", fontSize: "14px", boxShadow: "0 4px 12px rgba(0,0,0,0.3)", animation: "slideIn 0.3s ease-out" },
  toastSuccess: { background: "var(--vp-success)" },
  toastError: { background: "var(--vp-danger)" },
  toastWarning: { background: "var(--vp-warning)" },
  actions: { display: "flex", justifyContent: "center", gap: "15px", padding: "20px" },
  bottomBar: { display: "flex", justifyContent: "center", gap: "12px", padding: "15px 20px", alignItems: "center", flexWrap: "wrap" },
  leaveBtn: { padding: "8px 16px", background: "#d94444", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" },
  botBtn: { padding: "8px 16px", background: "#4a90d9", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" },
  pokerActions: { display: "flex", gap: "10px" },
  foldBtn: { padding: "12px 24px", background: "#666", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" },
  checkBtn: { padding: "12px 24px", background: "var(--vp-info)", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" },
  callBtn: { padding: "12px 24px", background: "var(--vp-felt)", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" },
  raiseBtn: { padding: "12px 24px", background: "var(--vp-gold)", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" },
  allInBtn: { padding: "12px 24px", background: "var(--vp-danger)", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" },
  communityCards: { display: "flex", justifyContent: "center", gap: "10px", marginBottom: "30px", minHeight: "80px" },
  card: { width: "60px", height: "80px", background: "#fff", borderRadius: "6px", display: "flex", justifyContent: "center", alignItems: "center", fontSize: "24px", fontWeight: "bold", boxShadow: "0 4px 8px rgba(0,0,0,0.3)" },
  communityCard: { border: "2px solid var(--vp-gold-press)" },
  myCards: { display: "flex", justifyContent: "center", gap: "10px", marginBottom: "30px", alignItems: "center" },
  cardsLabel: { color: "#fff", fontSize: "14px", marginRight: "10px" },
  holeCard: { border: "2px solid var(--vp-gold)" },
};

/**
 * 通用扑克桌：德州/奥马哈/短牌/鱿鱼模式
 * - 显示公共牌、手牌
 * - 弃牌/过牌/跟注/加注/全下
 */
import { useState } from "react";

interface Props {
  roomState: any;
  userId: string;
  onAction: (actionType: string, amount?: number) => void;
  isMyTurn: boolean;
}

export default function PokerTableGeneric({ roomState, userId, onAction, isMyTurn }: Props) {
  const [raiseAmount, setRaiseAmount] = useState(200);

  const mySeat = roomState?.seats?.find((s: any) => s.user_id === userId);
  const myCards: any[] = mySeat?.cards || [];
  const communityCards: any[] = roomState?.round_state?.community_cards || [];
  const totalPot = roomState?.round_state?.total_pot || 0;

  return (
    <div style={styles.table}>
      <div style={styles.pot}>底池: {totalPot}</div>

      {/* 公共牌 */}
      <div style={styles.communityRow}>
        {communityCards.length > 0 ? (
          communityCards.map((card, i) => (
            <div key={i} style={styles.communityCard}>
              {typeof card === "string" ? card : card.code}
            </div>
          ))
        ) : (
          <span style={{ color: "rgba(255,255,255,0.3)" }}>等待发牌</span>
        )}
      </div>

      {/* 座位 */}
      <div style={styles.seatsRow}>
        {roomState?.seats?.map((seat: any, idx: number) => (
          <div key={idx} style={{
            ...styles.seat,
            ...(seat.user_id === userId ? styles.mySeat : {}),
          }}>
            <div style={styles.seatName}>{seat.user_id || "空"}</div>
            {seat.user_id && (
              <>
                <div style={styles.seatChips}>💰 {seat.chips || 0}</div>
                {seat.current_bet > 0 && <div style={styles.seatBet}>下注 {seat.current_bet}</div>}
                {seat.status === "folded" && <div style={styles.foldedTag}>已弃牌</div>}
              </>
            )}
          </div>
        ))}
      </div>

      {/* 我的手牌 */}
      {myCards.length > 0 && (
        <div style={styles.myCardsRow}>
          {myCards.map((card: any, i: number) => (
            <div key={i} style={styles.holeCard}>
              {typeof card === "string" ? card : card.code}
            </div>
          ))}
        </div>
      )}

      {/* 操作按钮 */}
      {isMyTurn && (
        <div style={styles.actionRow}>
          <button onClick={() => onAction("fold")} style={styles.foldBtn}>弃牌</button>
          <button onClick={() => onAction("check")} style={styles.checkBtn}>过牌</button>
          <button onClick={() => onAction("call")} style={styles.callBtn}>跟注</button>
          <input
            type="number"
            value={raiseAmount}
            onChange={(e) => setRaiseAmount(Number(e.target.value))}
            style={styles.raiseInput}
            min={20}
          />
          <button onClick={() => onAction("raise", raiseAmount)} style={styles.raiseBtn}>加注</button>
          <button onClick={() => onAction("all_in")} style={styles.allInBtn}>全下</button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  table: {
    background: "linear-gradient(135deg, #1a5c3a 0%, #0d3a20 100%)",
    borderRadius: "40px", border: "4px solid #c9a84c",
    padding: "30px", maxWidth: "800px", margin: "0 auto",
  },
  pot: { textAlign: "center", color: "#c9a84c", fontSize: "22px", fontWeight: "bold", marginBottom: "16px" },
  communityRow: { display: "flex", justifyContent: "center", gap: "8px", minHeight: "70px", marginBottom: "20px" },
  communityCard: {
    width: "55px", height: "75px", background: "#fff", borderRadius: "6px",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "14px", fontWeight: "bold", boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
  },
  seatsRow: { display: "flex", justifyContent: "center", gap: "12px", marginBottom: "20px", flexWrap: "wrap" },
  seat: { background: "rgba(0,0,0,0.4)", padding: "8px 14px", borderRadius: "8px", textAlign: "center", minWidth: "90px" },
  mySeat: { border: "2px solid #c9a84c" },
  seatName: { color: "#fff", fontSize: "13px", fontWeight: "bold" },
  seatChips: { color: "#c9a84c", fontSize: "12px", marginTop: "2px" },
  seatBet: { color: "#ff9", fontSize: "12px" },
  foldedTag: { color: "#888", fontSize: "11px" },
  myCardsRow: { display: "flex", justifyContent: "center", gap: "8px", marginBottom: "20px" },
  holeCard: {
    width: "55px", height: "75px", background: "#fff", borderRadius: "6px",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "14px", fontWeight: "bold", border: "2px solid #c9a84c",
  },
  actionRow: { display: "flex", gap: "10px", justifyContent: "center", alignItems: "center", flexWrap: "wrap" },
  foldBtn: { padding: "10px 20px", background: "#555", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" },
  checkBtn: { padding: "10px 20px", background: "#4a90d9", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" },
  callBtn: { padding: "10px 20px", background: "#2d8a4e", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" },
  raiseInput: { width: "80px", padding: "8px", borderRadius: "6px", border: "1px solid #ccc" },
  raiseBtn: { padding: "10px 20px", background: "#c9a84c", color: "#000", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "bold" },
  allInBtn: { padding: "10px 20px", background: "#d94444", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer" },
};

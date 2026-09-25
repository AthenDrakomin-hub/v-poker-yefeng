/**
 * 通用出牌桌：斗地主/掼蛋/双扣/红五
 * - 点击选牌 → 出牌/不出
 * - 显示各家剩余牌数
 * - 显示最后出牌
 */
import { useState } from "react";

interface Card { suit: string; rank: number; code: string }

interface Props {
  roomState: any;
  userId: string;
  onAction: (actionType: string, payload?: any) => void;
  isMyTurn: boolean;
}

const RANK_LABEL: Record<number, string> = {
  1: "A", 11: "J", 12: "Q", 13: "K", 15: "小王", 16: "大王",
};

function cardLabel(c: Card): string {
  if (c.rank === 15) return "小王";
  if (c.rank === 16) return "大王";
  const r = RANK_LABEL[c.rank] || c.rank;
  const s = { S: "♠", H: "♥", C: "♣", D: "♦" }[c.suit] || c.suit;
  return `${s}${r}`;
}

export default function TrickTakingTable({ roomState, userId, onAction, isMyTurn }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const mySeat = roomState?.seats?.find((s: any) => s.user_id === userId);
  const myCards: Card[] = mySeat?.cards || [];
  const lastPlayed = roomState?.round_state?.lastPlayed || roomState?.lastPlayed;
  const bombCount = roomState?.round_state?.bombCount || 0;

  const toggleCard = (code: string) => {
    if (!isMyTurn) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handlePlay = () => {
    const cards = myCards.filter((c) => selected.has(c.code));
    if (cards.length === 0) return;
    onAction("play", { cards });
    setSelected(new Set());
  };

  const handlePass = () => {
    onAction("pass");
    setSelected(new Set());
  };

  return (
    <div style={{ ...styles.table, maxWidth: "900px" } as React.CSSProperties}>
      {/* 顶部：炸弹倍数 */}
      {bombCount > 0 && (
        <div style={styles.bombBanner}>💣 炸弹x{bombCount}  倍数x{Math.pow(2, bombCount)}</div>
      )}

      {/* 其他玩家座位 */}
      <div style={styles.opponentRow}>
        {roomState?.seats?.map((seat: any, idx: number) =>
          seat.user_id && seat.user_id !== userId ? (
            <div key={idx} style={styles.opponentSeat}>
              <div style={styles.oppName}>{seat.user_id}</div>
              <div style={styles.oppCards}>🂠 {seat.cards?.length || 0}张</div>
              {seat.is_banker && <div style={styles.bankerTag}>地主</div>}
            </div>
          ) : null
        )}
      </div>

      {/* 中央：最后出牌 */}
      <div style={styles.centerArea}>
        {lastPlayed ? (
          <div style={styles.lastPlayed}>
            <div style={styles.lastLabel}>{roomState?.seats?.[lastPlayed.seat_index]?.user_id || "玩家"} 出牌:</div>
            <div style={styles.lastCards}>
              {(lastPlayed.cards || []).map((c: Card, i: number) => (
                <span key={i} style={styles.playedCard}>{cardLabel(c)}</span>
              ))}
            </div>
          </div>
        ) : (
          <div style={styles.centerPlaceholder}>等待出牌</div>
        )}
      </div>

      {/* 我的手牌 */}
      <div style={styles.myHand}>
        {myCards.map((card, i) => (
          <div
            key={card.code + i}
            onClick={() => toggleCard(card.code)}
            style={{
              ...styles.myCard,
              ...(selected.has(card.code) ? styles.myCardSelected : {}),
            }}
          >
            {cardLabel(card)}
          </div>
        ))}
      </div>

      {/* 操作按钮 */}
      {isMyTurn && (
        <div style={styles.actionRow}>
          <button onClick={handlePass} style={styles.passBtn}>不出</button>
          <button
            onClick={handlePlay}
            disabled={selected.size === 0}
            style={{ ...styles.playBtn, opacity: selected.size === 0 ? 0.5 : 1 }}
          >
            出牌 ({selected.size})
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  table: {
    background: "linear-gradient(135deg, #2d5a3d 0%, #1a3a2a 100%)",
    borderRadius: "40px", border: "4px solid #c9a84c",
    padding: "30px", margin: "0 auto", position: "relative",
  },
  bombBanner: {
    position: "absolute", top: "10px", left: "50%", transform: "translateX(-50%)",
    background: "rgba(220,50,50,0.9)", color: "#fff", padding: "4px 16px",
    borderRadius: "20px", fontSize: "14px", fontWeight: "bold",
  },
  opponentRow: { display: "flex", justifyContent: "center", gap: "30px", marginBottom: "20px" },
  opponentSeat: { background: "rgba(0,0,0,0.4)", padding: "10px 16px", borderRadius: "8px", textAlign: "center" },
  oppName: { color: "#fff", fontWeight: "bold", fontSize: "14px" },
  oppCards: { color: "#c9a84c", fontSize: "13px", marginTop: "4px" },
  bankerTag: { background: "#c9a84c", color: "#000", fontSize: "11px", padding: "2px 8px", borderRadius: "10px", marginTop: "4px" },
  centerArea: { minHeight: "100px", display: "flex", alignItems: "center", justifyContent: "center", margin: "20px 0" },
  centerPlaceholder: { color: "rgba(255,255,255,0.3)", fontSize: "16px" },
  lastPlayed: { textAlign: "center" },
  lastLabel: { color: "#fff", fontSize: "13px", marginBottom: "8px" },
  lastCards: { display: "flex", gap: "6px", justifyContent: "center" },
  playedCard: {
    background: "#fff", borderRadius: "4px", padding: "8px 10px",
    fontSize: "16px", fontWeight: "bold", color: "#333",
  },
  myHand: { display: "flex", gap: "4px", justifyContent: "center", flexWrap: "wrap", minHeight: "80px", marginBottom: "20px" },
  myCard: {
    width: "50px", height: "70px", background: "#fff", borderRadius: "6px",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: "14px", fontWeight: "bold", color: "#333", cursor: "pointer",
    transform: "translateY(0)", transition: "transform 0.15s",
    boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
  },
  myCardSelected: { transform: "translateY(-15px)", border: "2px solid #c9a84c" },
  actionRow: { display: "flex", gap: "16px", justifyContent: "center" },
  passBtn: { padding: "10px 30px", background: "#666", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "16px" },
  playBtn: { padding: "10px 30px", background: "#c9a84c", color: "#000", border: "none", borderRadius: "8px", cursor: "pointer", fontSize: "16px", fontWeight: "bold" },
};

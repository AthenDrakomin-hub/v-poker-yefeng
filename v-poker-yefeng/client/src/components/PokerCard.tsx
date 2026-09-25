/**
 * CSS扑克牌组件 - 纯CSS绘制，无需图片
 * 花色♠♥♣♦，红黑色，圆角，阴影立体感
 */

const SUIT_SYMBOL: Record<string, string> = { S: "♠", H: "♥", C: "♣", D: "♦" };
const RANK_LABEL: Record<number, string> = { 1: "A", 11: "J", 12: "Q", 13: "K" };

interface PokerCardProps {
  code: string; // "S-12" or "H-1"
  faceDown?: boolean;
  selected?: boolean;
  small?: boolean;
  onClick?: () => void;
}

export default function PokerCard({ code, faceDown, selected, small, onClick }: PokerCardProps) {
  if (faceDown) {
    return (
      <div
        onClick={onClick}
        style={{
          ...styles.card,
          ...(small ? styles.cardSmall : {}),
          ...styles.cardBack,
          transform: selected ? "translateY(-12px)" : undefined,
          border: selected ? "2px solid #d4af37" : "1px solid #1e40af",
        }}
      />
    );
  }

  const [suit, rankStr] = code.split("-");
  const rank = parseInt(rankStr);
  const isRed = suit === "H" || suit === "D";
  const symbol = SUIT_SYMBOL[suit] || "♠";
  const label = RANK_LABEL[rank] || String(rank);

  return (
    <div
      onClick={onClick}
      style={{
        ...styles.card,
        ...(small ? styles.cardSmall : {}),
        ...(selected ? styles.cardSelected : {}),
        background: "#fff",
        border: "1px solid #ddd",
      }}
    >
      <div style={{ ...styles.corner, color: isRed ? "#d42b2b" : "#1a1a1a" }}>
        <div style={styles.rank}>{label}</div>
        <div style={styles.suit}>{symbol}</div>
      </div>
      <div style={{ ...styles.center, color: isRed ? "#d42b2b" : "#1a1a1a" }}>
        {symbol}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    width: "56px",
    height: "80px",
    borderRadius: "6px",
    position: "relative",
    boxShadow: "0 2px 6px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.8)",
    cursor: "pointer",
    transition: "transform 0.15s",
    flexShrink: 0,
  },
  cardSmall: { width: "40px", height: "56px" },
  cardBack: {
    background: "repeating-linear-gradient(45deg, #1e3a8a 0, #1e3a8a 4px, #1e40af 4px, #1e40af 8px)",
    border: "2px solid #d4af37",
  },
  cardSelected: {
    transform: "translateY(-12px)",
    boxShadow: "0 6px 16px rgba(212,175,55,0.5)",
    border: "2px solid #d4af37",
  },
  corner: { position: "absolute", top: "4px", left: "5px", display: "flex", flexDirection: "column" },
  rank: { fontSize: "14px", fontWeight: "bold", lineHeight: "14px" },
  suit: { fontSize: "12px", lineHeight: "14px" },
  center: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px" },
};

import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

const ALL_GAMES = [
  { id: "texas_holdem", name: "德州扑克", icon: "♠", desc: "2底牌·5公共牌", min: 2, max: 9, color: "#d4af37" },
  { id: "omaha", name: "奥马哈", icon: "♦", desc: "4底牌·必用2张", min: 2, max: 6, color: "#e6c85a" },
  { id: "short_deck", name: "短牌德州", icon: "♣", desc: "36张·去2-5", min: 2, max: 6, color: "#b8962e" },
  { id: "zha_jin_hua", name: "炸金花", icon: "🂡", desc: "3张·比大小", min: 2, max: 6, color: "#ef4444" },
  { id: "fight_bomb", name: "炸弹", icon: "💣", desc: "3张·叫分", min: 2, max: 4, color: "#f59e0b" },
  { id: "niu_niu", name: "牛牛", icon: "🐂", desc: "5张·抢庄", min: 2, max: 8, color: "#10b981" },
  { id: "san_gong", name: "三公", icon: "🎴", desc: "3张·比点数", min: 2, max: 6, color: "#3b82f6" },
  { id: "doudizhu", name: "斗地主", icon: "🎮", desc: "3人·出牌", min: 3, max: 3, color: "#8b5cf6" },
  { id: "guandan", name: "掼蛋", icon: "🃋", desc: "4人·组队两副", min: 4, max: 4, color: "#ec4899" },
  { id: "double_kong", name: "双扣", icon: "🃏", desc: "4人·争上游", min: 4, max: 4, color: "#06b6d4" },
  { id: "hong_wu", name: "红五", icon: "❤️", desc: "4人·红五特殊", min: 4, max: 4, color: "#f43f5e" },
  { id: "thirteen_water", name: "十三水", icon: "💧", desc: "13张·分3道", min: 2, max: 4, color: "#0ea5e9" },
  { id: "pineapple", name: "菠萝", icon: "🍍", desc: "13张·分道", min: 2, max: 3, color: "#84cc16" },
  { id: "squid_game", name: "鱿鱼模式", icon: "🦑", desc: "2底牌·生存", min: 2, max: 6, color: "#6366f1" },
];

const PAGE_SIZE = 8;

interface RoomItem {
  room_id: string;
  game_type: string;
  base_score: number;
  status: string;
  created_by: string;
}

export default function Lobby() {
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.userId);
  const balance = useAuthStore((s) => s.balance);
  const refreshBalance = useAuthStore((s) => s.refreshBalance);

  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [filteredGame, setFilteredGame] = useState<string>("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  useEffect(() => { refreshBalance(); loadRooms(); }, [userId, filteredGame]);

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const url = filteredGame
        ? `/api/rooms/list?game_type=${filteredGame}`
        : `/api/rooms/list`;
      const resp = await fetch(`${import.meta.env.VITE_API_URL || ""}${url}`);
      const data = await resp.json();
      if (data.code === 0) setRooms(data.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [filteredGame]);

  const totalPages = Math.max(1, Math.ceil(rooms.length / PAGE_SIZE));
  const pageRooms = rooms.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const createRoom = async (gameType: string) => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (localStorage.getItem("token") || "") },
        body: JSON.stringify({ game_type: gameType, mode: "fixed_limit", base_score: 100 }),
      });
      const data = await resp.json();
      if (data.code === 0) {
        navigate(`/room/${data.data.room_id}`);
      }
    } catch (e) { console.error(e); }
  };

  const joinRoom = async (roomId: string) => {
    try {
      await fetch(`${import.meta.env.VITE_API_URL || ""}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (localStorage.getItem("token") || "") },
        body: JSON.stringify({ room_id: roomId }),
      });
      navigate(`/room/${roomId}`);
    } catch (e) { console.error(e); }
  };

  return (
    <div style={styles.page}>
      {/* 顶部栏 */}
      <div style={styles.topbar}>
        <div style={styles.logo}>V-POKER</div>
        <div style={styles.balanceBox}>
          <span style={styles.balanceIcon}>💰</span>
          <span style={styles.balanceNum}>{Number(balance).toLocaleString()}</span>
        </div>
      </div>

      {/* 游戏分类 */}
      <div style={styles.gameTabs}>
        <button
          style={{ ...styles.tab, ...(!filteredGame ? styles.tabActive : {}) }}
          onClick={() => { setFilteredGame(""); setPage(1); }}
        >全部</button>
        {ALL_GAMES.map((g) => (
          <button
            key={g.id}
            style={{ ...styles.tab, ...(filteredGame === g.id ? styles.tabActive : {}), ...(filteredGame === g.id ? { borderColor: g.color } : {}) }}
            onClick={() => { setFilteredGame(g.id); setPage(1); }}
          >{g.name}</button>
        ))}
      </div>

      {/* 游戏卡片网格 */}
      <div style={styles.grid}>
        {ALL_GAMES.filter((g) => !filteredGame || g.id === filteredGame).map((g) => (
          <div key={g.id} style={{ ...styles.gameCard, borderTop: `3px solid ${g.color}` }}>
            <div style={styles.gameIcon}>{g.icon}</div>
            <div style={styles.gameName}>{g.name}</div>
            <div style={styles.gameDesc}>{g.desc}</div>
            <div style={styles.gamePlayers}>{g.min}-{g.max}人</div>
            <button style={{ ...styles.playBtn, background: g.color }} onClick={() => createRoom(g.id)}>
              快速开始
            </button>
          </div>
        ))}
      </div>

      {/* 房间列表 */}
      <div style={styles.roomSection}>
        <div style={styles.roomHeader}>
          <h3 style={styles.roomTitle}>进行中的房间</h3>
          {loading && <span style={styles.loading}>加载中...</span>}
        </div>
        {pageRooms.length === 0 ? (
          <div style={styles.empty}>暂无房间，点击"快速开始"创建</div>
        ) : (
          <>
            {pageRooms.map((r) => (
              <div key={r.room_id} style={styles.roomRow}>
                <div style={styles.roomInfo}>
                  <span style={styles.roomType}>{ALL_GAMES.find((g) => g.id === r.game_type)?.name || r.game_type}</span>
                  <span style={styles.roomId}>#{r.room_id}</span>
                  <span style={styles.roomScore}>底注 {r.base_score}</span>
                </div>
                <button style={styles.joinBtn} onClick={() => joinRoom(r.room_id)}>加入</button>
              </div>
            ))}
            {/* 分页 */}
            {totalPages > 1 && (
              <div style={styles.pagination}>
                <button disabled={page <= 1} onClick={() => setPage(page - 1)} style={styles.pageBtn}>‹</button>
                <span style={styles.pageInfo}>{page} / {totalPages}</span>
                <button disabled={page >= totalPages} onClick={() => setPage(page + 1)} style={styles.pageBtn}>›</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "radial-gradient(ellipse at 50% 0%, #1e293b 0%, #0f172a 50%, #020617 100%)",
    color: "#e2e8f0",
    padding: "0",
  },
  topbar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    background: "rgba(0,0,0,0.4)",
    borderBottom: "1px solid rgba(212,175,55,0.2)",
  },
  logo: {
    fontSize: "22px",
    fontWeight: "bold",
    color: "#d4af37",
    letterSpacing: "3px",
    textShadow: "0 0 20px rgba(212,175,55,0.3)",
  },
  balanceBox: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "rgba(212,175,55,0.1)",
    padding: "8px 16px",
    borderRadius: "20px",
    border: "1px solid rgba(212,175,55,0.3)",
  },
  balanceIcon: { fontSize: "16px" },
  balanceNum: { color: "#d4af37", fontWeight: "bold", fontSize: "16px" },
  gameTabs: {
    display: "flex",
    gap: "8px",
    padding: "16px 24px",
    overflowX: "auto",
    flexWrap: "wrap",
  },
  tab: {
    padding: "8px 16px",
    borderRadius: "20px",
    border: "1px solid rgba(255,255,255,0.15)",
    background: "transparent",
    color: "#94a3b8",
    fontSize: "13px",
    cursor: "pointer",
    whiteSpace: "nowrap",
  },
  tabActive: {
    background: "rgba(212,175,55,0.15)",
    borderColor: "#d4af37",
    color: "#d4af37",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: "16px",
    padding: "0 24px 24px",
  },
  gameCard: {
    background: "linear-gradient(180deg, rgba(30,41,59,0.8) 0%, rgba(15,23,42,0.9) 100%)",
    borderRadius: "12px",
    padding: "20px",
    textAlign: "center",
    transition: "transform 0.2s, box-shadow 0.2s",
    cursor: "pointer",
  },
  gameIcon: { fontSize: "36px", marginBottom: "8px" },
  gameName: { fontSize: "16px", fontWeight: "bold", color: "#f1f5f9", marginBottom: "4px" },
  gameDesc: { fontSize: "12px", color: "#64748b", marginBottom: "8px" },
  gamePlayers: { fontSize: "12px", color: "#94a3b8", marginBottom: "12px" },
  playBtn: {
    padding: "8px 20px",
    borderRadius: "20px",
    border: "none",
    color: "#fff",
    fontSize: "13px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  roomSection: { padding: "0 24px 40px" },
  roomHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" },
  roomTitle: { fontSize: "18px", color: "#e2e8f0", margin: 0 },
  loading: { fontSize: "12px", color: "#64748b" },
  empty: { textAlign: "center", padding: "40px", color: "#475569", fontSize: "14px" },
  roomRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "rgba(30,41,59,0.5)",
    padding: "12px 16px",
    borderRadius: "8px",
    marginBottom: "8px",
  },
  roomInfo: { display: "flex", gap: "16px", alignItems: "center" },
  roomType: { color: "#d4af37", fontWeight: "bold", fontSize: "14px" },
  roomId: { color: "#64748b", fontSize: "13px" },
  roomScore: { color: "#94a3b8", fontSize: "13px" },
  joinBtn: {
    padding: "6px 20px",
    borderRadius: "16px",
    border: "1px solid #10b981",
    background: "rgba(16,185,129,0.15)",
    color: "#10b981",
    cursor: "pointer",
    fontSize: "13px",
  },
  pagination: { display: "flex", justifyContent: "center", alignItems: "center", gap: "12px", marginTop: "16px" },
  pageBtn: {
    width: "32px", height: "32px", borderRadius: "16px", border: "1px solid rgba(255,255,255,0.2)",
    background: "transparent", color: "#94a3b8", cursor: "pointer",
  },
  pageInfo: { fontSize: "13px", color: "#64748b" },
};

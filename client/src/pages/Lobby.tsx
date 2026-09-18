import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api, clearToken } from "../api/client";

const gameTypes = [
  { id: "texas_holdem", name: "德州扑克", icon: "♠", players: "2-9人", accent: "#e94560" },
  { id: "zha_jin_hua", name: "炸金花", icon: "🃏", players: "2-6人", accent: "#f59e0b" },
  { id: "niu_niu", name: "牛牛", icon: "🐂", players: "2-8人", accent: "#10b981" },
  { id: "san_gong", name: "三公", icon: "🎴", players: "2-8人", accent: "#3b82f6" },
];

interface RoomItem {
  room_id: string;
  room_name: string | null;
  game_type: string;
  mode: string;
  total_rounds: number;
  base_score: number;
  platform_fee_rate: string;
  min_players: number;
  max_players: number;
  status: string;
  current_round: number;
  created_by: string;
  room_type: string;
  created_at: number;
}

export default function Lobby() {
  const navigate = useNavigate();
  const userId = localStorage.getItem('vp_user_id') || '';
  const [balance, setBalance] = useState(0);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [selectedGame, setSelectedGame] = useState<string | null>(null);

  // 创建房间表单
  const [createForm, setCreateForm] = useState({
    room_name: "",
    room_password: "",
    game_type: "texas_holdem",
    total_rounds: 10,
    base_score: 100,
  });

  // 加入房间表单
  const [joinForm, setJoinForm] = useState({
    room_id: "",
    room_password: "",
  });

  useEffect(() => {
    loadBalance();
    loadRooms();
  }, [userId]);

  const loadBalance = async () => {
    try {
      const data = await api.getBalance(userId);
      setBalance(data.balance);
    } catch (err) {
      console.error("Failed to load balance:", err);
    }
  };

  const loadRooms = async (gameType?: string) => {
    try {
      const url = gameType
        ? `/api/rooms/list?game_type=${gameType}`
        : `/api/rooms/list`;
      const resp = await fetch(`${import.meta.env.VITE_API_URL || ""}${url}`);
      const data = await resp.json();
      if (data.code === 0) {
        setRooms(data.data);
      }
    } catch (err) {
      console.error("Failed to load rooms:", err);
    }
  };

  const handleCreateRoom = async () => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          created_by: userId,
          room_type: createForm.room_password ? "private" : "public",
        }),
      });
      const data = await resp.json();
      if (data.code === 0) {
        setShowCreateModal(false);
        navigate(`/room/${data.data.room_id}`);
      } else {
        alert(data.message || "创建房间失败");
      }
    } catch (err: any) {
      alert(err.message || "创建房间失败");
    }
  };

  // 快速匹配：自动创建快速赛房间并加入
  const handleQuickMatch = async () => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/rooms/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_name: "快速赛",
          game_type: "texas_holdem",
          total_rounds: 5, // 快速赛 5 局
          base_score: 100,
          created_by: userId,
          room_type: "public",
          mode: "quick", // 快速赛模式
        }),
      });
      const data = await resp.json();
      if (data.code === 0) {
        navigate(`/room/${data.data.room_id}`);
      } else {
        alert(data.message || "快速匹配失败");
      }
    } catch (err: any) {
      alert(err.message || "快速匹配失败");
    }
  };

  const handleJoinRoom = async () => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/rooms/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...joinForm,
          user_id: userId,
        }),
      });
      const data = await resp.json();
      if (data.code === 0) {
        setShowJoinModal(false);
        navigate(`/room/${joinForm.room_id}`);
      } else {
        alert(data.message || "加入房间失败");
      }
    } catch (err: any) {
      alert(err.message || "加入房间失败");
    }
  };

  const getGameInfo = (gameType: string) => {
    return gameTypes.find((g) => g.id === gameType) || gameTypes[0];
  };

  return (
    <div style={styles.container}>
      {/* 背景图片 */}
      <div
        style={{
          ...styles.bgImage,
          backgroundImage: `url(/assets/backgrounds/lobby_bg.png)`,
        }}
      />
      {/* 顶部导航 */}
      <header style={styles.header}>
        <div style={styles.logo}>
          <img src="/assets/ui/logo.png" alt="V-POKER" style={styles.logoImg} />
          <span style={styles.logoText}>V-POKER</span>
        </div>
        <div style={styles.userInfo}>
          <div style={styles.badge}>
            <span style={styles.balanceLabel}>筹码</span>
            <span style={styles.balanceValue}>{balance.toLocaleString()}</span>
          </div>
          <button style={styles.iconBtn} onClick={() => navigate('/wallet')} title="钱包">
            💳
          </button>
          <button style={styles.logoutBtn} onClick={() => { clearToken(); navigate('/login'); }} title="退出">
            退出
          </button>
        </div>
      </header>

      {/* 主内容 */}
      <main style={styles.main}>
        <div style={styles.hero}>
          <h1 style={styles.title}>欢迎回来</h1>
          <p style={styles.subtitle}>选择游戏，开始对战</p>
          <div style={styles.heroButtons}>
            <button style={styles.primaryBtn} onClick={() => setShowCreateModal(true)}>
              ＋ 创建房间
            </button>
            <button style={styles.secondaryBtn} onClick={() => setShowJoinModal(true)}>
              🔑 加入房间
            </button>
          </div>
        </div>

        {/* 快速赛入口 */}
        <div style={{
          marginBottom: '24px',
          padding: '20px',
          background: 'linear-gradient(135deg, rgba(212,175,55,0.1), rgba(212,175,55,0.05))',
          borderRadius: '16px',
          border: '1px solid rgba(212,175,55,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <h2 style={{ ...styles.sectionTitle, margin: 0, marginBottom: '8px' }}>⚡ 快速赛</h2>
            <p style={{ margin: 0, color: 'rgba(255,255,255,0.6)', fontSize: '14px' }}>
              3 分钟一局，秒速匹配，赢取更多筹码
            </p>
          </div>
          <button
            onClick={handleQuickMatch}
            style={{
              padding: '12px 32px',
              background: 'linear-gradient(135deg, #d4af37, #b8962e)',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              fontSize: '16px',
              fontWeight: '600',
              cursor: 'pointer',
              boxShadow: '0 0 20px rgba(212,175,55,0.3)',
              transition: 'all 0.3s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'scale(1.05)';
              e.currentTarget.style.boxShadow = '0 0 30px rgba(212,175,55,0.5)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(212,175,55,0.3)';
            }}
          >
            快速匹配 →
          </button>
        </div>

        {/* 游戏卡片网格 */}
        <h2 style={styles.sectionTitle}>选择游戏</h2>
        <div style={styles.gameGrid}>
          {gameTypes.map((game) => (
            <div
              key={game.id}
              style={{
                ...styles.gameCard,
                transform: hoveredCard === game.id ? "translateY(-8px)" : "translateY(0)",
                borderColor: hoveredCard === game.id ? game.accent : "rgba(255,255,255,0.1)",
              }}
              onMouseEnter={() => setHoveredCard(game.id)}
              onMouseLeave={() => setHoveredCard(null)}
              onClick={() => {
                setSelectedGame(selectedGame === game.id ? null : game.id);
                loadRooms(selectedGame === game.id ? undefined : game.id);
              }}
            >
              <div style={{ ...styles.gameIcon, color: game.accent }}>
                {game.icon}
              </div>
              <h3 style={styles.gameName}>{game.name}</h3>
              <p style={styles.gameMeta}>{game.players} · 即时开局</p>
              <div style={{ ...styles.playBtn, background: `linear-gradient(135deg, ${game.accent}, ${game.accent}dd)` }}>
                选择游戏 →
              </div>
            </div>
          ))}
        </div>

        {/* 房间列表 */}
        {rooms.length > 0 && (
          <>
            <h2 style={styles.sectionTitle}>等待中的房间</h2>
            <div style={styles.roomList}>
              {rooms.map((room) => {
                const game = getGameInfo(room.game_type);
                return (
                  <div key={room.room_id} style={styles.roomCard} onClick={() => navigate(`/room/${room.room_id}`)}>
                    <div style={styles.roomHeader}>
                      <span style={{ ...styles.roomIcon, color: game.accent }}>{game.icon}</span>
                      <span style={styles.roomId}>#{room.room_id}</span>
                      {room.room_type === "private" && <span style={styles.privateBadge}>🔒 私有</span>}
                    </div>
                    <div style={styles.roomMeta}>
                      <span>{game.name}</span>
                      <span>底分: {room.base_score}</span>
                      <span>{room.min_players}-{room.max_players}人</span>
                    </div>
                    <div style={styles.roomFooter}>
                      <span style={styles.roomStatus}>等待中</span>
                      <span style={styles.joinBtn}>加入 →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>

      {/* 创建房间弹窗 */}
      {showCreateModal && (
        <div style={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>创建房间</h3>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>游戏类型</label>
              <select
                style={styles.formInput}
                value={createForm.game_type}
                onChange={(e) => setCreateForm({ ...createForm, game_type: e.target.value })}
              >
                {gameTypes.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>房间名称（可选）</label>
              <input
                style={styles.formInput}
                placeholder="给房间起个名字"
                value={createForm.room_name}
                onChange={(e) => setCreateForm({ ...createForm, room_name: e.target.value })}
              />
            </div>

            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>总局数</label>
                <input
                  style={styles.formInput}
                  type="number"
                  min="4"
                  max="32"
                  value={createForm.total_rounds}
                  onChange={(e) => setCreateForm({ ...createForm, total_rounds: parseInt(e.target.value) })}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>底分</label>
                <input
                  style={styles.formInput}
                  type="number"
                  min="10"
                  value={createForm.base_score}
                  onChange={(e) => setCreateForm({ ...createForm, base_score: parseInt(e.target.value) })}
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>房间密码（可选，4 位数字）</label>
              <input
                style={styles.formInput}
                placeholder="留空为公开房间"
                maxLength={4}
                value={createForm.room_password}
                onChange={(e) => setCreateForm({ ...createForm, room_password: e.target.value.replace(/\D/g, "") })}
              />
            </div>

            <div style={styles.modalButtons}>
              <button style={styles.cancelBtn} onClick={() => setShowCreateModal(false)}>
                取消
              </button>
              <button style={styles.confirmBtn} onClick={handleCreateRoom}>
                创建房间
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 加入房间弹窗 */}
      {showJoinModal && (
        <div style={styles.modalOverlay} onClick={() => setShowJoinModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>加入房间</h3>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>房间号（6 位数字）</label>
              <input
                style={styles.formInput}
                placeholder="输入 6 位房号"
                maxLength={6}
                value={joinForm.room_id}
                onChange={(e) => setJoinForm({ ...joinForm, room_id: e.target.value.replace(/\D/g, "") })}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>房间密码（可选）</label>
              <input
                style={styles.formInput}
                placeholder="私有房间需输入密码"
                maxLength={4}
                value={joinForm.room_password}
                onChange={(e) => setJoinForm({ ...joinForm, room_password: e.target.value.replace(/\D/g, "") })}
              />
            </div>

            <div style={styles.modalButtons}>
              <button style={styles.cancelBtn} onClick={() => setShowJoinModal(false)}>
                取消
              </button>
              <button style={styles.confirmBtn} onClick={handleJoinRoom}>
                加入房间
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    position: "relative",
  },
  bgImage: {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    backgroundSize: "cover",
    backgroundPosition: "center",
    zIndex: 0,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 40px",
    background: "rgba(20, 20, 30, 0.8)",
    backdropFilter: "blur(10px)",
    borderBottom: "1px solid rgba(212, 175, 55, 0.2)",
    position: "sticky",
    top: 0,
    zIndex: 10,
  },
  logo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  logoImg: {
    width: "40px",
    height: "40px",
    objectFit: "contain",
  },
  logoText: {
    color: "#d4af37",
    fontSize: "20px",
    fontWeight: "700",
    letterSpacing: "2px",
  },
  userInfo: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  badge: {
    background: "rgba(255,255,255,0.08)",
    padding: "8px 16px",
    borderRadius: "20px",
    display: "flex",
    flexDirection: "column",
  },
  balanceLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: "11px",
  },
  balanceValue: {
    color: "#ffd700",
    fontSize: "16px",
    fontWeight: "700",
  },
  iconBtn: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.08)",
    border: "none",
    cursor: "pointer",
    fontSize: "18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  logoutBtn: {
    padding: "8px 16px",
    background: "rgba(233,69,96,0.15)",
    color: "#e94560",
    border: "1px solid rgba(233,69,96,0.3)",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
  },
  main: {
    padding: "60px 40px",
    maxWidth: "1200px",
    margin: "0 auto",
    position: "relative",
    zIndex: 1,
  },
  hero: {
    marginBottom: "50px",
    textAlign: "center",
  },
  title: {
    color: "#fff",
    fontSize: "36px",
    fontWeight: "700",
    margin: "0 0 8px",
  },
  subtitle: {
    color: "rgba(255,255,255,0.5)",
    fontSize: "16px",
    margin: "0 0 24px",
  },
  heroButtons: {
    display: "flex",
    justifyContent: "center",
    gap: "16px",
  },
  primaryBtn: {
    padding: "12px 28px",
    background: "linear-gradient(135deg, #e94560, #e94560dd)",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "600",
  },
  secondaryBtn: {
    padding: "12px 28px",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "10px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "600",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: "22px",
    fontWeight: "600",
    margin: "40px 0 20px",
  },
  gameGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: "24px",
  },
  gameCard: {
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(10px)",
    padding: "40px 30px",
    borderRadius: "20px",
    textAlign: "center",
    border: "1px solid rgba(255,255,255,0.08)",
    cursor: "pointer",
    transition: "all 0.3s ease",
  },
  gameIcon: {
    fontSize: "56px",
    marginBottom: "20px",
  },
  gameName: {
    color: "#fff",
    fontSize: "20px",
    fontWeight: "600",
    margin: "0 0 8px",
  },
  gameMeta: {
    color: "rgba(255,255,255,0.4)",
    fontSize: "13px",
    margin: "0 0 24px",
  },
  playBtn: {
    padding: "10px 24px",
    borderRadius: "10px",
    color: "#fff",
    fontSize: "14px",
    fontWeight: "600",
  },
  roomList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
    gap: "16px",
  },
  roomCard: {
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(10px)",
    padding: "20px",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.08)",
    cursor: "pointer",
    transition: "all 0.2s ease",
  },
  roomHeader: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginBottom: "12px",
  },
  roomIcon: {
    fontSize: "24px",
  },
  roomId: {
    color: "#fff",
    fontSize: "18px",
    fontWeight: "700",
    fontFamily: "monospace",
  },
  privateBadge: {
    marginLeft: "auto",
    fontSize: "12px",
    color: "#f59e0b",
  },
  roomMeta: {
    display: "flex",
    gap: "16px",
    color: "rgba(255,255,255,0.5)",
    fontSize: "13px",
    marginBottom: "16px",
  },
  roomFooter: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  roomStatus: {
    color: "#10b981",
    fontSize: "13px",
  },
  joinBtn: {
    color: "#e94560",
    fontSize: "14px",
    fontWeight: "600",
  },
  modalOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.7)",
    backdropFilter: "blur(5px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 1000,
  },
  modalContent: {
    background: "#1a1a2e",
    padding: "32px",
    borderRadius: "16px",
    width: "90%",
    maxWidth: "440px",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  modalTitle: {
    color: "#fff",
    fontSize: "22px",
    fontWeight: "600",
    margin: "0 0 24px",
  },
  formGroup: {
    marginBottom: "16px",
    flex: 1,
  },
  formRow: {
    display: "flex",
    gap: "16px",
  },
  formLabel: {
    display: "block",
    color: "rgba(255,255,255,0.6)",
    fontSize: "13px",
    marginBottom: "6px",
  },
  formInput: {
    width: "100%",
    padding: "10px 14px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px",
    color: "#fff",
    fontSize: "15px",
    boxSizing: "border-box",
  },
  modalButtons: {
    display: "flex",
    gap: "12px",
    marginTop: "24px",
  },
  cancelBtn: {
    flex: 1,
    padding: "12px",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "15px",
  },
  confirmBtn: {
    flex: 1,
    padding: "12px",
    background: "linear-gradient(135deg, #e94560, #e94560dd)",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "15px",
    fontWeight: "600",
  },
};

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

/**
 * 战绩/成就页面
 * 从 wallet transactions 统计个人战绩
 */

interface Stats {
  total_hands: number;
  total_wins: number;
  total_pot_won: number;
  biggest_pot: number;
  win_rate: number;
}

const DEFAULT_STATS: Stats = {
  total_hands: 0,
  total_wins: 0,
  total_pot_won: 0,
  biggest_pot: 0,
  win_rate: 0,
};

const ACHIEVEMENTS = [
  { id: "first_win", name: "首胜", desc: "赢下第一局", icon: "🏆", condition: (s: Stats) => s.total_wins >= 1 },
  { id: "hands_10", name: "初出茅庐", desc: "完成 10 局游戏", icon: "🎯", condition: (s: Stats) => s.total_hands >= 10 },
  { id: "hands_100", name: "百场达人", desc: "完成 100 局游戏", icon: "💪", condition: (s: Stats) => s.total_hands >= 100 },
  { id: "pot_10k", name: "万手巨鳄", desc: "单局底池超 10000", icon: "💰", condition: (s: Stats) => s.biggest_pot >= 10000 },
  { id: "winrate_50", name: "常胜将军", desc: "胜率超过 50%", icon: "👑", condition: (s: Stats) => s.win_rate >= 50 },
];

export default function Achievements() {
  const navigate = useNavigate();
  const userId = useAuthStore((s) => s.userId);
  const [stats, setStats] = useState<Stats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [userId]);

  const loadStats = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL || ""}/api/wallet/transactions?user_id=${userId}&limit=200`);
      const data = await resp.json();
      const txs = data.data || [];

      const settleTxs = txs.filter((t: any) => t.type === "game_settle");
      const wins = settleTxs.filter((t: any) => t.amount > 0);

      setStats({
        total_hands: settleTxs.length,
        total_wins: wins.length,
        total_pot_won: wins.reduce((sum: number, t: any) => sum + t.amount, 0),
        biggest_pot: settleTxs.length > 0 ? Math.max(...settleTxs.map((t: any) => Math.abs(t.amount))) : 0,
        win_rate: settleTxs.length > 0 ? Math.round((wins.length / settleTxs.length) * 100) : 0,
      });
    } catch (err) {
      console.error("加载战绩失败:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate("/")}>← 大厅</button>
        <h2 style={styles.title}>🏅 我的战绩</h2>
      </header>

      {loading ? (
        <div style={styles.center}>加载中...</div>
      ) : (
        <>
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{stats.total_hands}</div>
              <div style={styles.statLabel}>总局数</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ ...styles.statValue, color: "#10b981" }}>{stats.total_wins}</div>
              <div style={styles.statLabel}>胜局</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ ...styles.statValue, color: "#c9a84c" }}>{stats.win_rate}%</div>
              <div style={styles.statLabel}>胜率</div>
            </div>
            <div style={styles.statCard}>
              <div style={{ ...styles.statValue, color: "#ef4444" }}>{stats.biggest_pot.toLocaleString()}</div>
              <div style={styles.statLabel}>最大单局</div>
            </div>
          </div>

          <h3 style={styles.sectionTitle}>成就徽章</h3>
          <div style={styles.badgesGrid}>
            {ACHIEVEMENTS.map((ach) => {
              const unlocked = ach.condition(stats);
              return (
                <div key={ach.id} style={{
                  ...styles.badge,
                  ...(unlocked ? styles.badgeUnlocked : styles.badgeLocked),
                }}>
                  <div style={{ fontSize: "32px" }}>{ach.icon}</div>
                  <div style={styles.badgeName}>{ach.name}</div>
                  <div style={styles.badgeDesc}>{ach.desc}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "100vh", background: "#1a1a2e", color: "#fff", padding: "20px" },
  header: { display: "flex", alignItems: "center", gap: "15px", marginBottom: "25px" },
  backBtn: { padding: "8px 16px", background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" },
  title: { margin: 0, fontSize: "20px" },
  center: { textAlign: "center", padding: "60px", color: "#999" },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "15px", marginBottom: "30px" },
  statCard: { background: "rgba(255,255,255,0.05)", borderRadius: "12px", padding: "20px", textAlign: "center" },
  statValue: { fontSize: "28px", fontWeight: "bold", color: "#fff" },
  statLabel: { fontSize: "13px", color: "#999", marginTop: "5px" },
  sectionTitle: { fontSize: "18px", marginBottom: "15px", color: "#c9a84c" },
  badgesGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "15px" },
  badge: { borderRadius: "12px", padding: "20px", textAlign: "center" },
  badgeUnlocked: { background: "rgba(201,168,76,0.15)", border: "1px solid rgba(201,168,76,0.3)" },
  badgeLocked: { background: "rgba(255,255,255,0.03)", opacity: 0.4 },
  badgeName: { fontWeight: "bold", marginTop: "8px", fontSize: "14px" },
  badgeDesc: { fontSize: "12px", color: "#999", marginTop: "4px" },
};

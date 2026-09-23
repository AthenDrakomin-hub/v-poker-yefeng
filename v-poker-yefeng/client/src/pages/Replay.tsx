import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";

/**
 * 牌谱回放页面
 * 接 GET /api/engine/room/:id/hand-history
 * 时间轴逐步播放发牌/下注/摊牌
 */

interface ReplayEvent {
  type: string;
  user_id?: string;
  action_type?: string;
  amount?: number;
  cards?: any[];
  pot?: number;
  timestamp: number;
}

interface HandHistory {
  room_id: string;
  game_type: string;
  base_score: number;
  exported_at: string;
  events: ReplayEvent[];
  final_results: any[];
  total_pot: number;
  side_pots: any[];
}

export default function Replay() {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();

  const [history, setHistory] = useState<HandHistory | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const playTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (roomId) loadHistory(roomId);
    return () => stopPlay();
  }, [roomId]);

  const loadHistory = async (rid: string) => {
    setLoading(true);
    setError("");
    try {
      const resp = await fetch(
        `${import.meta.env.VITE_GAME_ENGINE_URL || "http://localhost:8003"}/api/engine/room/${rid}/hand-history`
      );
      const data = await resp.json();
      if (data.code === 0) {
        setHistory(data.data);
        setCurrentStep(data.data.events.length - 1);
      } else {
        setError(data.message || "加载牌谱失败");
      }
    } catch (err: any) {
      setError("无法连接游戏引擎: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const stopPlay = () => {
    if (playTimerRef.current) {
      clearInterval(playTimerRef.current);
      playTimerRef.current = null;
    }
    setPlaying(false);
  };

  const togglePlay = () => {
    if (playing) {
      stopPlay();
    } else {
      setPlaying(true);
      playTimerRef.current = setInterval(() => {
        setCurrentStep((prev) => {
          if (prev >= (history?.events.length || 1) - 1) {
            stopPlay();
            return prev;
          }
          return prev + 1;
        });
      }, 800);
    }
  };

  const events = history?.events || [];
  const visibleEvents = events.slice(0, currentStep + 1);

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate(-1)}>← 返回</button>
        <h2 style={styles.title}>📜 牌谱回放</h2>
        {history && (
          <span style={styles.meta}>
            {history.game_type} · 底池 {history.total_pot}
          </span>
        )}
      </header>

      {loading && <div style={styles.center}>加载中...</div>}
      {error && <div style={styles.center}>{error}</div>}

      {history && (
        <>
          {/* 播放控制 */}
          <div style={styles.controls}>
            <button onClick={() => setCurrentStep(0)} style={styles.ctrlBtn}>⏮ 开头</button>
            <button onClick={() => setCurrentStep((s) => Math.max(0, s - 1))} style={styles.ctrlBtn}>◀ 上一步</button>
            <button onClick={togglePlay} style={{ ...styles.ctrlBtn, ...styles.playBtn }}>
              {playing ? "⏸ 暂停" : "▶ 播放"}
            </button>
            <button onClick={() => setCurrentStep((s) => Math.min(events.length - 1, s + 1))} style={styles.ctrlBtn}>下一步 ▶</button>
            <button onClick={() => setCurrentStep(events.length - 1)} style={styles.ctrlBtn}>结尾 ⏭</button>
          </div>

          {/* 进度条 */}
          <div style={styles.progressBar}>
            <div
              style={{
                ...styles.progressFill,
                width: `${((currentStep + 1) / Math.max(events.length, 1)) * 100}%`,
              }}
            />
          </div>
          <div style={styles.stepInfo}>步骤 {currentStep + 1} / {events.length}</div>

          {/* 事件时间轴 */}
          <div style={styles.timeline}>
            {visibleEvents.map((ev, idx) => (
              <div key={idx} style={{
                ...styles.eventRow,
                ...(idx === currentStep ? styles.eventActive : {}),
              }}>
                <span style={styles.eventIndex}>#{idx + 1}</span>
                <span style={styles.eventType}>{formatEventType(ev.type)}</span>
                {ev.user_id && <span style={styles.eventUser}>{ev.user_id}</span>}
                {ev.action_type && <span style={styles.eventAction}>{ev.action_type}</span>}
                {ev.amount ? <span style={styles.eventAmount}>{ev.amount}</span> : null}
              </div>
            ))}
          </div>

          {/* 最终结果 */}
          {history.final_results?.length > 0 && (
            <div style={styles.results}>
              <h3>结算结果</h3>
              {history.final_results.map((r, i) => (
                <div key={i} style={{
                  ...styles.resultRow,
                  ...(r.net_amount > 0 ? styles.winRow : r.net_amount < 0 ? styles.loseRow : {}),
                }}>
                  <span>{r.user_id}</span>
                  <span>{r.hand_name || ""}</span>
                  <span>{r.net_amount > 0 ? "+" : ""}{r.net_amount}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function formatEventType(type: string): string {
  const map: Record<string, string> = {
    deal: "发牌",
    action: "动作",
    settle: "结算",
    blind: "盲注",
    community: "公共牌",
    fold: "弃牌",
  };
  return map[type] || type;
}

const styles: Record<string, React.CSSProperties> = {
  container: { minHeight: "100vh", background: "#1a1a2e", color: "#fff", padding: "20px" },
  header: { display: "flex", alignItems: "center", gap: "15px", marginBottom: "20px" },
  backBtn: { padding: "8px 16px", background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" },
  title: { margin: 0, fontSize: "20px" },
  meta: { marginLeft: "auto", color: "#999", fontSize: "14px" },
  center: { textAlign: "center", padding: "60px", color: "#999" },
  controls: { display: "flex", gap: "8px", justifyContent: "center", marginBottom: "15px", flexWrap: "wrap" },
  ctrlBtn: { padding: "8px 16px", background: "rgba(255,255,255,0.1)", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer" },
  playBtn: { background: "#c9a84c", color: "#000", fontWeight: "bold" },
  progressBar: { height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", marginBottom: "5px" },
  progressFill: { height: "100%", background: "#c9a84c", borderRadius: "3px", transition: "width 0.3s" },
  stepInfo: { textAlign: "center", color: "#999", fontSize: "12px", marginBottom: "15px" },
  timeline: { background: "rgba(255,255,255,0.05)", borderRadius: "8px", padding: "15px", maxHeight: "400px", overflowY: "auto" },
  eventRow: { display: "flex", gap: "12px", padding: "6px 10px", borderBottom: "1px solid rgba(255,255,255,0.05)", fontSize: "14px" },
  eventActive: { background: "rgba(201,168,76,0.15)", borderRadius: "4px" },
  eventIndex: { color: "#666", minWidth: "30px" },
  eventType: { color: "#c9a84c", minWidth: "60px" },
  eventUser: { color: "#fff", minWidth: "100px" },
  eventAction: { color: "#10b981" },
  eventAmount: { color: "#ef4444", marginLeft: "auto" },
  results: { marginTop: "20px", background: "rgba(255,255,255,0.05)", borderRadius: "8px", padding: "15px" },
  resultRow: { display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" },
  winRow: { color: "#10b981" },
  loseRow: { color: "#ef4444" },
};

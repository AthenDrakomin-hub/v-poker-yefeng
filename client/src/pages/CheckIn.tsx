import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function CheckIn() {
  const navigate = useNavigate();
  const [checkedIn, setCheckedIn] = useState(false);
  const [streak] = useState(7);

  const dailyReward = [100, 200, 300, 500, 800, 1000, 2000];

  const tasks = [
    { id: 1, title: "完成 1 局游戏", progress: "1/1", reward: 50, done: true },
    { id: 2, title: "完成 5 局游戏", progress: "3/5", reward: 100, done: false },
    { id: 3, title: "赢得 3 局胜利", progress: "1/3", reward: 150, done: false },
    { id: 4, title: "累计下注 ¥10,000", progress: "6,500/10,000", reward: 200, done: false },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", padding: "20px" }}>
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#888", fontSize: "16px", cursor: "pointer", marginBottom: "20px" }}>← 返回</button>
        <h2 style={{ color: "#fff", marginBottom: "20px" }}>签到 / 任务</h2>

        {/* 签到卡片 */}
        <div style={{ background: "linear-gradient(135deg, #1a1f2e 0%, #2a2040 100%)", borderRadius: "12px", padding: "25px", textAlign: "center" }}>
          <div style={{ color: "#d4af37", fontSize: "14px", marginBottom: "5px" }}>连续签到</div>
          <div style={{ color: "#fff", fontSize: "32px", fontWeight: "bold" }}>{streak} 天 🔥</div>

          <div style={{ display: "flex", justifyContent: "center", gap: "8px", marginTop: "20px" }}>
            {dailyReward.map((reward, i) => (
              <div key={i} style={{
                width: "50px", padding: "10px 5px", borderRadius: "8px", textAlign: "center",
                background: i < streak ? "#d4af37" : "#2a3040",
                color: i < streak ? "#000" : "#888",
              }}>
                <div style={{ fontSize: "18px" }}>{i < streak ? "✓" : i + 1}</div>
                <div style={{ fontSize: "10px", marginTop: "2px" }}>¥{reward}</div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setCheckedIn(true)}
            disabled={checkedIn}
            style={{
              marginTop: "20px", padding: "12px 40px", borderRadius: "8px", border: "none",
              background: checkedIn ? "#333" : "#d4af37", color: checkedIn ? "#666" : "#000",
              fontSize: "16px", fontWeight: "bold", cursor: checkedIn ? "default" : "pointer"
            }}
          >
            {checkedIn ? "今日已签到" : "立即签到"}
          </button>
        </div>

        {/* 任务列表 */}
        <h3 style={{ color: "#fff", margin: "25px 0 15px" }}>每日任务</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {tasks.map((task) => (
            <div key={task.id} style={{
              background: "#1a1f2e", borderRadius: "10px", padding: "15px",
              display: "flex", justifyContent: "space-between", alignItems: "center",
              opacity: task.done ? 0.7 : 1
            }}>
              <div>
                <div style={{ color: "#fff", fontSize: "15px" }}>{task.title}</div>
                <div style={{ color: "#888", fontSize: "13px", marginTop: "3px" }}>{task.progress}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ color: "#d4af37", fontSize: "14px" }}>¥{task.reward}</div>
                <button
                  disabled={task.done}
                  style={{
                    marginTop: "5px", padding: "6px 14px", borderRadius: "6px", border: "none",
                    background: task.done ? "#333" : "#d4af37", color: task.done ? "#666" : "#000",
                    fontSize: "13px", cursor: task.done ? "default" : "pointer"
                  }}
                >
                  {task.done ? "已完成" : "领取"}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

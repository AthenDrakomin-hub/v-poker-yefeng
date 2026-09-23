import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface Notification {
  id: number;
  type: "system" | "settlement" | "friend" | "promotion";
  title: string;
  content: string;
  time: string;
  read: boolean;
}

const mockNotifications: Notification[] = [
  { id: 1, type: "settlement", title: "结算通知", content: "您在房间 #1234 获得了 ¥5,200", time: "2分钟前", read: false },
  { id: 2, type: "friend", title: "好友请求", content: "玩家_888 想加您为好友", time: "1小时前", read: false },
  { id: 3, type: "system", title: "系统通知", content: "系统将于今晚 02:00 进行维护", time: "3小时前", read: true },
  { id: 4, type: "promotion", title: "活动奖励", content: "恭喜您完成每日签到，获得 ¥100", time: "昨天", read: true },
  { id: 5, type: "settlement", title: "结算通知", content: "您在房间 #1230 输了 ¥800", time: "昨天", read: true },
];

const typeColors: Record<string, string> = {
  system: "#3498db",
  settlement: "#2ecc71",
  friend: "#9b59b6",
  promotion: "#e74c3c",
};

const typeIcons: Record<string, string> = {
  system: "📢",
  settlement: "💰",
  friend: "👤",
  promotion: "🎁",
};

export default function Notifications() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState(mockNotifications);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  const unreadCount = notifications.filter((n) => !n.read).length;
  const filtered = filter === "unread" ? notifications.filter((n) => !n.read) : notifications;

  const markAllRead = () => setNotifications(notifications.map((n) => ({ ...n, read: true })));

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", padding: "20px" }}>
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#888", fontSize: "16px", cursor: "pointer" }}>← 返回</button>
          <h2 style={{ color: "#fff", margin: 0 }}>通知中心</h2>
          <button onClick={markAllRead} style={{ background: "none", border: "1px solid #d4af37", color: "#d4af37", padding: "6px 12px", borderRadius: "6px", fontSize: "13px", cursor: "pointer" }}>
            全部已读
          </button>
        </div>

        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: "8px 16px", borderRadius: "6px", border: "none", cursor: "pointer",
                background: filter === f ? "#d4af37" : "#1a1f2e",
                color: filter === f ? "#000" : "#888", fontSize: "14px"
              }}
            >
              {f === "all" ? "全部" : `未读 (${unreadCount})`}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {filtered.map((n) => (
            <div key={n.id} style={{
              background: n.read ? "#1a1f2e" : "#1e2538",
              borderRadius: "10px", padding: "15px",
              borderLeft: `3px solid ${typeColors[n.type]}`,
              opacity: n.read ? 0.7 : 1
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "20px" }}>{typeIcons[n.type]}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "#fff", fontWeight: "bold", fontSize: "14px" }}>{n.title}</span>
                    <span style={{ color: "#666", fontSize: "12px" }}>{n.time}</span>
                  </div>
                  <p style={{ color: "#aaa", fontSize: "13px", margin: "5px 0 0" }}>{n.content}</p>
                </div>
                {!n.read && <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#e74c3c" }} />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

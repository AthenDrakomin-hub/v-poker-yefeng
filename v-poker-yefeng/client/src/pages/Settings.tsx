import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const navigate = useNavigate();
  const [settings, setSettings] = useState({
    sound: true,
    music: true,
    vibration: false,
    darkMode: true,
    notifications: true,
    autoReconnect: true,
    showChat: true,
    handHistory: true,
  });

  const Toggle = ({ label, keyName }: { label: string; keyName: keyof typeof settings }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "15px 0", borderBottom: "1px solid #2a3040" }}>
      <span style={{ color: "#ccc", fontSize: "15px" }}>{label}</span>
      <button
        onClick={() => setSettings({ ...settings, [keyName]: !settings[keyName] })}
        style={{
          width: "50px", height: "28px", borderRadius: "14px",
          background: settings[keyName] ? "#d4af37" : "#333",
          border: "none", cursor: "pointer", position: "relative", transition: "background 0.2s"
        }}
      >
        <div style={{
          width: "22px", height: "22px", borderRadius: "50%", background: "#fff",
          position: "absolute", top: "3px", left: settings[keyName] ? "25px" : "3px", transition: "left 0.2s"
        }} />
      </button>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", padding: "20px" }}>
      <div style={{ maxWidth: "500px", margin: "0 auto" }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#888", fontSize: "16px", cursor: "pointer", marginBottom: "20px" }}>← 返回</button>
        <h2 style={{ color: "#fff", marginBottom: "20px" }}>设置</h2>

        <div style={{ background: "#1a1f2e", borderRadius: "12px", padding: "20px" }}>
          <h3 style={{ color: "#d4af37", fontSize: "14px", margin: "0 0 10px" }}>音效</h3>
          <Toggle label="音效" keyName="sound" />
          <Toggle label="背景音乐" keyName="music" />
          <Toggle label="震动反馈" keyName="vibration" />
        </div>

        <div style={{ background: "#1a1f2e", borderRadius: "12px", padding: "20px", marginTop: "15px" }}>
          <h3 style={{ color: "#d4af37", fontSize: "14px", margin: "0 0 10px" }}>显示</h3>
          <Toggle label="暗色模式" keyName="darkMode" />
          <Toggle label="显示聊天" keyName="showChat" />
          <Toggle label="显示牌谱" keyName="handHistory" />
        </div>

        <div style={{ background: "#1a1f2e", borderRadius: "12px", padding: "20px", marginTop: "15px" }}>
          <h3 style={{ color: "#d4af37", fontSize: "14px", margin: "0 0 10px" }}>通知</h3>
          <Toggle label="推送通知" keyName="notifications" />
          <Toggle label="自动重连" keyName="autoReconnect" />
        </div>

        <div style={{ marginTop: "20px", padding: "20px", background: "#1a1f2e", borderRadius: "12px" }}>
          <button style={{ width: "100%", padding: "12px", background: "#e74c3c", color: "#fff", border: "none", borderRadius: "8px", fontSize: "15px", cursor: "pointer" }}>
            退出登录
          </button>
        </div>
      </div>
    </div>
  );
}

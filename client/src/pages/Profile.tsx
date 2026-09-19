import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

export default function Profile() {
  const navigate = useNavigate();
  const { userId, username, balance } = useAuthStore();
  const [avatar] = useState(`https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`);

  const stats = [
    { label: "总局数", value: "128" },
    { label: "胜率", value: "47.6%" },
    { label: "最大底池", value: "¥128,500" },
    { label: "排名", value: "#23" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", padding: "20px" }}>
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#888", fontSize: "16px", cursor: "pointer", marginBottom: "20px" }}>← 返回</button>

        <div style={{ background: "#1a1f2e", borderRadius: "12px", padding: "30px", textAlign: "center" }}>
          <img src={avatar} alt="avatar" style={{ width: "80px", height: "80px", borderRadius: "50%", border: "3px solid #d4af37" }} />
          <h2 style={{ color: "#fff", margin: "15px 0 5px" }}>{username || "玩家"}</h2>
          <p style={{ color: "#888", fontSize: "14px" }}>ID: {userId}</p>
          <p style={{ color: "#d4af37", fontSize: "24px", fontWeight: "bold", margin: "15px 0" }}>¥{balance.toLocaleString()}</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginTop: "20px" }}>
          {stats.map((s, i) => (
            <div key={i} style={{ background: "#1a1f2e", borderRadius: "10px", padding: "20px", textAlign: "center" }}>
              <div style={{ color: "#888", fontSize: "13px" }}>{s.label}</div>
              <div style={{ color: "#fff", fontSize: "22px", fontWeight: "bold", marginTop: "5px" }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: "20px", background: "#1a1f2e", borderRadius: "10px", padding: "20px" }}>
          <h3 style={{ color: "#fff", margin: "0 0 15px" }}>账号设置</h3>
          {["修改昵称", "修改密码", "绑定手机", "实名认证"].map((item, i) => (
            <div key={i} style={{ padding: "12px 0", borderBottom: "1px solid #2a3040", color: "#ccc", cursor: "pointer" }}>
              {item} →
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

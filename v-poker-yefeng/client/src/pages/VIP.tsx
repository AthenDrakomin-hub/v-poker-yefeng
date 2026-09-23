import { useNavigate } from "react-router-dom";

const vipLevels = [
  { level: "VIP 0", name: "青铜", min: 0, benefits: ["基础功能", "每日签到"], color: "#b87333" },
  { level: "VIP 1", name: "白银", min: 10000, benefits: ["专属客服", "额外签到奖励", "优先匹配"], color: "#c0c0c0" },
  { level: "VIP 2", name: "黄金", min: 50000, benefits: ["专属客服", "双倍签到", "专属表情", "每月礼物"], color: "#ffd700" },
  { level: "VIP 3", name: "铂金", min: 200000, benefits: ["专属客服经理", "三倍签到", "专属头像框", "生日礼物", "邀请奖励加成"], color: "#e5e4e2" },
];

export default function VIP() {
  const navigate = useNavigate();
  const currentExp = 35000;
  const nextLevel = vipLevels[1];
  const progress = Math.min(100, (currentExp / nextLevel.min) * 100);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", padding: "20px" }}>
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#888", fontSize: "16px", cursor: "pointer", marginBottom: "20px" }}>← 返回</button>
        <h2 style={{ color: "#fff", marginBottom: "20px" }}>会员中心</h2>

        {/* 当前等级 */}
        <div style={{ background: "linear-gradient(135deg, #2a2040 0%, #1a1f2e 100%)", borderRadius: "12px", padding: "25px", textAlign: "center" }}>
          <div style={{ fontSize: "48px" }}>🥈</div>
          <div style={{ color: "#c0c0c0", fontSize: "24px", fontWeight: "bold", marginTop: "10px" }}>VIP 1 白银</div>
          <div style={{ color: "#888", fontSize: "14px", marginTop: "5px" }}>当前经验值: {currentExp.toLocaleString()}</div>

          <div style={{ marginTop: "15px", background: "#2a3040", borderRadius: "10px", height: "12px", overflow: "hidden" }}>
            <div style={{ width: `${progress}%`, height: "100%", background: "linear-gradient(90deg, #c0c0c0, #ffd700)", transition: "width 0.5s" }} />
          </div>
          <div style={{ color: "#888", fontSize: "12px", marginTop: "8px" }}>距离 VIP 2 还需 ¥{(nextLevel.min - currentExp).toLocaleString()}</div>
        </div>

        {/* 等级列表 */}
        <h3 style={{ color: "#fff", margin: "25px 0 15px" }}>等级特权</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {vipLevels.map((vip, i) => (
            <div key={i} style={{
              background: "#1a1f2e", borderRadius: "12px", padding: "20px",
              border: i === 1 ? `2px solid ${vip.color}` : "none",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "50%", background: vip.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>
                  {["🥉", "🥈", "🥇", "💎"][i]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ color: vip.color, fontSize: "16px", fontWeight: "bold" }}>{vip.level} {vip.name}</div>
                  <div style={{ color: "#888", fontSize: "13px" }}>累计充值 ¥{vip.min.toLocaleString()}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "12px" }}>
                {vip.benefits.map((b, j) => (
                  <span key={j} style={{ background: "#2a3040", color: "#aaa", padding: "4px 10px", borderRadius: "6px", fontSize: "12px" }}>{b}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

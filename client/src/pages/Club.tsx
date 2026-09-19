import { useNavigate } from "react-router-dom";

const clubs = [
  { id: 1, name: "王者俱乐部", members: 128, online: 45, desc: "高手云集，欢迎挑战", tag: "热门" },
  { id: 2, name: "休闲娱乐局", members: 256, online: 89, desc: "小局娱乐，轻松休闲", tag: "休闲" },
  { id: 3, name: "土豪俱乐部", members: 64, online: 23, desc: "大额桌，慎入", tag: "大额" },
  { id: 4, name: "新手训练营", members: 512, online: 156, desc: "新手友好，从这里开始", tag: "新手" },
];

const tagColors: Record<string, string> = {
  热门: "#e74c3c",
  休闲: "#2ecc71",
  大额: "#d4af37",
  新手: "#3498db",
};

export default function Club() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", padding: "20px" }}>
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#888", fontSize: "16px", cursor: "pointer" }}>← 返回</button>
          <h2 style={{ color: "#fff", margin: 0 }}>俱乐部</h2>
          <button onClick={() => alert("创建俱乐部功能开发中")} style={{ padding: "8px 16px", background: "#d4af37", color: "#000", border: "none", borderRadius: "6px", fontSize: "14px", cursor: "pointer" }}>
            + 创建
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {clubs.map((club) => (
            <div key={club.id} style={{ background: "#1a1f2e", borderRadius: "12px", padding: "18px", cursor: "pointer" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <span style={{ color: "#fff", fontSize: "17px", fontWeight: "bold" }}>{club.name}</span>
                    <span style={{ background: tagColors[club.tag], color: "#000", padding: "2px 8px", borderRadius: "4px", fontSize: "11px" }}>{club.tag}</span>
                  </div>
                  <p style={{ color: "#888", fontSize: "14px", margin: "8px 0" }}>{club.desc}</p>
                  <div style={{ display: "flex", gap: "15px", color: "#666", fontSize: "13px" }}>
                    <span>👥 {club.members} 人</span>
                    <span>🟢 {club.online} 在线</span>
                  </div>
                </div>
                <button style={{ padding: "8px 16px", background: "#2a3040", color: "#d4af37", border: "1px solid #d4af37", borderRadius: "6px", fontSize: "14px", cursor: "pointer" }}>
                  加入
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useNavigate } from "react-router-dom";

const faqs = [
  { q: "如何充值筹码？", a: "请联系客服或通过代理渠道充值。" },
  { q: "如何提现？", a: "达到最低提现金额后，可在钱包页申请提现。" },
  { q: "游戏规则是什么？", a: "支持德州扑克、炸金花、牛牛、三公四种游戏。" },
  { q: "如何邀请好友？", a: "在好友页点击邀请，生成邀请链接分享给好友。" },
  { q: "遇到 Bug 怎么办？", a: "请联系在线客服，或发送邮件至 support@vpoker.com" },
];

const rules = [
  { title: "德州扑克规则", content: "使用标准52张牌，每位玩家发2张底牌，公共牌5张，组合最大5张牌获胜。" },
  { title: "炸金花规则", content: "每位玩家发3张牌，比牌型大小：豹子>顺金>金花>顺子>对子>单张。" },
  { title: "牛牛规则", content: "每位玩家发5张牌，3张凑10的倍数为有牛，剩余2张算牛数。" },
  { title: "三公规则", content: "每位玩家发3张牌，比点数大小：三公>二公>一公>无公。" },
];

export default function Help() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"faq" | "rules">("faq");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0e1a", padding: "20px" }}>
      <div style={{ maxWidth: "600px", margin: "0 auto" }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#888", fontSize: "16px", cursor: "pointer", marginBottom: "20px" }}>← 返回</button>
        <h2 style={{ color: "#fff", marginBottom: "20px" }}>帮助中心</h2>

        {/* 客服入口 */}
        <div style={{ background: "linear-gradient(135deg, #1a2a3a 0%, #1a1f2e 100%)", borderRadius: "12px", padding: "20px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "15px" }}>
          <div style={{ fontSize: "40px" }}>💬</div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontSize: "16px", fontWeight: "bold" }}>在线客服</div>
            <div style={{ color: "#888", fontSize: "13px", marginTop: "3px" }}>7×24 小时在线，平均 30 秒响应</div>
          </div>
          <button style={{ padding: "10px 20px", background: "#d4af37", color: "#000", border: "none", borderRadius: "8px", fontSize: "14px", cursor: "pointer" }}>
            联系客服
          </button>
        </div>

        {/* Tab 切换 */}
        <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
          {(["faq", "rules"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: "10px 20px", borderRadius: "6px", border: "none", cursor: "pointer",
                background: tab === t ? "#d4af37" : "#1a1f2e",
                color: tab === t ? "#000" : "#888", fontSize: "14px"
              }}
            >
              {t === "faq" ? "常见问题" : "游戏规则"}
            </button>
          ))}
        </div>

        {tab === "faq" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {faqs.map((faq, i) => (
              <div key={i} style={{ background: "#1a1f2e", borderRadius: "10px", padding: "15px" }}>
                <div
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{ display: "flex", justifyContent: "space-between", cursor: "pointer" }}
                >
                  <span style={{ color: "#fff", fontSize: "15px" }}>{faq.q}</span>
                  <span style={{ color: "#888" }}>{openFaq === i ? "−" : "+"}</span>
                </div>
                {openFaq === i && (
                  <p style={{ color: "#aaa", fontSize: "14px", marginTop: "10px", marginBottom: 0 }}>{faq.a}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {rules.map((rule, i) => (
              <div key={i} style={{ background: "#1a1f2e", borderRadius: "10px", padding: "15px" }}>
                <div style={{ color: "#d4af37", fontSize: "15px", fontWeight: "bold" }}>{rule.title}</div>
                <p style={{ color: "#aaa", fontSize: "14px", marginTop: "8px", marginBottom: 0 }}>{rule.content}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

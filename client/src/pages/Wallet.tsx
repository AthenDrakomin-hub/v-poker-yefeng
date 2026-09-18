import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

const txTypeColors: Record<string, string> = {
  mint: "#10b981",
  transfer: "#3b82f6",
  bet: "#f59e0b",
  refund: "#8b5cf6",
  game_settle: "#e94560",
};

export default function Wallet() {
  const navigate = useNavigate();
  const userId = localStorage.getItem('vp_user_id') || '';
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [transferTo, setTransferTo] = useState("");
  const [transferAmount, setTransferAmount] = useState("");
  const [showTransfer, setShowTransfer] = useState(false);

  useEffect(() => {
    loadData();
  }, [userId]);

  const loadData = async () => {
    try {
      const bal = await api.getBalance(userId);
      setBalance(bal.balance);
      const txs = await api.getTransactions(userId);
      setTransactions(txs);
    } catch (err) {
      console.error("Failed to load wallet:", err);
    }
  };

  const handleTransfer = async () => {
    try {
      await api.transfer(userId, transferTo, Number(transferAmount));
      setTransferTo("");
      setTransferAmount("");
      setShowTransfer(false);
      loadData();
    } catch (err: any) {
      alert("转账失败: " + err.message);
    }
  };

  return (
    <div style={styles.container}>
      {/* 顶部导航 */}
      <header style={styles.header}>
        <button style={styles.backBtn} onClick={() => navigate('/')}>←</button>
        <h2 style={styles.title}>我的钱包</h2>
        <button style={styles.transferToggle} onClick={() => setShowTransfer(!showTransfer)}>
          + 转账
        </button>
      </header>

      <main style={styles.main}>
        {/* 余额卡片 */}
        <div style={styles.balanceCard}>
          <div style={styles.balanceIcon}>💰</div>
          <div>
            <p style={styles.balanceLabel}>可用余额</p>
            <p style={styles.balanceValue}>{balance.toLocaleString()}</p>
            <p style={styles.balanceUnit}>筹码</p>
          </div>
        </div>

        {/* 转账面板 */}
        {showTransfer && (
          <div style={styles.transferPanel}>
            <h3 style={styles.panelTitle}>自由转账</h3>
            <input
              style={styles.input}
              placeholder="接收人 ID"
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
            />
            <input
              style={styles.input}
              placeholder="转账金额"
              type="number"
              value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)}
            />
            <button style={styles.transferBtn} onClick={handleTransfer}>
              确认转账
            </button>
            <p style={styles.tip}>手续费: 0.01% (万分之一)</p>
          </div>
        )}

        {/* 交易记录 */}
        <div style={styles.txSection}>
          <h3 style={styles.panelTitle}>交易记录</h3>
          <div style={styles.txList}>
            {transactions.length === 0 ? (
              <p style={styles.emptyText}>暂无交易记录</p>
            ) : (
              transactions.map((tx, idx) => {
                const isOutgoing = tx.from_wallet_id?.includes(userId);
                const color = txTypeColors[tx.type] || "#999";
                return (
                  <div key={idx} style={styles.txItem}>
                    <div style={styles.txLeft}>
                      <span style={{ ...styles.txTypeBadge, background: `${color}20`, color }}>
                        {tx.type}
                      </span>
                      <span style={styles.txRemark}>{tx.remark || tx.transaction_id}</span>
                    </div>
                    <div style={styles.txRight}>
                      <span style={{ ...styles.txAmount, color: isOutgoing ? "#ef4444" : "#10b981" }}>
                        {isOutgoing ? "-" : "+"}{tx.amount.toLocaleString()}
                      </span>
                      <span style={styles.txTime}>
                        {new Date(tx.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: "100vh",
    background: "radial-gradient(ellipse at top, #1a1a2e 0%, #0d0d1a 100%)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    padding: "16px 40px",
    background: "rgba(255,255,255,0.03)",
    backdropFilter: "blur(10px)",
    borderBottom: "1px solid rgba(255,255,255,0.05)",
    position: "sticky",
    top: 0,
  },
  backBtn: {
    width: "40px",
    height: "40px",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.08)",
    color: "#fff",
    border: "none",
    cursor: "pointer",
    fontSize: "16px",
  },
  title: {
    color: "#fff",
    fontSize: "18px",
    fontWeight: "600",
    margin: 0,
    flex: 1,
  },
  transferToggle: {
    padding: "8px 16px",
    background: "rgba(233,69,96,0.15)",
    color: "#e94560",
    border: "1px solid rgba(233,69,96,0.3)",
    borderRadius: "8px",
    cursor: "pointer",
    fontSize: "13px",
  },
  main: {
    padding: "30px 40px",
    maxWidth: "600px",
    margin: "0 auto",
  },
  balanceCard: {
    background: "linear-gradient(135deg, rgba(233,69,96,0.2) 0%, rgba(15,52,96,0.4) 100%)",
    backdropFilter: "blur(20px)",
    border: "1px solid rgba(255,255,255,0.1)",
    padding: "30px",
    borderRadius: "20px",
    marginBottom: "24px",
    display: "flex",
    alignItems: "center",
    gap: "20px",
  },
  balanceIcon: {
    fontSize: "48px",
  },
  balanceLabel: {
    color: "rgba(255,255,255,0.5)",
    fontSize: "13px",
    margin: 0,
  },
  balanceValue: {
    color: "#ffd700",
    fontSize: "36px",
    fontWeight: "700",
    margin: "4px 0",
  },
  balanceUnit: {
    color: "rgba(255,255,255,0.4)",
    fontSize: "12px",
    margin: 0,
  },
  transferPanel: {
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.08)",
    padding: "24px",
    borderRadius: "16px",
    marginBottom: "24px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  panelTitle: {
    color: "#fff",
    fontSize: "16px",
    fontWeight: "600",
    margin: "0 0 8px",
  },
  input: {
    padding: "12px 16px",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.05)",
    color: "#fff",
    fontSize: "14px",
    outline: "none",
  },
  transferBtn: {
    padding: "12px",
    background: "linear-gradient(135deg, #e94560 0%, #ff6b9d 100%)",
    color: "#fff",
    border: "none",
    borderRadius: "10px",
    fontSize: "14px",
    fontWeight: "600",
    cursor: "pointer",
    marginTop: "8px",
  },
  tip: {
    color: "rgba(255,255,255,0.4)",
    fontSize: "12px",
    margin: 0,
  },
  txSection: {
    background: "rgba(255,255,255,0.04)",
    backdropFilter: "blur(10px)",
    border: "1px solid rgba(255,255,255,0.08)",
    padding: "24px",
    borderRadius: "16px",
  },
  txList: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  txItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 16px",
    background: "rgba(255,255,255,0.03)",
    borderRadius: "10px",
  },
  txLeft: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  txTypeBadge: {
    padding: "4px 10px",
    borderRadius: "6px",
    fontSize: "12px",
    fontWeight: "500",
  },
  txRemark: {
    color: "rgba(255,255,255,0.5)",
    fontSize: "13px",
  },
  txRight: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
  },
  txAmount: {
    fontWeight: "700",
    fontSize: "15px",
  },
  txTime: {
    color: "rgba(255,255,255,0.4)",
    fontSize: "11px",
  },
  emptyText: {
    color: "rgba(255,255,255,0.3)",
    textAlign: "center",
    padding: "30px 0",
  },
};

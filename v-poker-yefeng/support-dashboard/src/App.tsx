import { useState, useEffect } from 'react'
import axios from 'axios'

const BFF_URL = '/api'

function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [supportId, setSupportId] = useState('')
  const [page, setPage] = useState('dashboard')
  const [data, setData] = useState<any>(null)
  const [selectedTicket, setSelectedTicket] = useState<any>(null)
  const [replyText, setReplyText] = useState('')
  const [searchPlayer, setSearchPlayer] = useState('')
  const [playerData, setPlayerData] = useState<any>(null)
  const [transferTo, setTransferTo] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferResult, setTransferResult] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await axios.post(BFF_URL + '/auth/login', { username, password })
      localStorage.setItem('support_token', res.data.data.access_token)
      setSupportId(res.data.data.user.user_id)
      setLoggedIn(true)
    } catch (err: any) {
      setError(err.response?.data?.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchData = async (path: string) => {
    try {
      const token = localStorage.getItem('support_token')
      const res = await axios.get(BFF_URL + path, {
        headers: { Authorization: 'Bearer ' + token }
      })
      setData(res.data.data)
    } catch (err: any) {
      console.error('加载失败:', err)
    }
  }

  useEffect(() => {
    if (loggedIn) {
      if (page === 'dashboard') fetchData('/support/dashboard')
      else if (page === 'tickets') fetchData('/support/tickets')
    }
  }, [page, loggedIn])

  const handleSearchPlayer = async () => {
    if (!searchPlayer) return
    try {
      const token = localStorage.getItem('support_token')
      // 并行查询：玩家档案 + 余额 + 交易流水
      const [profileRes, balanceRes, txRes] = await Promise.all([
        axios.get(BFF_URL + '/support/player_profile?user_id=' + searchPlayer, {
          headers: { Authorization: 'Bearer ' + token }
        }),
        axios.get(BFF_URL + '/support/balance?user_id=' + searchPlayer, {
          headers: { Authorization: 'Bearer ' + token }
        }),
        axios.get(BFF_URL + '/support/transactions?user_id=' + searchPlayer + '&limit=20', {
          headers: { Authorization: 'Bearer ' + token }
        })
      ])
      const profile = profileRes.data.data
      const balance = balanceRes.data.data
      const transactions = txRes.data.data
      setPlayerData({
        ...profile,
        wallet: { balance: balance?.balance || profile?.wallet?.balance || 0 },
        recent_transactions: transactions || profile?.recent_transactions || []
      })
    } catch (err: any) {
      setPlayerData(null)
      alert('查询失败: ' + (err.response?.data?.message || err.message))
    }
  }

  if (!loggedIn) {
    return (
      <div style={styles.loginContainer}>
        <div
          style={{
            ...styles.bgImage,
            backgroundImage: `url(/assets/backgrounds/login_bg.png)`,
          }}
        />
        <div style={styles.loginCard}>
          <img src="/assets/ui/logo.png" alt="V-POKER" style={styles.logoImg} />
          <h1 style={styles.title}>V-POKER 客服端</h1>
          <p style={styles.subtitle}>工单处理 · 玩家查询</p>
          <form onSubmit={login} style={styles.form}>
            <input
              style={styles.input}
              type="text"
              placeholder="客服账号"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
            <input
              style={styles.input}
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error && <p style={styles.error}>{error}</p>}
            <button type="submit" style={styles.button} disabled={loading}>
              {loading ? '登录中...' : '登 录'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  const navItems = [
    { id: 'dashboard', label: '仪表盘', icon: '📊' },
    { id: 'transfer', label: '筹码转账', icon: '💸' },
    { id: 'tickets', label: '工单列表', icon: '🎫' },
    { id: 'player', label: '玩家查询', icon: '🔍' },
  ]

  const ticketsList = (data && data.tickets) || []

  return (
    <div style={styles.container}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarLogo}>🎧 客服后台</div>
        <nav style={styles.nav}>
          {navItems.map(function(item: any) {
            return (
              <div
                key={item.id}
                style={page === item.id ? styles.navItemActive : styles.navItem}
                onClick={function() { setPage(item.id); setSelectedTicket(null) }}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </div>
            )
          })}
        </nav>
      </aside>

      <main style={styles.main}>
        <header style={styles.header}>
          <div style={styles.welcome}>欢迎，{supportId}</div>
          <button
            style={styles.logoutBtn}
            onClick={function() {
              localStorage.removeItem('support_token')
              setLoggedIn(false)
            }}
          >
            退出
          </button>
        </header>

        <div style={styles.content}>
          {page === 'dashboard' && (
            <div>
              <h2 style={styles.pageTitle}>仪表盘</h2>
              <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                  <div>
                    <div style={styles.statLabel}>待处理工单</div>
                    <div style={{...styles.statValue, color: 'var(--vp-warning)'}}>{data?.open || 0}</div>
                  </div>
                </div>
                <div style={styles.statCard}>
                  <div>
                    <div style={styles.statLabel}>处理中</div>
                    <div style={{...styles.statValue, color: 'var(--vp-info)'}}>{data?.processing || 0}</div>
                  </div>
                </div>
                <div style={styles.statCard}>
                  <div>
                    <div style={styles.statLabel}>已关闭</div>
                    <div style={{...styles.statValue, color: 'var(--vp-success)'}}>{data?.closed || 0}</div>
                  </div>
                </div>
                <div style={styles.statCard}>
                  <div>
                    <div style={styles.statLabel}>今日新增</div>
                    <div style={styles.statValue}>{data?.today_new || 0}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 筹码转账 */}
          {page === 'transfer' && (
            <div>
              <h2 style={styles.pageTitle}>筹码转账</h2>
              <p style={{color: 'rgba(255,255,255,0.5)', marginBottom: '20px', fontSize: '14px'}}>
                客服向代理下发筹码 · 手续费 0.1%
              </p>
              <div style={styles.tableCard}>
                <div style={{padding: '24px', maxWidth: '480px'}}>
                  <div style={{marginBottom: '16px'}}>
                    <label style={{display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '6px'}}>代理 ID</label>
                    <input
                      style={{width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '15px', boxSizing: 'border-box'}}
                      placeholder="如 agent_bob"
                      value={transferTo}
                      onChange={function(e: any) { setTransferTo(e.target.value) }}
                    />
                  </div>
                  <div style={{marginBottom: '20px'}}>
                    <label style={{display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '6px'}}>转账金额（筹码）</label>
                    <input
                      style={{width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '15px', boxSizing: 'border-box'}}
                      type="number"
                      placeholder="如 10000"
                      value={transferAmount}
                      onChange={function(e: any) { setTransferAmount(e.target.value) }}
                    />
                  </div>
                  <button
                    style={{width: '100%', padding: '12px', background: 'linear-gradient(135deg, #d4af37 0%, #b8962e 100%)', color: '#1a1a2e', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: '600'}}
                    onClick={async function() {
                      if (!transferTo || !transferAmount) {
                        setTransferResult('请填写代理ID和金额')
                        return
                      }
                      try {
                        const token = localStorage.getItem('support_token')
                        await axios.post(`${BFF_URL}/wallet/transfer`, {
                          to_user_id: transferTo,
                          amount: parseInt(transferAmount),
                          remark: '客服下发筹码'
                        }, {
                          headers: { Authorization: `Bearer ${token}` }
                        })
                        setTransferResult(`✅ 成功转账 ${transferAmount} 筹码至 ${transferTo}（含0.1%手续费）`)
                        setTransferTo('')
                        setTransferAmount('')
                      } catch (err: any) {
                        setTransferResult(`❌ ${err.response?.data?.message || '转账失败'}`)
                      }
                    }}
                  >确认转账</button>
                  {transferResult && (
                    <p style={{marginTop: '16px', fontSize: '14px', color: transferResult.startsWith('✅') ? 'var(--vp-success)' : 'var(--vp-danger)'}}>
                      {transferResult}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {page === 'tickets' && !selectedTicket && (
            <div>
              <h2 style={styles.pageTitle}>工单列表</h2>
              <div style={styles.tableCard}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>工单号</th>
                      <th style={styles.th}>玩家ID</th>
                      <th style={styles.th}>分类</th>
                      <th style={styles.th}>状态</th>
                      <th style={styles.th}>创建时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticketsList.map(function(ticket: any, idx: number) {
                      return (
                        <tr
                          key={idx}
                          style={styles.tr}
                          onClick={function() { setSelectedTicket(ticket) }}
                        >
                          <td style={styles.td}>{ticket.ticket_id}</td>
                          <td style={styles.td}>{ticket.user_id}</td>
                          <td style={styles.td}>{ticket.category}</td>
                          <td style={styles.td}>
                            <span style={{
                              ...styles.badge,
                              background: ticket.status === 'open' ? 'rgba(245,158,11,0.15)' : 
                                          ticket.status === 'processing' ? 'rgba(59,130,246,0.15)' :
                                          'rgba(16,185,129,0.15)',
                              color: ticket.status === 'open' ? 'var(--vp-warning)' : 
                                      ticket.status === 'processing' ? 'var(--vp-info)' : 'var(--vp-success)',
                            }}>
                              {ticket.status}
                            </span>
                          </td>
                          <td style={styles.td}>{new Date(ticket.created_at).toLocaleString()}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {page === 'tickets' && selectedTicket && (
            <div>
              <button style={styles.backBtn} onClick={function() { setSelectedTicket(null) }}>← 返回列表</button>
              <h2 style={styles.pageTitle}>工单 {selectedTicket.ticket_id}</h2>
              <div style={styles.detailCard}>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>玩家ID</span>
                  <span style={styles.detailValue}>{selectedTicket.user_id}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>分类</span>
                  <span style={styles.detailValue}>{selectedTicket.category}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>状态</span>
                  <span style={styles.detailValue}>{selectedTicket.status}</span>
                </div>
                <div style={styles.detailRow}>
                  <span style={styles.detailLabel}>问题描述</span>
                  <span style={styles.detailValue}>{selectedTicket.description}</span>
                </div>
              </div>

              <h3 style={styles.sectionTitle}>聊天记录</h3>
              <div style={styles.chatBox}>
                {selectedTicket.messages.map(function(msg: any, idx: number) {
                  return (
                    <div key={idx} style={styles.chatMsg}>
                      <span style={styles.chatSender}>{msg.sender}:</span>
                      <span style={styles.chatContent}>{msg.content}</span>
                    </div>
                  )
                })}
              </div>

              <h3 style={styles.sectionTitle}>工单操作</h3>
              <div style={{...styles.searchBox, marginBottom: '12px'}}>
                <input
                  style={styles.searchInput}
                  placeholder="输入回复内容..."
                  value={replyText}
                  onChange={function(e: any) { setReplyText(e.target.value) }}
                  onKeyDown={function(e: any) {
                    if (e.key === 'Enter' && replyText.trim()) {
                      axios.patch(`${BFF_URL}/support/tickets/${selectedTicket.ticket_id}`,
                        { reply: replyText.trim() },
                        { headers: { Authorization: `Bearer ${localStorage.getItem('support_token')}` } }
                      ).then(function() {
                        setReplyText('')
                        alert('回复已发送')
                      }).catch(function(err: any) {
                        alert(err.response?.data?.message || '回复失败')
                      })
                    }
                  }}
                />
                <button
                  style={styles.searchBtn}
                  onClick={function() {
                    if (!replyText.trim()) return
                    axios.patch(`${BFF_URL}/support/tickets/${selectedTicket.ticket_id}`,
                      { reply: replyText.trim() },
                      { headers: { Authorization: `Bearer ${localStorage.getItem('support_token')}` } }
                    ).then(function() {
                      setReplyText('')
                      alert('回复已发送')
                    }).catch(function(err: any) {
                      alert(err.response?.data?.message || '回复失败')
                    })
                  }}
                >发送</button>
              </div>
              <div style={styles.actionRow}>
                <button
                  style={{...styles.actionBtn, background: 'rgba(16,185,129,0.15)', color: 'var(--vp-success)', border: '1px solid rgba(16,185,129,0.3)'}}
                  onClick={async function() {
                    try {
                      const token = localStorage.getItem('support_token')
                      await axios.patch(`${BFF_URL}/support/tickets/${selectedTicket.ticket_id}`,
                        { status: 'resolved' },
                        { headers: { Authorization: `Bearer ${token}` } }
                      )
                      alert('工单已标记为已解决')
                      setSelectedTicket(null)
                      fetchData('/support/tickets')
                    } catch (err: any) {
                      alert(err.response?.data?.message || '操作失败')
                    }
                  }}
                >标记已解决</button>
                <button
                  style={{...styles.actionBtn, background: 'rgba(245,158,11,0.15)', color: 'var(--vp-warning)', border: '1px solid rgba(245,158,11,0.3)'}}
                  onClick={async function() {
                    const amount = prompt('请输入退款金额：')
                    if (!amount) return
                    try {
                      const token = localStorage.getItem('support_token')
                      await axios.post(`${BFF_URL}/support/refund`, {
                        user_id: selectedTicket.user_id,
                        amount: parseInt(amount),
                        reason: `工单 ${selectedTicket.ticket_id} 退款`
                      }, {
                        headers: { Authorization: `Bearer ${token}` }
                      })
                      alert(`已退款 ${amount} 筹码至 ${selectedTicket.user_id}`)
                    } catch (err: any) {
                      alert(err.response?.data?.message || '退款失败')
                    }
                  }}
                >办理退款</button>
              </div>
            </div>
          )}

          {page === 'player' && (
            <div>
              <h2 style={styles.pageTitle}>玩家查询</h2>
              <div style={styles.searchBox}>
                <input
                  style={styles.searchInput}
                  placeholder="输入玩家ID"
                  value={searchPlayer}
                  onChange={function(e: any) { setSearchPlayer(e.target.value) }}
                  onKeyDown={function(e: any) { if (e.key === 'Enter') handleSearchPlayer() }}
                />
                <button style={styles.searchBtn} onClick={handleSearchPlayer}>查询</button>
              </div>

              {playerData && (
                <div style={styles.playerCard}>
                  <h3 style={styles.sectionTitle}>玩家信息</h3>
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>玩家ID</span>
                    <span style={styles.detailValue}>{playerData.user_id}</span>
                  </div>
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>余额</span>
                    <span style={{...styles.detailValue, color: 'var(--vp-gold)'}}>
                      {(playerData.wallet?.balance || 0).toLocaleString()} 筹码
                    </span>
                  </div>
                  <div style={styles.detailRow}>
                    <span style={styles.detailLabel}>工单数</span>
                    <span style={styles.detailValue}>{playerData.tickets_count}</span>
                  </div>
                </div>
              )}

              {playerData && playerData.recent_transactions && (
                <div style={styles.tableCard}>
                  <h3 style={styles.sectionTitle}>最近流水</h3>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>类型</th>
                        <th style={styles.th}>金额</th>
                        <th style={styles.th}>时间</th>
                      </tr>
                    </thead>
                    <tbody>
                      {playerData.recent_transactions.slice(0, 10).map(function(tx: any, idx: number) {
                        return (
                          <tr key={idx} style={styles.tr}>
                            <td style={styles.td}>{tx.type}</td>
                            <td style={styles.td}>{tx.amount.toLocaleString()}</td>
                            <td style={styles.td}>{new Date(tx.created_at).toLocaleString()}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  loginContainer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    position: 'relative',
  },
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    zIndex: 0,
  },
  loginCard: {
    background: 'rgba(20, 20, 30, 0.85)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(212, 175, 55, 0.3)',
    padding: '50px 40px',
    borderRadius: '24px',
    boxShadow: '0 25px 50px rgba(0,0,0,0.5), 0 0 40px rgba(212, 175, 55, 0.1)',
    width: '400px',
    position: 'relative',
    zIndex: 1,
  },
  logoImg: {
    width: '100px',
    height: '100px',
    margin: '0 auto 20px',
    display: 'block',
    objectFit: 'contain',
  },
  title: {
    textAlign: 'center',
    margin: 0,
    fontSize: '26px',
    fontWeight: '700',
    color: 'var(--vp-gold)',
    letterSpacing: '2px',
  },
  subtitle: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.6)',
    margin: '8px 0 30px',
    fontSize: '14px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  input: {
    padding: '14px 16px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    fontSize: '14px',
    color: '#fff',
    outline: 'none',
  },
  button: {
    padding: '14px',
    background: 'linear-gradient(135deg, var(--vp-info) 0%, var(--vp-info) 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '8px',
  },
  error: {
    color: 'var(--vp-danger)',
    fontSize: '14px',
    margin: 0,
    padding: '10px 14px',
    background: 'rgba(255,107,107,0.1)',
    borderRadius: '8px',
  },
  container: {
    display: 'flex',
    minHeight: '100vh',
    background: 'radial-gradient(ellipse at top, var(--vp-surface) 0%, var(--vp-ink) 100%)',
  },
  sidebar: {
    width: '220px',
    background: 'rgba(255,255,255,0.03)',
    borderRight: '1px solid rgba(255,255,255,0.05)',
    padding: '20px 0',
  },
  sidebarLogo: {
    color: 'var(--vp-info)',
    fontSize: '18px',
    fontWeight: '700',
    padding: '0 20px 20px',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  nav: {
    padding: '20px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  navItem: {
    padding: '12px 16px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: 'rgba(255,255,255,0.6)',
  },
  navItemActive: {
    padding: '12px 16px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    background: 'rgba(59,130,246,0.15)',
    color: 'var(--vp-info)',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 30px',
    background: 'rgba(255,255,255,0.03)',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  welcome: {
    color: '#fff',
    fontSize: '15px',
  },
  logoutBtn: {
    padding: '8px 16px',
    background: 'rgba(239,68,68,0.15)',
    color: 'var(--vp-danger)',
    border: '1px solid rgba(239,68,68,0.3)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
  },
  content: {
    padding: '30px',
    flex: 1,
  },
  pageTitle: {
    color: '#fff',
    fontSize: '22px',
    fontWeight: '600',
    margin: '0 0 24px',
  },
  actionRow: {
    display: 'flex',
    gap: '12px',
    marginTop: '12px',
  },
  actionBtn: {
    padding: '10px 20px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
  },
  sectionTitle: {
    color: '#fff',
    fontSize: '16px',
    fontWeight: '600',
    margin: '24px 0 12px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '20px',
  },
  statCard: {
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.08)',
    padding: '24px',
    borderRadius: '16px',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '13px',
  },
  statValue: {
    color: '#fff',
    fontSize: '28px',
    fontWeight: '700',
    marginTop: '4px',
  },
  tableCard: {
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    overflow: 'hidden',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '14px 20px',
    textAlign: 'left',
    color: 'rgba(255,255,255,0.5)',
    fontSize: '12px',
    fontWeight: '500',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
  },
  tr: {
    borderBottom: '1px solid rgba(255,255,255,0.04)',
    cursor: 'pointer',
  },
  td: {
    padding: '14px 20px',
    color: 'rgba(255,255,255,0.8)',
    fontSize: '14px',
  },
  badge: {
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
  },
  detailCard: {
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '20px',
  },
  detailRow: {
    display: 'flex',
    padding: '8px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  detailLabel: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '14px',
    width: '100px',
  },
  detailValue: {
    color: '#fff',
    fontSize: '14px',
    flex: 1,
  },
  chatBox: {
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '20px',
    maxHeight: '300px',
    overflowY: 'auto',
  },
  chatMsg: {
    padding: '8px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  chatSender: {
    color: 'var(--vp-info)',
    fontSize: '13px',
    fontWeight: '600',
    marginRight: '8px',
  },
  chatContent: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: '14px',
  },
  searchBox: {
    display: 'flex',
    gap: '12px',
    marginBottom: '24px',
  },
  searchInput: {
    flex: 1,
    padding: '12px 16px',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '10px',
    fontSize: '14px',
    color: '#fff',
    outline: 'none',
  },
  searchBtn: {
    padding: '12px 24px',
    background: 'linear-gradient(135deg, var(--vp-info) 0%, var(--vp-info) 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  playerCard: {
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '24px',
    marginBottom: '20px',
  },
  backBtn: {
    padding: '8px 16px',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '13px',
    marginBottom: '16px',
  },
}

export default App

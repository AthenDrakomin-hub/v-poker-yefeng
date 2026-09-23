import { useState, useEffect } from 'react'
import axios from 'axios'

const BFF_URL = '/api'

function MintForm() {
  const [userId, setUserId] = useState('')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState('')

  const submit = async () => {
    if (!userId || !amount) {
      setResult('请填写玩家ID和金额')
      return
    }
    setLoading(true)
    setResult('')
    try {
      const token = localStorage.getItem('admin_token')
      const res = await axios.post(`${BFF_URL}/admin/mint`, {
        user_id: userId,
        amount: parseInt(amount),
        reason: reason || 'admin_mint'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setResult(`✅ 成功增发 ${res.data.data?.minted || amount} 筹码至 ${userId}`)
      setUserId('')
      setAmount('')
      setReason('')
    } catch (err: any) {
      setResult(`❌ ${err.response?.data?.message || '增发失败'}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: '480px' }}>
      <h3 style={{ color: '#fff', margin: '0 0 20px' }}>向玩家账户增发筹码</h3>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '6px' }}>玩家 ID</label>
        <input
          style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '15px', boxSizing: 'border-box' }}
          placeholder="如 player_alice"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
        />
      </div>
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '6px' }}>增发金额（筹码）</label>
        <input
          style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '15px', boxSizing: 'border-box' }}
          type="number"
          placeholder="如 10000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div style={{ marginBottom: '20px' }}>
        <label style={{ display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '6px' }}>备注原因</label>
        <input
          style={{ width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '15px', boxSizing: 'border-box' }}
          placeholder="如 活动奖励"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </div>
      <button
        style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg, #d4af37 0%, #b8962e 100%)', color: '#1a1a2e', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '15px', fontWeight: '600' }}
        onClick={submit}
        disabled={loading}
      >
        {loading ? '处理中...' : '确认增发'}
      </button>
      {result && (
        <p style={{ marginTop: '16px', fontSize: '14px', color: result.startsWith('✅') ? 'var(--vp-success)' : 'var(--vp-danger)' }}>
          {result}
        </p>
      )}
    </div>
  )
}

function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [adminId, setAdminId] = useState('')
  const [page, setPage] = useState('dashboard')
  const [data, setData] = useState<any>(null)
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
      localStorage.setItem('admin_token', res.data.data.access_token)
      setAdminId(res.data.data.user.user_id)
      setLoggedIn(true)
    } catch (err: any) {
      setError(err.response?.data?.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchData = async (path: string) => {
    try {
      const token = localStorage.getItem('admin_token')
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
      if (page === 'dashboard') fetchData('/admin/overview')
      else if (page === 'mint') setData(null)
      else if (page === 'rooms') fetchData('/admin/rooms')
      else if (page === 'audit') fetchData('/admin/audit')
      else if (page === 'agents') fetchData('/admin/agents')
      else if (page === 'transactions') fetchData('/admin/transactions')
    }
  }, [page, loggedIn])

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
          <h1 style={styles.title}>V-POKER 管理端</h1>
          <p style={styles.subtitle}>平台运营 · 资金监管</p>
          <form onSubmit={login} style={styles.form}>
            <input
              style={styles.input}
              type="text"
              placeholder="管理员账号"
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
    { id: 'dashboard', label: '数据概览', icon: '📊' },
    { id: 'mint', label: '筹码增发', icon: '🏦' },
    { id: 'rooms', label: '房间管理', icon: '🎮' },
    { id: 'audit', label: '资金审计', icon: '🔍' },
    { id: 'agents', label: '代理管理', icon: '👥' },
    { id: 'transactions', label: '交易流水', icon: '📋' },
  ]

  const agentsList = (data && data.agents) || []
  const txList = (data && data.transactions) || []

  return (
    <div style={styles.container}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarLogo}>
          <img src="/assets/ui/logo.png" alt="V-POKER" style={styles.sidebarLogoImg} />
          <span>V-POKER</span>
        </div>
        <nav style={styles.nav}>
          {navItems.map(function(item) {
            return (
              <div
                key={item.id}
                style={page === item.id ? styles.navItemActive : styles.navItem}
                onClick={function() { setPage(item.id) }}
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
          <div style={styles.welcome}>欢迎，{adminId}</div>
          <button
            style={styles.logoutBtn}
            onClick={function() {
              localStorage.removeItem('admin_token')
              setLoggedIn(false)
            }}
          >
            退出
          </button>
        </header>

        <div style={styles.content}>
          {page === 'dashboard' && (
            <div>
              <h2 style={styles.pageTitle}>数据概览</h2>
              <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                  <div>
                    <div style={styles.statLabel}>总铸币量</div>
                    <div style={styles.statValue}>{(data?.total_minted || 0).toLocaleString()}</div>
                  </div>
                </div>
                <div style={styles.statCard}>
                  <div>
                    <div style={styles.statLabel}>手续费池</div>
                    <div style={styles.statValue}>{(data?.fee_pool_balance || 0).toLocaleString()}</div>
                  </div>
                </div>
                <div style={styles.statCard}>
                  <div>
                    <div style={styles.statLabel}>钱包总数</div>
                    <div style={styles.statValue}>{data?.wallet_count || 0}</div>
                  </div>
                </div>
                <div style={styles.statCard}>
                  <div>
                    <div style={styles.statLabel}>交易总数</div>
                    <div style={styles.statValue}>{data?.transaction_count || 0}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {page === 'mint' && (
            <div>
              <h2 style={styles.pageTitle}>筹码增发</h2>
              <div style={styles.tableCard}>
                <MintForm />
              </div>
            </div>
          )}

          {page === 'rooms' && (
            <div>
              <h2 style={styles.pageTitle}>房间管理</h2>
              <div style={styles.tableCard}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>房号</th>
                      <th style={styles.th}>游戏类型</th>
                      <th style={styles.th}>底分</th>
                      <th style={styles.th}>状态</th>
                      <th style={styles.th}>创建者</th>
                      <th style={styles.th}>创建时间</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.rooms || []).map((room: any, idx: number) => (
                      <tr key={idx} style={styles.tr}>
                        <td style={styles.td}>{room.room_id}</td>
                        <td style={styles.td}>{room.game_type}</td>
                        <td style={styles.td}>{room.base_score}</td>
                        <td style={styles.td}>
                          <span style={{...styles.badge,
                            background: room.status === 'waiting' ? 'rgba(16,185,129,0.15)' : room.status === 'playing' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                            color: room.status === 'waiting' ? 'var(--vp-success)' : room.status === 'playing' ? 'var(--vp-warning)' : 'var(--vp-danger)'
                          }}>
                            {room.status}
                          </span>
                        </td>
                        <td style={styles.td}>{room.created_by}</td>
                        <td style={styles.td}>{new Date(room.created_at * 1000).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(data?.rooms || []).length === 0 && (
                  <p style={styles.emptyText}>暂无房间数据</p>
                )}
              </div>
            </div>
          )}

          {page === 'audit' && (
            <div>
              <h2 style={styles.pageTitle}>资金审计</h2>
              <div style={styles.auditCard}>
                <div style={styles.auditRow}>
                  <span style={styles.auditLabel}>总铸币量</span>
                  <span style={styles.auditValue}>{(data?.total_minted || 0).toLocaleString()}</span>
                </div>
                <div style={styles.auditRow}>
                  <span style={styles.auditLabel}>所有钱包余额之和</span>
                  <span style={styles.auditValue}>{(data?.sum_all_wallets || 0).toLocaleString()}</span>
                </div>
                <div style={styles.auditRow}>
                  <span style={styles.auditLabel}>手续费池余额</span>
                  <span style={styles.auditValue}>{(data?.sum_fee_pool || 0).toLocaleString()}</span>
                </div>
                <div style={styles.auditRow}>
                  <span style={styles.auditLabel}>差额</span>
                  <span style={styles.auditValue}>{data?.difference || 0}</span>
                </div>
              </div>
            </div>
          )}

          {page === 'agents' && (
            <div>
              <h2 style={styles.pageTitle}>代理管理</h2>
              <div style={styles.tableCard}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>代理ID</th>
                      <th style={styles.th}>上级</th>
                      <th style={styles.th}>层级</th>
                      <th style={styles.th}>佣金余额</th>
                      <th style={styles.th}>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {agentsList.map(function(agent: any, idx: number) {
                      return (
                        <tr key={idx} style={styles.tr}>
                          <td style={styles.td}>{agent.agent_id}</td>
                          <td style={styles.td}>{agent.parent_id || '顶级'}</td>
                          <td style={styles.td}>L{agent.level}</td>
                          <td style={styles.td}>{(agent.commission_balance || 0).toLocaleString()}</td>
                          <td style={styles.td}>{agent.status}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {page === 'transactions' && (
            <div>
              <h2 style={styles.pageTitle}>交易流水</h2>
              <div style={styles.tableCard}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>流水ID</th>
                      <th style={styles.th}>类型</th>
                      <th style={styles.th}>金额</th>
                      <th style={styles.th}>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {txList.slice(0, 20).map(function(tx: any, idx: number) {
                      return (
                        <tr key={idx} style={styles.tr}>
                          <td style={styles.td}>{tx.transaction_id}</td>
                          <td style={styles.td}>{tx.type}</td>
                          <td style={styles.td}>{tx.amount.toLocaleString()}</td>
                          <td style={styles.td}>{tx.status}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
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
    background: 'linear-gradient(135deg, var(--vp-gold) 0%, var(--vp-gold-hover) 100%)',
    color: 'var(--vp-surface)',
    border: 'none',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: '700',
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
    background: 'rgba(20, 20, 30, 0.9)',
    borderRight: '1px solid rgba(212, 175, 55, 0.2)',
    padding: '20px 0',
  },
  sidebarLogo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    color: 'var(--vp-gold)',
    fontSize: '18px',
    fontWeight: '700',
    padding: '0 20px 20px',
    borderBottom: '1px solid rgba(212, 175, 55, 0.2)',
  },
  sidebarLogoImg: {
    width: '32px',
    height: '32px',
    objectFit: 'contain',
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
    background: 'rgba(239,68,68,0.15)',
    color: 'var(--vp-danger)',
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
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
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
    fontSize: '24px',
    fontWeight: '700',
    marginTop: '4px',
  },
  auditCard: {
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '16px',
    padding: '30px',
    maxWidth: '600px',
  },
  auditRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid rgba(255,255,255,0.05)',
  },
  auditLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '14px',
  },
  auditValue: {
    color: '#fff',
    fontSize: '15px',
    fontWeight: '600',
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
  },
  td: {
    padding: '14px 20px',
    color: 'rgba(255,255,255,0.8)',
    fontSize: '14px',
  },
}

export default App

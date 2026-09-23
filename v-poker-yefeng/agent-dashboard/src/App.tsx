import { useState, useEffect } from 'react'
import axios from 'axios'

const BFF_URL = '/api'

interface RoomItem {
  room_id: string
  room_name: string
  game_type: string
  mode: string
  total_rounds: number
  base_score: number
  platform_fee_rate: string
  min_players: number
  max_players: number
  status: string
  current_round: number
  created_by: string
  room_type: string
  created_at: number
}

function App() {
  const [loggedIn, setLoggedIn] = useState(false)
  const [agentId, setAgentId] = useState('')
  const [page, setPage] = useState('dashboard')
  const [data, setData] = useState<any>(null)
  const [rooms, setRooms] = useState<RoomItem[]>([])
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showCreateRoom, setShowCreateRoom] = useState(false)
  const [createForm, setCreateForm] = useState({
    room_name: '',
    game_type: 'texas_holdem',
    room_level: 'low',           // low/mid/high 初级/中级/高级
    blind_small: 5,               // 小盲
    blind_big: 10,               // 大盲
    ante: 0,                     // 前注
    max_players: 6,               // 人数
    total_rounds: 10,            // 局数
    action_time: 20,             // 行动时间(秒)
    room_password: '',
    variant: 'normal',           // normal / aof (德州专用: 常规/全下弃牌)
  })
  const [transferTo, setTransferTo] = useState('')
  const [transferAmount, setTransferAmount] = useState('')
  const [transferResult, setTransferResult] = useState('')
  const [squidConfig, setSquidConfig] = useState({
    bridgeSurvival: 70,
    deathPenalty: 50,
    luckyBonus: 50,
    survivorBonus: 50,
  })
  const [zhaJinHuaConfig, setZhaJinHuaConfig] = useState({
    blindPlayMode: true,    // 闷注模式（不看牌下注）
    compareRatio: 1,        // 比牌倍率
    tongSha: false,         // 通杀模式
  })
  const [niuNiuConfig, setNiuNiuConfig] = useState({
    bankerMode: 'random',   // random/rob/tong_bi 随机/抢庄/通比
    multiplier: 3,          // 牛牛倍数上限
  })
  const [sanGongConfig, setSanGongConfig] = useState({
    robBanker: true,        // 抢庄模式
    multiplier: 4,          // 三公倍数
  })
  const [guandanConfig, setGuandanConfig] = useState({
    upgradeMode: 'classic',  // classic/quick 经典升级/快速升级
    partnerMode: 'fixed',    // fixed/random 固定搭档/随机搭档
  })
  const [fightBombConfig, setFightBombConfig] = useState({
    callScore: 1,            // 叫分底分
    doubleMode: true,        // 翻倍机制（春天/反春/炸）
  })
  const [omahaConfig, setOmahaConfig] = useState({
    hiLo: false,             // 高低牌分池模式
    holeCards: 4,            // 底牌数
  })
  const [thirteenWaterConfig, setThirteenWaterConfig] = useState({
    specialMultiplier: 2,    // 特殊牌型倍数
  })
  const [doubleKongConfig, setDoubleKongConfig] = useState({
    bombMode: true,          // 炸弹模式
  })
  const [hongWuConfig, setHongWuConfig] = useState({
    upgradeTarget: 2,        // 升级目标（2/3/5/10）
  })
  const [pineappleConfig, setPineappleConfig] = useState({
    crazyMode: false,        // 疯狂菠萝模式
  })
  const [shortDeckConfig, setShortDeckConfig] = useState({
    sixPlus: true,           // 6+ 短牌模式（去2-5）
  })

  const login = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await axios.post(`${BFF_URL}/auth/login`, { username, password })
      // 校验角色必须是 agent 或 admin
      if (res.data.data.user.role !== 'agent' && res.data.data.user.role !== 'admin') {
        setError('该账号不是代理账号')
        return
      }
      localStorage.setItem('agent_token', res.data.data.access_token)
      setAgentId(res.data.data.user.user_id)
      setLoggedIn(true)
    } catch (err: any) {
      setError(err.response?.data?.message || '登录失败')
    } finally {
      setLoading(false)
    }
  }

  const fetchData = async (path: string) => {
    try {
      const token = localStorage.getItem('agent_token')
      const res = await axios.get(`${BFF_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setData(res.data.data)
    } catch (err: any) {
      console.error('加载失败:', err)
      if (err.response?.status === 401) {
        localStorage.removeItem('agent_token')
        setLoggedIn(false)
      }
    }
  }

  const fetchRooms = async () => {
    try {
      const token = localStorage.getItem('agent_token')
      const res = await axios.get(`${BFF_URL}/rooms/list`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      // 过滤出当前代理创建的房间
      const myRooms = (res.data.data || []).filter((r: RoomItem) => r.created_by === agentId)
      setRooms(myRooms)
    } catch (err) {
      console.error('加载房间失败:', err)
    }
  }

  const handleCreateRoom = async () => {
    try {
      const token = localStorage.getItem('agent_token')
      const configMap: Record<string, any> = {
        squid_game: squidConfig,
        zha_jin_hua: zhaJinHuaConfig,
        niu_niu: niuNiuConfig,
        san_gong: sanGongConfig,
        guandan: guandanConfig,
        fight_bomb: fightBombConfig,
        omaha: omahaConfig,
        thirteen_water: thirteenWaterConfig,
        double_kong: doubleKongConfig,
        hong_wu: hongWuConfig,
        pineapple: pineappleConfig,
        short_deck: shortDeckConfig,
      }
      const payload = {
        ...createForm,
        config: configMap[createForm.game_type] || undefined,
      }
      await axios.post(`${BFF_URL}/rooms/create`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      })
      setShowCreateRoom(false)
      fetchRooms()
      // 重置表单
      setCreateForm({
        room_name: '',
        game_type: 'texas_holdem',
        room_level: 'low',
        blind_small: 5,
        blind_big: 10,
        ante: 0,
        max_players: 6,
        total_rounds: 10,
        action_time: 20,
        room_password: '',
        variant: 'normal',
      })
    } catch (err: any) {
      alert(err.response?.data?.message || '创建房间失败')
    }
  }

  useEffect(() => {
    if (loggedIn) {
      if (page === 'dashboard') fetchData('/agent/dashboard')
      else if (page === 'commission') fetchData('/agent/commission')
      else if (page === 'settlements') fetchData('/agent/settlements')
      else if (page === 'children') fetchData('/agent/children')
      else if (page === 'rooms') fetchRooms()
    }
  }, [page, loggedIn, agentId])

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
          <h1 style={styles.title}>V-POKER 代理端</h1>
          <p style={styles.subtitle}>分销管理 · 佣金统计 · 开房管理</p>
          <form onSubmit={login} style={styles.form}>
            <input
              style={styles.input}
              type="text"
              placeholder="代理账号"
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
            {error && <p style={styles.error}>⚠️ {error}</p>}
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
    { id: 'rooms', label: '我的房间', icon: '🎮' },
    { id: 'transfer', label: '筹码转账', icon: '💸' },
    { id: 'commission', label: '佣金明细', icon: '💰' },
    { id: 'settlements', label: '结算记录', icon: '📋' },
    { id: 'children', label: '下级代理', icon: '👥' },
  ]

  const commissionRecords = (data && data.records) || []
  const childrenList = (data && data.children) || []

  const getGameName = (type: string) => {
    const map: Record<string, string> = {
      texas_holdem: '德州扑克',
      zha_jin_hua: '炸金花',
      niu_niu: '牛牛',
      san_gong: '三公',
    }
    return map[type] || type
  }

  return (
    <div style={styles.container}>
      <aside style={styles.sidebar}>
        <div style={styles.sidebarLogo}>👑 代理后台</div>
        <nav style={styles.nav}>
          {navItems.map((item) => (
            <div
              key={item.id}
              style={{
                ...styles.navItem,
                background: page === item.id ? 'rgba(245,158,11,0.15)' : 'transparent',
                color: page === item.id ? 'var(--vp-warning)' : 'rgba(255,255,255,0.6)',
              }}
              onClick={() => setPage(item.id)}
            >
              <span style={styles.navIcon}>{item.icon}</span>
              {item.label}
            </div>
          ))}
        </nav>
      </aside>

      <main style={styles.main}>
        <header style={styles.header}>
          <div style={styles.welcome}>欢迎，{agentId}</div>
          <button
            style={styles.logoutBtn}
            onClick={() => { localStorage.removeItem('agent_token'); setLoggedIn(false) }}
          >
            退出
          </button>
        </header>

        <div style={styles.content}>
          {/* 仪表盘 */}
          {page === 'dashboard' && (
            <div>
              <h2 style={styles.pageTitle}>数据概览</h2>
              <div style={styles.statsGrid}>
                <div style={styles.statCard}>
                  <div style={styles.statIcon}>💰</div>
                  <div>
                    <div style={styles.statLabel}>累计佣金</div>
                    <div style={styles.statValue}>{(data?.total_commission || 0).toLocaleString()}</div>
                  </div>
                </div>
                <div style={styles.statCard}>
                  <div style={styles.statIcon}>👥</div>
                  <div>
                    <div style={styles.statLabel}>下级代理数</div>
                    <div style={styles.statValue}>{data?.children_count || 0}</div>
                  </div>
                </div>
                <div style={styles.statCard}>
                  <div style={styles.statIcon}>📈</div>
                  <div>
                    <div style={styles.statLabel}>总流水</div>
                    <div style={styles.statValue}>{(data?.total_flow || 0).toLocaleString()}</div>
                  </div>
                </div>
                <div style={styles.statCard}>
                  <div style={styles.statIcon}>🎮</div>
                  <div>
                    <div style={styles.statLabel}>我的房间</div>
                    <div style={styles.statValue}>{rooms.length}</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 我的房间 */}
          {page === 'rooms' && (
            <div>
              <div style={styles.pageHeader}>
                <h2 style={styles.pageTitle}>我的房间</h2>
                <button style={styles.createBtn} onClick={() => setShowCreateRoom(true)}>
                  ＋ 创建房间
                </button>
              </div>
              <div style={styles.roomGrid}>
                {rooms.map((room) => (
                  <div key={room.room_id} style={styles.roomCard}>
                    <div style={styles.roomCardHeader}>
                      <span style={styles.roomGame}>{getGameName(room.game_type)}</span>
                      <span style={{
                        ...styles.roomStatus,
                        color: room.status === 'waiting' ? 'var(--vp-success)' : room.status === 'playing' ? 'var(--vp-warning)' : 'var(--vp-danger)'
                      }}>
                        {room.status === 'waiting' ? '等待中' : room.status === 'playing' ? '游戏中' : '已结束'}
                      </span>
                    </div>
                    <div style={styles.roomCardBody}>
                      <div style={styles.roomIdText}>房号: {room.room_id}</div>
                      <div style={styles.roomMeta}>底分: {room.base_score} · {room.min_players}-{room.max_players}人 · {room.total_rounds}局</div>
                    </div>
                  </div>
                ))}
              </div>
              {rooms.length === 0 && (
                <p style={styles.emptyText}>暂无房间，点击右上角创建</p>
              )}
            </div>
          )}

          {/* 筹码转账 */}
          {page === 'transfer' && (
            <div>
              <h2 style={styles.pageTitle}>筹码转账</h2>
              <p style={{color: 'rgba(255,255,255,0.5)', marginBottom: '20px', fontSize: '14px'}}>
                代理向玩家下发筹码 · 手续费 0.1%
              </p>
              <div style={styles.tableCard}>
                <div style={{padding: '24px', maxWidth: '480px'}}>
                  <div style={{marginBottom: '16px'}}>
                    <label style={{display: 'block', color: 'rgba(255,255,255,0.6)', fontSize: '13px', marginBottom: '6px'}}>玩家 ID</label>
                    <input
                      style={{width: '100%', padding: '10px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', color: '#fff', fontSize: '15px', boxSizing: 'border-box'}}
                      placeholder="如 player_alice"
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
                        setTransferResult('请填写玩家ID和金额')
                        return
                      }
                      try {
                        const token = localStorage.getItem('agent_token')
                        await axios.post(`${BFF_URL}/wallet/transfer`, {
                          to_user_id: transferTo,
                          amount: parseInt(transferAmount),
                          remark: '代理下发筹码'
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

          {/* 佣金明细 */}
          {page === 'commission' && (
            <div>
              <h2 style={styles.pageTitle}>佣金明细</h2>
              <div style={styles.tableCard}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>时间</th>
                      <th style={styles.th}>佣金金额</th>
                      <th style={styles.th}>层级</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commissionRecords.map((record: any, idx: number) => (
                      <tr key={idx} style={styles.tr}>
                        <td style={styles.td}>{new Date(record.created_at).toLocaleString()}</td>
                        <td style={{ ...styles.td, color: 'var(--vp-success)', fontWeight: '600' }}>
                          +{record.commission_amount?.toLocaleString() || record.amount?.toLocaleString()}
                        </td>
                        <td style={styles.td}>L{record.level || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {commissionRecords.length === 0 && (
                  <p style={styles.emptyText}>暂无佣金记录</p>
                )}
              </div>
            </div>
          )}

          {/* 结算记录 */}
          {page === 'settlements' && (
            <div>
              <h2 style={styles.pageTitle}>结算记录</h2>
              <div style={styles.tableCard}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>结算时间</th>
                      <th style={styles.th}>周期</th>
                      <th style={styles.th}>总流水</th>
                      <th style={styles.th}>佣金</th>
                      <th style={styles.th}>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.settlements || data?.records || []).map(function(record: any, idx: number) {
                      return (
                        <tr key={idx} style={styles.tr}>
                          <td style={styles.td}>{new Date(record.settled_at || record.created_at || 0).toLocaleString()}</td>
                          <td style={styles.td}>{record.period || record.cycle || '-'}</td>
                          <td style={styles.td}>{(record.total_flow || 0).toLocaleString()}</td>
                          <td style={{...styles.td, color: 'var(--vp-success)', fontWeight: '600'}}>
                            +{(record.commission_amount || 0).toLocaleString()}
                          </td>
                          <td style={styles.td}>
                            <span style={{...styles.badge,
                              background: record.status === 'paid' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
                              color: record.status === 'paid' ? 'var(--vp-success)' : 'var(--vp-warning)'
                            }}>
                              {record.status === 'paid' ? '已结算' : record.status === 'pending' ? '待结算' : (record.status || '-')}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {(data?.settlements || data?.records || []).length === 0 && (
                  <p style={styles.emptyText}>暂无结算记录</p>
                )}
              </div>
            </div>
          )}

          {/* 下级代理 */}
          {page === 'children' && (
            <div>
              <h2 style={styles.pageTitle}>下级代理</h2>
              <div style={styles.tableCard}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>代理ID</th>
                      <th style={styles.th}>层级</th>
                      <th style={styles.th}>佣金余额</th>
                      <th style={styles.th}>状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {childrenList.map((child: any, idx: number) => (
                      <tr key={idx} style={styles.tr}>
                        <td style={styles.td}>{child.agent_id}</td>
                        <td style={styles.td}>L{child.level}</td>
                        <td style={{ ...styles.td, color: 'var(--vp-gold)' }}>
                          {(child.commission_balance || 0).toLocaleString()}
                        </td>
                        <td style={styles.td}>
                          <span style={styles.badge}>
                            {child.status === 'active' ? '正常' : '冻结'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {childrenList.length === 0 && (
                  <p style={styles.emptyText}>暂无下级代理</p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 创建房间弹窗 */}
      {showCreateRoom && (
        <div style={styles.modalOverlay} onClick={() => setShowCreateRoom(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>创建房间</h3>

            {/* 游戏类型 */}
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>游戏类型</label>
              <select
                style={styles.formInput}
                value={createForm.game_type}
                onChange={(e) => setCreateForm({ ...createForm, game_type: e.target.value })}
              >
                <option value="texas_holdem">德州扑克</option>
                <option value="zha_jin_hua">炸金花</option>
                <option value="niu_niu">牛牛</option>
                <option value="san_gong">三公</option>
                <option value="squid_game">鱿鱼模式</option>
                <option value="guandan">掼蛋</option>
                <option value="fight_bomb">斗地主</option>
                <option value="omaha">奥马哈</option>
                <option value="thirteen_water">十三水</option>
                <option value="double_kong">百变双扣</option>
                <option value="hong_wu">红五</option>
                <option value="pineapple">菠萝扑克</option>
                <option value="short_deck">短牌德州</option>
              </select>
            </div>

            {/* 房间等级 */}
            <div style={styles.formGroup}>
              <label style={styles.formLabel}>房间等级</label>
              <select
                style={styles.formInput}
                value={createForm.room_level}
                onChange={(e) => {
                  const level = e.target.value;
                  const presets: Record<string, { blind_small: number; blind_big: number }> = {
                    low: { blind_small: 5, blind_big: 10 },
                    mid: { blind_small: 25, blind_big: 50 },
                    high: { blind_small: 100, blind_big: 200 },
                  };
                  setCreateForm({ ...createForm, room_level: level, ...presets[level] });
                }}
              >
                <option value="low">初级场 (5/10)</option>
                <option value="mid">中级场 (25/50)</option>
                <option value="high">高级场 (100/200)</option>
              </select>
            </div>

            {/* 盲注配置 */}
            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>小盲</label>
                <input
                  style={styles.formInput}
                  type="number"
                  min="1"
                  value={createForm.blind_small}
                  onChange={(e) => setCreateForm({ ...createForm, blind_small: parseInt(e.target.value) })}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>大盲</label>
                <input
                  style={styles.formInput}
                  type="number"
                  min="1"
                  value={createForm.blind_big}
                  onChange={(e) => setCreateForm({ ...createForm, blind_big: parseInt(e.target.value) })}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>前注</label>
                <input
                  style={styles.formInput}
                  type="number"
                  min="0"
                  value={createForm.ante}
                  onChange={(e) => setCreateForm({ ...createForm, ante: parseInt(e.target.value) })}
                />
              </div>
            </div>

            {/* 德州扑克特殊变体 */}
            {createForm.game_type === 'texas_holdem' && (
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>规则变体</label>
                <select
                  style={styles.formInput}
                  value={createForm.variant}
                  onChange={(e) => setCreateForm({ ...createForm, variant: e.target.value })}
                >
                  <option value="normal">常规德州 (No-Limit)</option>
                  <option value="aof">全下弃牌 (All-in or Fold)</option>
                </select>
              </div>
            )}

            {/* 座位数 + 局数 */}
            <div style={styles.formRow}>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>座位数</label>
                <select
                  style={styles.formInput}
                  value={createForm.max_players}
                  onChange={(e) => setCreateForm({ ...createForm, max_players: parseInt(e.target.value) })}
                >
                  {[2,4,6,8,9].map(n => (
                    <option key={n} value={n}>{n} 人桌</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>总局数</label>
                <select
                  style={styles.formInput}
                  value={createForm.total_rounds}
                  onChange={(e) => setCreateForm({ ...createForm, total_rounds: parseInt(e.target.value) })}
                >
                  {[4,6,8,10,12,16,20,30,50].map(n => (
                    <option key={n} value={n}>{n} 局</option>
                  ))}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.formLabel}>行动时间</label>
                <select
                  style={styles.formInput}
                  value={createForm.action_time}
                  onChange={(e) => setCreateForm({ ...createForm, action_time: parseInt(e.target.value) })}
                >
                  {[10,15,20,30].map(n => (
                    <option key={n} value={n}>{n} 秒</option>
                  ))}
                </select>
              </div>
            </div>

            {/* 鱿鱼模式特殊配置 */}
            {createForm.game_type === 'squid_game' && (
              <div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>玻璃桥存活率</label>
                    <select style={styles.formInput} value={squidConfig.bridgeSurvival} onChange={(e) => setSquidConfig({ ...squidConfig, bridgeSurvival: parseInt(e.target.value) })}>
                      <option value="50">50%</option>
                      <option value="70">70%</option>
                      <option value="90">90%</option>
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>死亡牌惩罚</label>
                    <select style={styles.formInput} value={squidConfig.deathPenalty} onChange={(e) => setSquidConfig({ ...squidConfig, deathPenalty: parseInt(e.target.value) })}>
                      <option value="30">30%</option>
                      <option value="50">50%</option>
                      <option value="70">70%</option>
                    </select>
                  </div>
                </div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>幸运牌加成</label>
                    <select style={styles.formInput} value={squidConfig.luckyBonus} onChange={(e) => setSquidConfig({ ...squidConfig, luckyBonus: parseInt(e.target.value) })}>
                      <option value="30">30%</option>
                      <option value="50">50%</option>
                      <option value="100">100%</option>
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>幸存者奖励</label>
                    <select style={styles.formInput} value={squidConfig.survivorBonus} onChange={(e) => setSquidConfig({ ...squidConfig, survivorBonus: parseInt(e.target.value) })}>
                      <option value="25">25%</option>
                      <option value="50">50%</option>
                      <option value="100">100%</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 炸金花特殊配置 */}
            {createForm.game_type === 'zha_jin_hua' && (
              <div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>闷注模式</label>
                    <select style={styles.formInput} value={zhaJinHuaConfig.blindPlayMode ? '1' : '0'} onChange={(e) => setZhaJinHuaConfig({ ...zhaJinHuaConfig, blindPlayMode: e.target.value === '1' })}>
                      <option value="1">开启（不看牌下注）</option>
                      <option value="0">关闭</option>
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>比牌倍率</label>
                    <select style={styles.formInput} value={zhaJinHuaConfig.compareRatio} onChange={(e) => setZhaJinHuaConfig({ ...zhaJinHuaConfig, compareRatio: parseInt(e.target.value) })}>
                      <option value="1">1倍</option>
                      <option value="2">2倍</option>
                      <option value="3">3倍</option>
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>通杀模式</label>
                    <select style={styles.formInput} value={zhaJinHuaConfig.tongSha ? '1' : '0'} onChange={(e) => setZhaJinHuaConfig({ ...zhaJinHuaConfig, tongSha: e.target.value === '1' })}>
                      <option value="0">关闭</option>
                      <option value="1">开启（赢家通杀全桌）</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 牛牛特殊配置 */}
            {createForm.game_type === 'niu_niu' && (
              <div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>庄家模式</label>
                    <select style={styles.formInput} value={niuNiuConfig.bankerMode} onChange={(e) => setNiuNiuConfig({ ...niuNiuConfig, bankerMode: e.target.value })}>
                      <option value="random">随机庄家</option>
                      <option value="rob">抢庄模式</option>
                      <option value="tong_bi">通比模式</option>
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>倍数上限</label>
                    <select style={styles.formInput} value={niuNiuConfig.multiplier} onChange={(e) => setNiuNiuConfig({ ...niuNiuConfig, multiplier: parseInt(e.target.value) })}>
                      <option value="1">1倍</option>
                      <option value="2">2倍</option>
                      <option value="3">3倍</option>
                      <option value="4">4倍</option>
                      <option value="5">5倍（牛牛封顶）</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 三公特殊配置 */}
            {createForm.game_type === 'san_gong' && (
              <div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>抢庄模式</label>
                    <select style={styles.formInput} value={sanGongConfig.robBanker ? '1' : '0'} onChange={(e) => setSanGongConfig({ ...sanGongConfig, robBanker: e.target.value === '1' })}>
                      <option value="1">开启（轮流抢庄）</option>
                      <option value="0">关闭（固定庄家）</option>
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>三公倍数</label>
                    <select style={styles.formInput} value={sanGongConfig.multiplier} onChange={(e) => setSanGongConfig({ ...sanGongConfig, multiplier: parseInt(e.target.value) })}>
                      <option value="2">2倍</option>
                      <option value="3">3倍</option>
                      <option value="4">4倍</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 掼蛋特殊配置 */}
            {createForm.game_type === 'guandan' && (
              <div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>升级模式</label>
                    <select style={styles.formInput} value={guandanConfig.upgradeMode} onChange={(e) => setGuandanConfig({ ...guandanConfig, upgradeMode: e.target.value })}>
                      <option value="classic">经典升级（2→A）</option>
                      <option value="quick">快速升级（直接A）</option>
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>搭档模式</label>
                    <select style={styles.formInput} value={guandanConfig.partnerMode} onChange={(e) => setGuandanConfig({ ...guandanConfig, partnerMode: e.target.value })}>
                      <option value="fixed">固定搭档</option>
                      <option value="random">随机搭档</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 斗地主特殊配置 */}
            {createForm.game_type === 'fight_bomb' && (
              <div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>底分</label>
                    <select style={styles.formInput} value={fightBombConfig.callScore} onChange={(e) => setFightBombConfig({ ...fightBombConfig, callScore: parseInt(e.target.value) })}>
                      <option value="1">1分</option>
                      <option value="2">2分</option>
                      <option value="3">3分（最高）</option>
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>翻倍机制</label>
                    <select style={styles.formInput} value={fightBombConfig.doubleMode ? '1' : '0'} onChange={(e) => setFightBombConfig({ ...fightBombConfig, doubleMode: e.target.value === '1' })}>
                      <option value="1">开启（春天/炸弹翻倍）</option>
                      <option value="0">关闭</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 奥马哈特殊配置 */}
            {createForm.game_type === 'omaha' && (
              <div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>底牌数</label>
                    <select style={styles.formInput} value={omahaConfig.holeCards} onChange={(e) => setOmahaConfig({ ...omahaConfig, holeCards: parseInt(e.target.value) })}>
                      <option value="4">4张底牌（标准奥马哈）</option>
                      <option value="5">5张底牌（奥马哈5）</option>
                    </select>
                  </div>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>高低牌分池</label>
                    <select style={styles.formInput} value={omahaConfig.hiLo ? '1' : '0'} onChange={(e) => setOmahaConfig({ ...omahaConfig, hiLo: e.target.value === '1' })}>
                      <option value="0">关闭（只分高牌池）</option>
                      <option value="1">开启（高/低牌分池）</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 十三水特殊配置 */}
            {createForm.game_type === 'thirteen_water' && (
              <div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>特殊牌型倍数</label>
                    <select style={styles.formInput} value={thirteenWaterConfig.specialMultiplier} onChange={(e) => setThirteenWaterConfig({ ...thirteenWaterConfig, specialMultiplier: parseInt(e.target.value) })}>
                      <option value="1">1倍</option>
                      <option value="2">2倍</option>
                      <option value="3">3倍</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 百变双扣特殊配置 */}
            {createForm.game_type === 'double_kong' && (
              <div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>炸弹模式</label>
                    <select style={styles.formInput} value={doubleKongConfig.bombMode ? '1' : '0'} onChange={(e) => setDoubleKongConfig({ ...doubleKongConfig, bombMode: e.target.value === '1' })}>
                      <option value="1">开启（炸弹翻倍）</option>
                      <option value="0">关闭</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 红五特殊配置 */}
            {createForm.game_type === 'hong_wu' && (
              <div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>升级目标</label>
                    <select style={styles.formInput} value={hongWuConfig.upgradeTarget} onChange={(e) => setHongWuConfig({ ...hongWuConfig, upgradeTarget: parseInt(e.target.value) })}>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="5">5</option>
                      <option value="10">10</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 菠萝扑克特殊配置 */}
            {createForm.game_type === 'pineapple' && (
              <div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>模式</label>
                    <select style={styles.formInput} value={pineappleConfig.crazyMode ? '1' : '0'} onChange={(e) => setPineappleConfig({ ...pineappleConfig, crazyMode: e.target.value === '1' })}>
                      <option value="0">标准菠萝</option>
                      <option value="1">疯狂菠萝（Crazy Pineapple）</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* 短牌德州特殊配置 */}
            {createForm.game_type === 'short_deck' && (
              <div>
                <div style={styles.formRow}>
                  <div style={styles.formGroup}>
                    <label style={styles.formLabel}>牌组</label>
                    <select style={styles.formInput} value={shortDeckConfig.sixPlus ? '1' : '0'} onChange={(e) => setShortDeckConfig({ ...shortDeckConfig, sixPlus: e.target.value === '1' })}>
                      <option value="1">6+ 短牌（去2-5）</option>
                      <option value="0">9人短牌（去2-3）</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div style={styles.formGroup}>
              <label style={styles.formLabel}>房间密码（可选）</label>
              <input
                style={styles.formInput}
                placeholder="留空为公开房间"
                maxLength={4}
                value={createForm.room_password}
                onChange={(e) => setCreateForm({ ...createForm, room_password: e.target.value.replace(/\D/g, "") })}
              />
            </div>
            <div style={styles.modalButtons}>
              <button style={styles.cancelBtn} onClick={() => setShowCreateRoom(false)}>取消</button>
              <button style={styles.confirmBtn} onClick={handleCreateRoom}>创建</button>
            </div>
          </div>
        </div>
      )}
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
    background: 'linear-gradient(135deg, var(--vp-warning) 0%, var(--vp-warning) 100%)',
    color: 'var(--vp-surface)',
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
    color: 'var(--vp-warning)',
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
  },
  navIcon: {
    fontSize: '16px',
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
  pageHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  pageTitle: {
    color: '#fff',
    fontSize: '22px',
    fontWeight: '600',
    margin: 0,
  },
  createBtn: {
    padding: '10px 20px',
    background: 'linear-gradient(135deg, var(--vp-warning) 0%, var(--vp-warning) 100%)',
    color: 'var(--vp-surface)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600',
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
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  statIcon: {
    fontSize: '36px',
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
  roomGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
  },
  roomCard: {
    background: 'rgba(255,255,255,0.04)',
    backdropFilter: 'blur(10px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '12px',
    padding: '20px',
  },
  roomCardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '12px',
  },
  roomGame: {
    color: '#fff',
    fontSize: '16px',
    fontWeight: '600',
  },
  roomStatus: {
    fontSize: '13px',
  },
  roomCardBody: {
    color: 'rgba(255,255,255,0.6)',
  },
  roomIdText: {
    fontSize: '18px',
    fontFamily: 'monospace',
    color: 'var(--vp-warning)',
    marginBottom: '8px',
  },
  roomMeta: {
    fontSize: '13px',
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
  emptyText: {
    color: 'rgba(255,255,255,0.3)',
    textAlign: 'center',
    padding: '40px 0',
  },
  badge: {
    padding: '4px 10px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    background: 'rgba(16,185,129,0.15)',
    color: 'var(--vp-success)',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(5px)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: 'var(--vp-surface)',
    padding: '32px',
    borderRadius: '16px',
    width: '90%',
    maxWidth: '440px',
    border: '1px solid rgba(255,255,255,0.1)',
  },
  modalTitle: {
    color: '#fff',
    fontSize: '22px',
    fontWeight: '600',
    margin: '0 0 24px',
  },
  formGroup: {
    marginBottom: '16px',
    flex: 1,
  },
  formRow: {
    display: 'flex',
    gap: '16px',
  },
  formLabel: {
    display: 'block',
    color: 'rgba(255,255,255,0.6)',
    fontSize: '13px',
    marginBottom: '6px',
  },
  formInput: {
    width: '100%',
    padding: '10px 14px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '15px',
    boxSizing: 'border-box',
  },
  modalButtons: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  },
  cancelBtn: {
    flex: 1,
    padding: '12px',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '15px',
  },
  confirmBtn: {
    flex: 1,
    padding: '12px',
    background: 'linear-gradient(135deg, var(--vp-warning) 0%, var(--vp-warning) 100%)',
    color: 'var(--vp-surface)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '15px',
    fontWeight: '600',
  },
}

export default App

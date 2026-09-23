#!/usr/bin/env node
/**
 * V-POKER mock 后端 · 四玩法完整对局测试
 *
 * 对 texas_holdem / zha_jin_hua / niu_niu / san_gong 各跑一局：
 *   HTTP 创建房间 + 加机器人 → WS join_room → ready → 自己回合行动
 *   → 摊牌 round_result → 余额变更
 *
 * 前置：node tools/mock-server.mjs
 * 用法：node tools/mock-handtest.mjs
 */

const BFF = 'http://localhost:4000'
const WS = 'ws://localhost:8003/ws'
const USER = 'player_alice'

let pass = 0
let fail = 0
const ok = (n, x = '') => {
	pass++
	console.log(`  [PASS] ${n}${x ? '  ' + x : ''}`)
}
const bad = (n, x = '') => {
	fail++
	console.log(`  [FAIL] ${n}  ${x}`)
}

async function api(method, path, { token, body, ip } = {}) {
	const headers = { 'Content-Type': 'application/json' }
	if (token) headers['Authorization'] = `Bearer ${token}`
	if (ip) headers['x-forwarded-for'] = ip
	const res = await fetch(BFF + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
	return await res.json()
}

const GAMES = [
	{ gt: 'texas_holdem', base: 100, name: '德州扑克' },
	{ gt: 'zha_jin_hua', base: 50, name: '炸金花' },
	{ gt: 'niu_niu', base: 100, name: '牛牛' },
	{ gt: 'san_gong', base: 100, name: '三公' }
]

async function runGame(token, game) {
	console.log(`\n--- ${game.name} (${game.gt}) ---`)

	const created = await api('POST', '/api/rooms/create', {
		token,
		body: {
			room_name: `${game.name}冒烟房`,
			game_type: game.gt,
			mode: 'cash',
			total_rounds: 10,
			base_score: game.base,
			big_blind: game.base,
			min_players: 2,
			max_players: 6,
			room_password: ''
		}
	})
	if (created.code !== 0) {
		bad('创建房间', JSON.stringify(created))
		return
	}
	const roomId = created.data.room_id
	ok('创建房间', `room_id=${roomId}`)

	const bots = await api('POST', `/api/rooms/${roomId}/bots`, { token, body: { count: 3, strategy: 'loose', chips: 5000 } })
	ok('加机器人', `added=${bots.data?.bots?.length}`)

	const before = await api('GET', `/api/wallet/balance/${USER}`, { token })
	const balBefore = before.data?.balance ?? 0

	const phases = []
	let result = null
	let ackOk = 0
	let ackErr = null

	await new Promise((resolve) => {
		const ws = new WebSocket(WS)
		let readySent = false
		let lastTurnKey = ''
		let wasMyTurn = false
		let done = false
		const finish = (why) => {
			if (done) return
			done = true
			clearTimeout(timer)
			console.log(`  … ${why}`)
			try {
				ws.close()
			} catch {
				/* ignore */
			}
			resolve()
		}
		const timer = setTimeout(() => finish('超时（90s）'), 90000)

		ws.onopen = () => ws.send(JSON.stringify({ type: 'join_room', room_id: roomId, user_id: USER, as_spectator: false, token }))

		ws.onmessage = (ev) => {
			let msg
			try {
				msg = JSON.parse(ev.data)
			} catch {
				return
			}
			if (msg.type === 'action_ack') {
				if (msg.code === 0) ackOk++
				else ackErr = msg.message
				return
			}
			if (msg.type === 'round_result') {
				result = msg.data
				finish('一局完成')
				return
			}
			// DEALING 等瞬态阶段只通过 phase_changed 下发（game_state 里已是 BETTING）
			if (msg.type === 'phase_changed') {
				const np = msg.data?.new_phase
				if (np != null && phases[phases.length - 1] !== np) phases.push(np)
				return
			}
			if (msg.type !== 'game_state') return

			const d = msg.data
			const phase = d.round_state.phase
			if (phases[phases.length - 1] !== phase) phases.push(phase)

			// 准备开局
			if (!readySent && phase === 'WAITING') {
				readySent = true
				ws.send(JSON.stringify({ type: 'player_action', req_id: `act_ready_${Date.now()}`, user_id: USER, action: { action_type: 'ready', user_id: USER } }))
				return
			}

			// 我的回合：按阶段选择动作（回合从"非我"切到"我"时触发一次）
			const actionable = phase === 'BETTING' || phase === 'ACTION' || phase === 'QIANG_ZHUANG'
			const myTurn = actionable && d.turn_timer?.user_id === USER
			if (myTurn && !wasMyTurn) {
				const me = d.seats.find((s) => s.user_id === USER)
				let action
				if (phase === 'QIANG_ZHUANG') {
					action = { action_type: 'qiang_zhuang', user_id: USER, multiplier: 1 }
				} else if (phase === 'ACTION') {
					action = { action_type: 'view_cards', user_id: USER }
				} else if (game.gt === 'niu_niu' || game.gt === 'san_gong') {
					// 牛牛 / 三公：下注倍数
					action = { action_type: 'bet', user_id: USER, multiplier: 1 }
				} else if (game.gt === 'zha_jin_hua') {
					// 炸金花无 check 语义，统一跟注
					action = { action_type: 'call', user_id: USER }
				} else {
					const canCheck = me != null && me.current_bet >= d.round_state.current_highest_bet
					action = { action_type: canCheck ? 'check' : 'call', user_id: USER }
				}
				ws.send(JSON.stringify({ type: 'player_action', req_id: `act_${Date.now()}`, user_id: USER, action }))
			}
			wasMyTurn = myTurn
		}

		ws.onerror = () => finish('WS 错误')
	})

	// 断言
	phases.includes('DEALING') ? ok('进入 DEALING') : bad('进入 DEALING', phases.join('→'))
	phases.includes('BETTING') ? ok('进入 BETTING', `下注轮 ${phases.filter((p) => p === 'BETTING').length} 段`) : bad('进入 BETTING', phases.join('→'))
	ackOk > 0 ? ok('action_ack 成功', `${ackOk} 次`) : bad('action_ack 成功', ackErr ?? '无')
	result != null ? ok('round_result', `${result.results.length} 名玩家`) : bad('round_result')

	if (result != null) {
		const me = result.results.find((r) => r.user_id === USER)
		const evtTotal = result.event_log?.total ?? 0
		ok('event_log 为对象结构', `total=${evtTotal}`)
		ok('我的净额', `${me ? (me.net_amount >= 0 ? '+' : '') + me.net_amount : '?'} (${me?.hand_name ?? '?'})`)
	}

	const after = await api('GET', `/api/wallet/balance/${USER}`, { token })
	const balAfter = after.data?.balance ?? 0
	balAfter !== balBefore ? ok('余额已变更', `${balBefore} → ${balAfter}`) : bad('余额已变更', `仍为 ${balAfter}`)
}

async function main() {
	console.log('\n=== 四玩法完整对局测试 ===\n')

	// 用独立 x-forwarded-for 避开登录限流
	const login = await api('POST', '/api/auth/login', { body: { username: USER, password: 'test' }, ip: 'ip-hand' })
	if (login.code !== 0) {
		console.log('登录失败，请先启动 mock 服务（node tools/mock-server.mjs）')
		process.exit(1)
	}
	const token = login.data.access_token
	ok('登录', USER)

	// 铸币（真实后端筹码唯一来源 = admin mint）
	const adminLogin = await api('POST', '/api/auth/login', { body: { username: 'admin_root', password: 'test' }, ip: 'ip-hand-admin' })
	const adminToken = adminLogin.data?.access_token
	const mint = await api('POST', '/api/admin/mint', {
		token: adminToken,
		body: { transaction_id: `hand_mint_${Date.now()}`, user_id: USER, amount: 500000, remark: '对局测试筹码' }
	})
	ok('铸币', `balance=${mint.data?.balance}`)

	for (const g of GAMES) {
		await runGame(token, g)
	}

	console.log(`\n=== 结果: 通过 ${pass} / 失败 ${fail} ===\n`)
	process.exit(fail === 0 ? 0 : 1)
}

main()

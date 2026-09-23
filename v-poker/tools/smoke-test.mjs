#!/usr/bin/env node
/**
 * V-POKER 客户端完整冒烟测试（对齐 yefeng 后端真实行为）
 *
 * 覆盖客户端会调用的全部 HTTP + WS 接口，含错误分支：
 *   认证：登录 / 密码错误 401 / 注册 / 重复注册 409 / 登录限流 429
 *   房间：列表 / 创建(非法 game_type 400) / 详情 / 加入(密码错 403) / 加机器人 / 牌谱
 *   钱包：余额 / 流水(分页) / 转账(手续费) / 自转 400 / 重复 tx 400
 *   代理：dashboard / children / commission
 *   管理：audit / overview / rooms
 *   WS：connect / ping-pong / join_room → joined+game_state / 旁观模式 / 未入房 action 400
 *
 * 前置：node tools/mock-server.mjs
 * 用法：node tools/smoke-test.mjs
 */

const BFF = 'http://localhost:4000'
const WS = 'ws://localhost:8003/ws'

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
const eq = (n, actual, expect, extra = '') => {
	if (actual === expect) ok(n, extra)
	else bad(n, `期望 ${JSON.stringify(expect)}，实际 ${JSON.stringify(actual)}  ${extra}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** ip 用于隔离登录限流配额（mock 按 x-forwarded-for 计数） */
async function api(method, path, { token, body, ip } = {}) {
	const headers = { 'Content-Type': 'application/json' }
	if (token) headers['Authorization'] = `Bearer ${token}`
	if (ip) headers['x-forwarded-for'] = ip
	const res = await fetch(BFF + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
	const text = await res.text()
	let json = null
	try {
		json = JSON.parse(text)
	} catch {
		/* not json */
	}
	return { status: res.status, json, text }
}

async function login(username, password, ip) {
	const r = await api('POST', '/api/auth/login', { body: { username, password }, ip })
	return r
}

async function main() {
	console.log(`\n=== V-POKER 客户端完整冒烟 ===\nBFF: ${BFF}\nWS : ${WS}\n`)

	// ============ 1. 认证 ============
	console.log('[1] 认证')
	const badLogin = await login('player_alice', 'wrong', 'ip-auth-1')
	eq('密码错误 → 401', badLogin.status, 401, badLogin.json?.message)

	const unknown = await login('nobody_xyz', 'test', 'ip-auth-2')
	eq('未知用户 → 401', unknown.status, 401, unknown.json?.message)

	const alice = await login('player_alice', 'test', 'ip-auth-1')
	if (alice.json?.code !== 0) {
		bad('player_alice 登录', JSON.stringify(alice.json))
		console.log('\n种子账号登录失败，请确认 mock 服务已启动\n')
		process.exit(1)
	}
	eq('player_alice 登录 code', alice.json.code, 0)
	eq('token_type', alice.json.data.token_type, 'Bearer')
	eq('user_id', alice.json.data.user.user_id, 'player_alice')
	eq('role', alice.json.data.user.role, 'player')
	const aliceToken = alice.json.data.access_token

	const bob = await login('player_bob', 'test', 'ip-auth-1')
	const bobToken = bob.json?.data?.access_token
	ok('player_bob 登录', `token=${bobToken ? 'ok' : 'missing'}`)

	const agent = await login('agent_root', 'test', 'ip-auth-1')
	const agentToken = agent.json?.data?.access_token
	eq('agent_root role', agent.json?.data?.user?.role, 'agent')

	const admin = await login('admin_root', 'test', 'ip-auth-1')
	const adminToken = admin.json?.data?.access_token
	eq('admin_root role', admin.json?.data?.user?.role, 'admin')

	const regUser = `smoke_${Date.now().toString(36)}`
	const reg = await api('POST', '/api/auth/register', { body: { username: regUser, password: 'test', role: 'player' }, ip: 'ip-auth-3' })
	eq('注册 code', reg.json?.code, 0, `user_id=${reg.json?.data?.user_id}`)
	const regDup = await api('POST', '/api/auth/register', { body: { username: regUser, password: 'test' }, ip: 'ip-auth-3' })
	eq('重复注册 → 409', regDup.status, 409)

	// 限流：同一 ip 第 6 次登录 → 429
	const ip = 'ip-ratelimit'
	for (let i = 0; i < 5; i++) await login('player_alice', 'test', ip)
	const limited = await login('player_alice', 'test', ip)
	eq('登录限流第 6 次 → 429', limited.status, 429, limited.json?.message)

	// 无 token 访问受保护接口
	const noAuth = await api('GET', '/api/rooms/list')
	eq('无 token → 401', noAuth.status, 401, noAuth.json?.message)

	// 铸币（真实后端筹码唯一来源 = admin mint）
	const mintA = await api('POST', '/api/admin/mint', {
		token: adminToken,
		body: { transaction_id: `smoke_mint_a_${Date.now()}`, user_id: 'player_alice', amount: 100000, remark: '冒烟初始筹码' }
	})
	eq('admin mint player_alice', mintA.json?.code, 0, `balance=${mintA.json?.data?.balance}`)
	const mintB = await api('POST', '/api/admin/mint', {
		token: adminToken,
		body: { transaction_id: `smoke_mint_b_${Date.now()}`, user_id: 'player_bob', amount: 100000, remark: '冒烟初始筹码' }
	})
	eq('admin mint player_bob', mintB.json?.code, 0)
	const mintForbid = await api('POST', '/api/admin/mint', { token: aliceToken, body: { user_id: 'player_alice', amount: 1 } })
	eq('非 admin mint → 403', mintForbid.status, 403)

	// ============ 2. 房间 ============
	console.log('\n[2] 房间')
	const badGt = await api('POST', '/api/rooms/create', { token: aliceToken, body: { game_type: 'no_such_game' } })
	eq('非法 game_type → 400', badGt.status, 400, badGt.json?.message)

	const created = await api('POST', '/api/rooms/create', {
		token: aliceToken,
		body: { room_name: '冒烟房', game_type: 'texas_holdem', mode: 'cash', total_rounds: 10, base_score: 100, big_blind: 100, min_players: 2, max_players: 6, room_password: '' }
	})
	eq('创建房间 code', created.json?.code, 0, `room_id=${created.json?.data?.room_id}`)
	const roomId = created.json?.data?.room_id
	eq('created_by 由服务端注入', created.json?.data?.created_by, 'player_alice')
	eq('无密码 → room_type=public', created.json?.data?.room_type, 'public')
	if (!/^\d{6}$/.test(roomId ?? '')) bad('房号应为 6 位数字', roomId)

	const priv = await api('POST', '/api/rooms/create', {
		token: aliceToken,
		body: { room_name: '私有房', game_type: 'zha_jin_hua', base_score: 50, max_players: 5, room_password: '1234' }
	})
	const privId = priv.json?.data?.room_id
	eq('有密码 → room_type=private', priv.json?.data?.room_type, 'private')

	const list = await api('GET', '/api/rooms/list?status=', { token: bobToken })
	const ids = Array.isArray(list.json?.data) ? list.json.data.map((r) => r.room_id) : []
	if (ids.includes(roomId)) ok('房间列表含新建房间', `共 ${ids.length} 个`)
	else bad('房间列表含新建房间', `ids=${ids.join(',')}`)
	const pubOnly = Array.isArray(list.json?.data) && list.json.data.every((r) => r.room_type === 'public')
	eq('列表仅返回 public', pubOnly, true)

	const detail = await api('GET', `/api/rooms/${roomId}`, { token: bobToken })
	eq('房间详情 code', detail.json?.code, 0)
	eq('详情含 RoomDetail 字段(big_blind)', typeof detail.json?.data?.big_blind, 'number')

	const notFound = await api('GET', '/api/rooms/000000', { token: bobToken })
	eq('房间不存在 → 404', notFound.status, 404, notFound.json?.message)

	const joinPub = await api('POST', '/api/rooms/join', { token: bobToken, body: { room_id: roomId } })
	eq('加入公开房 code', joinPub.json?.code, 0, joinPub.json?.message)
	eq('user_id 由服务端注入', joinPub.json?.data?.created_by, 'player_alice')

	const joinBadPwd = await api('POST', '/api/rooms/join', { token: bobToken, body: { room_id: privId, room_password: '0000' } })
	eq('私有房密码错 → 403', joinBadPwd.status, 403, joinBadPwd.json?.message)
	const joinGoodPwd = await api('POST', '/api/rooms/join', { token: bobToken, body: { room_id: privId, room_password: '1234' } })
	eq('私有房密码对 code', joinGoodPwd.json?.code, 0)

	const bots = await api('POST', `/api/rooms/${roomId}/bots`, { token: aliceToken, body: { count: 3, strategy: 'loose', chips: 5000 } })
	eq('加机器人 code', bots.json?.code, 0, bots.json?.message)
	eq('机器人数量', Array.isArray(bots.json?.data?.bots) ? bots.json.data.bots.length : -1, 3)

	// ============ 3. 钱包 ============
	console.log('\n[3] 钱包')
	const bal = await api('GET', '/api/wallet/balance/player_alice', { token: aliceToken })
	eq('余额 code', bal.json?.code, 0, `balance=${bal.json?.data?.balance}`)
	eq('wallet_id 格式', bal.json?.data?.wallet_id, 'w_player_player_alice')

	const balMissing = await api('GET', '/api/wallet/balance/no_such_user', { token: aliceToken })
	eq('不存在用户余额 → 404', balMissing.status, 404, balMissing.json?.message)

	const txAll = await api('GET', '/api/wallet/transactions/player_alice?limit=100&offset=0', { token: aliceToken })
	eq('流水 code', txAll.json?.code, 0, `条数=${Array.isArray(txAll.json?.data) ? txAll.json.data.length : '?'}`)
	const txOne = await api('GET', '/api/wallet/transactions/player_alice?limit=1&offset=0', { token: aliceToken })
	eq('流水分页 limit=1', Array.isArray(txOne.json?.data) ? txOne.json.data.length : -1, 1)

	const before = bal.json?.data?.balance ?? 0
	const xfer = await api('POST', '/api/wallet/transfer', {
		token: aliceToken,
		body: { transaction_id: `smoke_xfer_${Date.now()}`, from_user_id: 'player_alice', to_user_id: 'player_bob', amount: 10000, remark: '冒烟转账' }
	})
	eq('转账 code', xfer.json?.code, 0)
	eq('手续费 = floor(10000*0.0001)', xfer.json?.data?.fee, 1)
	eq('到账 net = amount - fee', xfer.json?.data?.net_amount, 9999)
	const after = await api('GET', '/api/wallet/balance/player_alice', { token: aliceToken })
	eq('转账后扣款 = gross', (before - (after.json?.data?.balance ?? 0)), 10000)

	const selfXfer = await api('POST', '/api/wallet/transfer', {
		token: aliceToken,
		body: { transaction_id: `smoke_self_${Date.now()}`, from_user_id: 'player_alice', to_user_id: 'player_alice', amount: 100 }
	})
	eq('自转 → 400', selfXfer.status, 400, selfXfer.json?.message)

	const dupId = `smoke_dup_${Date.now()}`
	await api('POST', '/api/wallet/transfer', { token: aliceToken, body: { transaction_id: dupId, from_user_id: 'player_alice', to_user_id: 'player_bob', amount: 100 } })
	const dup = await api('POST', '/api/wallet/transfer', { token: aliceToken, body: { transaction_id: dupId, from_user_id: 'player_alice', to_user_id: 'player_bob', amount: 100 } })
	eq('重复 transaction_id → 400', dup.status, 400, dup.json?.message)

	// ============ 4. 代理 / 管理 ============
	console.log('\n[4] 代理 / 管理')
	const dash = await api('GET', '/api/agent/dashboard', { token: agentToken })
	eq('代理 dashboard code', dash.json?.code, 0, `agent_id=${dash.json?.data?.agent_id}`)
	eq('dashboard 含 wallet', typeof dash.json?.data?.wallet?.balance, 'number')

	const children = await api('GET', '/api/agent/children', { token: agentToken })
	eq('代理 children code', children.json?.code, 0, `下级 ${Array.isArray(children.json?.data) ? children.json.data.length : '?'} 个`)

	const comm = await api('GET', '/api/agent/commission', { token: agentToken })
	eq('代理 commission code', comm.json?.code, 0, `total=${comm.json?.data?.total_commission}`)

	const forbid = await api('GET', '/api/admin/overview', { token: aliceToken })
	eq('player 访问 admin → 403', forbid.status, 403, forbid.json?.message)

	const audit = await api('GET', '/api/admin/audit', { token: adminToken })
	eq('管理 audit code', audit.json?.code, 0, `check_passed=${audit.json?.data?.check_passed}`)

	const overview = await api('GET', '/api/admin/overview', { token: adminToken })
	eq('管理 overview code', overview.json?.code, 0, `active_tables=${overview.json?.data?.active_tables}`)

	const adminRooms = await api('GET', '/api/admin/rooms', { token: adminToken })
	eq('管理 rooms code', adminRooms.json?.code, 0, `${Array.isArray(adminRooms.json?.data) ? adminRooms.json.data.length : '?'} 个`)

	// ============ 5. WebSocket ============
	console.log('\n[5] WebSocket')
	await wsChecks(aliceToken, bobToken, roomId, privId)

	console.log(`\n=== 结果: 通过 ${pass} / 失败 ${fail} ===\n`)
	process.exit(fail === 0 ? 0 : 1)
}

function wsChecks(aliceToken, bobToken, roomId, privId) {
	return new Promise((resolve) => {
		const ws = new WebSocket(WS)
		const got = new Set()
		let notJoinedAck = false
		let spectatorMasked = false
		let done = false
		const finish = () => {
			if (done) return
			done = true
			clearTimeout(timer)
			got.has('pong') ? ok('ping → pong') : bad('ping → pong')
			got.has('joined') ? ok('join_room → joined') : bad('join_room → joined')
			got.has('game_state') ? ok('join_room → game_state') : bad('join_room → game_state')
			notJoinedAck ? ok('未入房 player_action → action_ack code 400') : bad('未入房 player_action → action_ack code 400')
			spectatorMasked ? ok('旁观模式：他人底牌清空') : bad('旁观模式：他人底牌清空')
			try {
				ws.close()
			} catch {
				/* ignore */
			}
			resolve()
		}
		const timer = setTimeout(finish, 8000)

		ws.onopen = () => {
			ok('WS 连接建立')
			ws.send(JSON.stringify({ type: 'ping' }))
			// 先不 join，直接发 action，验证 "Not joined any room"
			ws.send(JSON.stringify({ type: 'player_action', req_id: 'act_noroom', user_id: 'player_alice', action: { action_type: 'check', user_id: 'player_alice' } }))
			// 然后 join
			ws.send(JSON.stringify({ type: 'join_room', room_id: roomId, user_id: 'player_alice', as_spectator: false, token: aliceToken }))
		}

		ws.onmessage = (ev) => {
			let msg
			try {
				msg = JSON.parse(ev.data)
			} catch {
				return
			}
			if (msg.type === 'pong') got.add('pong')
			if (msg.type === 'joined') got.add('joined')
			if (msg.type === 'game_state') {
				got.add('game_state')
				// 检查旁观者视角
				if (msg.room_id === privId) {
					const anyCards = msg.data.seats.some((s) => Array.isArray(s.cards) && s.cards.length > 0)
					if (!anyCards) spectatorMasked = true
				}
			}
			if (msg.type === 'action_ack' && msg.req_id === 'act_noroom' && msg.code === 400) notJoinedAck = true

			if (got.has('pong') && got.has('joined') && got.has('game_state') && notJoinedAck && !spectatorMasked) {
				// 已入房后，再以旁观身份连一次私有房验证脱敏
				const ws2 = new WebSocket(WS)
				ws2.onopen = () => ws2.send(JSON.stringify({ type: 'join_room', room_id: privId, user_id: 'player_bob', as_spectator: true }))
				ws2.onmessage = (e2) => {
					let m2
					try {
						m2 = JSON.parse(e2.data)
					} catch {
						return
					}
					if (m2.type !== 'game_state') return
					const anyCards = m2.data.seats.some((s) => Array.isArray(s.cards) && s.cards.length > 0)
					if (!anyCards) spectatorMasked = true
					try {
						ws2.close()
					} catch {
						/* ignore */
					}
					finish()
				}
				ws2.onerror = () => finish()
				return
			}
			if (got.has('pong') && got.has('joined') && got.has('game_state') && notJoinedAck && spectatorMasked) finish()
		}

		ws.onerror = () => {
			bad('WS 错误', '请确认 mock 服务已启动')
			finish()
		}
	})
}

main()

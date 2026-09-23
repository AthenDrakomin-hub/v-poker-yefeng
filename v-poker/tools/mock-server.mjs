#!/usr/bin/env node
/**
 * V-POKER 本地 mock 后端（按 v-poker-yefeng 真实实现复刻）
 *
 * 一个进程同时扮演 BFF + wallet_service + commission_service + game-engine：
 *   HTTP :4000    —— BFF 路由（auth / rooms / wallet / agent / admin）
 *   WS   :8003/ws —— game-engine WebSocket
 *
 * 忠实复刻的真实行为（含"坑"）：
 *   - 登录：仅 5 个种子账号（密码 test），未知用户 401；同一 IP 60s 内第 6 次 429
 *   - JWT：HS256，claims = sub/role/iat/exp，7 天
 *   - wallet_id = w_{user_type}_{user_id}；牌桌 = w_room_room_{room_id}；代理佣金入 w_player_{agent}
 *   - 转账手续费 = floor(amount * 0.0001)，收款方得 net
 *   - 房间号 = 6 位随机数字；无密码强制 room_type=public；created_by/user_id 由服务端从 JWT 注入
 *   - create/join 返回 RoomDetail；list 只返回 public 且 status 匹配，created_at 倒序，limit 50
 *   - 牌 rank 为 1..13（1=A, 11=J, 12=Q, 13=K），code = "{suit}-{rank}"，suit ∈ S/H/C/D
 *   - WS 广播顶层统一 {type,data,room_id,timestamp}；auto_fold.data.folded[] 是 camelCase
 *   - 普通玩家快照不隐藏他人底牌（真实实现如此）；as_spectator=true 时全部清空
 *   - round_result.data.event_log 是对象 {room_id,game_type,round_no,events[],total}
 *   - 阶段：WAITING→DEALING→BETTING(×4)→SHOWDOWN→SETTLING→FINISHED，结算后 phase 复位 WAITING
 *   - 回合倒计时 30s，每秒 tick，超时自动过牌/弃牌
 *   - /api/wallet/audit 守恒失败时 body code=5001 但 HTTP=200
 *
 * 为让客户端能跑通的 3 处补全（真实后端缺失，已标注 [补全]）：
 *   1. BFF 挂载 /api/wallet/*（契约文档声称有，BFF 代码里没有）
 *   2. 引擎在"足够玩家 ready"时自动开局（真实引擎没有任何 startRound 入口）
 *   3. 引擎房间在首次 join_room / bots 时惰性创建
 *
 * 用法：node tools/mock-server.mjs
 */

import http from 'node:http'
import crypto from 'node:crypto'

const HTTP_PORT = 4000
const WS_PORT = 8003
const JWT_SECRET = 'poker-platform-dev-secret-2024'
const JWT_EXPIRE_SECONDS = 7 * 24 * 3600
const TURN_TIMEOUT_MS = 30000
const TURN_TICK_MS = 1000
const BOT_THINK_MS = 1500
const SYNC_INTERVAL_MS = 5000
const NEXT_HAND_DELAY_MS = 4000
const LOGIN_WINDOW_MS = 60000
const LOGIN_MAX_ATTEMPTS = 5

const PLATFORM_FEE_RATE = 0.05
const AGENT_COMMISSION_RATE = 0.03
const RAKE_CAP_MULTIPLIER = 5

/* ============================================================
 * 基础工具
 * ============================================================ */

const now = () => Date.now()
let seq = 0
const nid = (p) => `${p}_${Date.now()}_${++seq}`
const rnd6 = () => String(Math.floor(100000 + Math.random() * 900000))

const envelope = (code, message, data = null) => ({ code, message, data })

function sendJson(res, status, body) {
	const text = JSON.stringify(body)
	res.writeHead(status, {
		'Content-Type': 'application/json; charset=utf-8',
		'Content-Length': Buffer.byteLength(text),
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-User-Role,X-User-Id',
		'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
	})
	res.end(text)
}

function readBody(req) {
	return new Promise((resolve) => {
		let raw = ''
		req.on('data', (c) => (raw += c))
		req.on('end', () => {
			if (!raw) return resolve({})
			try {
				resolve(JSON.parse(raw))
			} catch {
				resolve({})
			}
		})
	})
}

const floorDiv = (n, d) => Math.floor(n / d)
const decFloor = (n) => Math.floor(n) // 金额均为整数，floor 即截断

/* ============================================================
 * JWT（HS256，与 bff/src/auth/jwt.ts 对齐）
 * ============================================================ */

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const b64urlDecode = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')

function signToken(userId, role) {
	const iat = Math.floor(now() / 1000)
	const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
	const payload = b64url(JSON.stringify({ sub: userId, role, iat, exp: iat + JWT_EXPIRE_SECONDS }))
	const data = `${header}.${payload}`
	const sig = b64url(crypto.createHmac('sha256', JWT_SECRET).update(data).digest())
	return `${data}.${sig}`
}

function verifyToken(token) {
	const parts = token.split('.')
	if (parts.length !== 3) return null
	const data = `${parts[0]}.${parts[1]}`
	const expect = b64url(crypto.createHmac('sha256', JWT_SECRET).update(data).digest())
	if (expect !== parts[2]) return null
	try {
		const payload = JSON.parse(b64urlDecode(parts[1]))
		if (typeof payload.exp === 'number' && payload.exp * 1000 < now()) return null
		return payload
	} catch {
		return null
	}
}

/* ============================================================
 * 账号（bff/src/auth/index.ts 种子）
 * ============================================================ */

const users = new Map() // username -> { username, password, role }
for (const [u, r] of [
	['admin_root', 'admin'],
	['player_alice', 'player'],
	['player_bob', 'player'],
	['agent_root', 'agent'],
	['support_01', 'support']
]) {
	users.set(u, { username: u, password: 'test', role: r })
}

const loginAttempts = new Map() // ip -> { count, resetAt }

/* ============================================================
 * 钱包（wallet_service 行为）
 * ============================================================ */

const wallets = new Map() // user_id -> { user_id, user_type, balance, frozen_balance, updated_at }
const transactions = [] // 全局流水
const txIndex = new Set() // transaction_id 幂等
let feePoolBalance = 0

const walletIdOf = (userType, userId) => `w_${userType}_${userId}`
const roomUserId = (roomId) => `room_${roomId}`

function getOrCreateWallet(userId, userType = 'player') {
	let w = wallets.get(userId)
	if (w == null) {
		w = { user_id: userId, user_type: userType, balance: 0, frozen_balance: 0, updated_at: now() }
		wallets.set(userId, w)
	}
	return w
}

function addTx(rec) {
	if (rec.transaction_id != null) {
		if (txIndex.has(rec.transaction_id)) return false
		txIndex.add(rec.transaction_id)
	}
	transactions.push({ status: 'success', created_at: now(), ...rec })
	return true
}

function txsOfWallet(walletId) {
	return transactions
		.filter((t) => t.from_wallet_id === walletId || t.to_wallet_id === walletId)
		.sort((a, b) => b.created_at - a.created_at)
}

/* ============================================================
 * 代理（commission_service 种子）
 * ============================================================ */

const agents = [
	{ agent_id: 'agt_top_01', parent_id: null, level: 2, r_ratio: 0.2, commission_balance: 0, status: 'active' },
	{ agent_id: 'agt_sub_02', parent_id: 'agt_top_01', level: 1, r_ratio: 0.3, commission_balance: 0, status: 'active' },
	{ agent_id: 'agt_room_03', parent_id: 'agt_sub_02', level: 0, r_ratio: 0.5, commission_balance: 0, status: 'active' }
]

function agentChain(ids) {
	const byId = new Map(agents.map((a) => [a.agent_id, a]))
	const visited = new Set()
	const out = []
	const push = (id) => {
		const a = byId.get(id)
		if (a == null || visited.has(id)) return
		visited.add(id)
		out.push(a)
		if (a.parent_id != null) push(a.parent_id)
	}
	for (const id of ids) push(id)
	if (ids.length === 0) for (const a of agents) if (a.status === 'active') push(a.agent_id)
	return out.sort((a, b) => a.level - b.level)
}

/* ============================================================
 * 牌（rank 1..13，1=A；与 game-engine/src/shared/deck.ts 对齐）
 * ============================================================ */

const SUITS = ['S', 'H', 'C', 'D']
const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]

function makeDeck() {
	const d = []
	for (const s of SUITS) for (const r of RANKS) d.push({ suit: s, rank: r, code: `${s}-${r}` })
	for (let i = d.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		;[d[i], d[j]] = [d[j], d[i]]
	}
	return d
}

const rv = (r) => (r === 1 ? 14 : r) // A 当高牌

function score5(cs) {
	const rs = cs.map((c) => rv(c.rank)).sort((a, b) => b - a)
	const flush = cs.every((c) => c.suit === cs[0].suit)
	const counts = {}
	for (const r of rs) counts[r] = (counts[r] || 0) + 1
	const groups = Object.entries(counts)
		.map(([r, c]) => ({ r: +r, c }))
		.sort((a, b) => b.c - a.c || b.r - a.r)
	const uniq = [...new Set(rs)]
	let straightHigh = 0
	if (uniq.length === 5) {
		if (rs[0] - rs[4] === 4) straightHigh = rs[0]
		else if (rs[0] === 14 && rs[1] === 5) straightHigh = 5
	}
	if (flush && straightHigh) return { level: straightHigh === 14 ? 10 : 9, tie: [straightHigh] }
	if (groups[0].c === 4) return { level: 8, tie: [groups[0].r, groups[1].r] }
	if (groups[0].c === 3 && groups[1].c === 2) return { level: 7, tie: [groups[0].r, groups[1].r] }
	if (flush) return { level: 6, tie: rs }
	if (straightHigh) return { level: 5, tie: [straightHigh] }
	if (groups[0].c === 3) return { level: 4, tie: [groups[0].r, ...groups.slice(1).map((g) => g.r)] }
	if (groups[0].c === 2 && groups[1].c === 2) return { level: 3, tie: [groups[0].r, groups[1].r, groups[2].r] }
	if (groups[0].c === 2) return { level: 2, tie: [groups[0].r, ...groups.slice(1).map((g) => g.r)] }
	return { level: 1, tie: rs }
}

const TX_NAMES = ['', '高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺', '皇家同花顺']

function cmp(a, b) {
	if (a.level !== b.level) return a.level - b.level
	const n = Math.max(a.tie.length, b.tie.length)
	for (let i = 0; i < n; i++) {
		const x = a.tie[i] ?? 0
		const y = b.tie[i] ?? 0
		if (x !== y) return x - y
	}
	return 0
}

function evaluateTexas(cards) {
	let best = null
	const n = cards.length
	if (n < 5) return score5(cards)
	const rec = (start, picked) => {
		if (picked.length === 5) {
			const s = score5(picked)
			if (best == null || cmp(s, best) > 0) best = s
			return
		}
		for (let i = start; i < n; i++) rec(i + 1, [...picked, cards[i]])
	}
	rec(0, [])
	return best
}

// 炸金花：豹子6 > 顺金5 > 金花4 > 顺子3 > 对子2 > 单张1
function evaluateZjh(cs) {
	const rs = cs.map((c) => rv(c.rank)).sort((a, b) => b - a)
	const flush = cs.every((c) => c.suit === cs[0].suit)
	const uniq = [...new Set(rs)]
	let straight = 0
	if (uniq.length === 3) {
		if (rs[0] - rs[2] === 2) straight = rs[0]
		else if (rs[0] === 14 && rs[1] === 3 && rs[2] === 2) straight = 3.5 // A-3-2
	}
	const counts = {}
	for (const r of rs) counts[r] = (counts[r] || 0) + 1
	const groups = Object.entries(counts)
		.map(([r, c]) => ({ r: +r, c }))
		.sort((a, b) => b.c - a.c || b.r - a.r)
	if (groups[0].c === 3) return { level: 6, tie: [groups[0].r], name: '豹子' }
	if (flush && straight) return { level: 5, tie: [straight], name: '顺金' }
	if (flush) return { level: 4, tie: rs, name: '金花' }
	if (straight) return { level: 3, tie: [straight], name: '顺子' }
	if (groups[0].c === 2) return { level: 2, tie: [groups[0].r, groups[1].r], name: '对子' }
	return { level: 1, tie: rs, name: '单张' }
}

// 牛牛：五小牛100 > 炸弹牛90 > 五花牛80 > 牛牛70 > 牛九..牛一(19..11) > 无牛0
function evaluateNiuNiu(cs) {
	const rs = cs.map((c) => rv(c.rank))
	const sum = rs.reduce((a, b) => a + b, 0)
	if (rs.every((r) => r <= 5) && sum <= 10) return { level: 100, tie: [sum], name: '五小牛', multiplier: 5 }
	const counts = {}
	for (const r of rs) counts[r] = (counts[r] || 0) + 1
	const cvals = Object.values(counts)
	if (cvals.includes(4)) return { level: 90, tie: rs, name: '炸弹牛', multiplier: 4 }
	if (rs.every((r) => r >= 11)) return { level: 80, tie: rs, name: '五花牛', multiplier: 4 }
	let niu = -1
	for (let i = 0; i < 5; i++)
		for (let j = i + 1; j < 5; j++) {
			const rest = rs.filter((_v, k) => k !== i && k !== j)
			if ((rs[i] + rs[j]) % 10 === 0) {
				const rem = rest.reduce((a, b) => a + b, 0) % 10
				niu = Math.max(niu, rem === 0 ? 10 : rem)
			}
		}
	if (niu === 10) return { level: 70, tie: [10], name: '牛牛', multiplier: 3 }
	if (niu >= 7) return { level: 10 + niu, tie: [niu], name: `牛${niu}`, multiplier: 2 }
	if (niu > 0) return { level: 10 + niu, tie: [niu], name: `牛${niu}`, multiplier: 1 }
	return { level: 0, tie: [0], name: '无牛', multiplier: 1 }
}

// 三公：大三公100 > 小三公80 > 混三公60 > 点数牌(9点/8点×2，其余×1)
function evaluateSanGong(cs) {
	const ranks = cs.map((c) => c.rank)
	const faces = ranks.filter((r) => r >= 11).length // J/Q/K
	const isThreeFace = faces === 3
	const sameRank = ranks.every((r) => r === ranks[0])
	if (isThreeFace && sameRank) return { level: 100, tie: [ranks[0]], name: '大三公', multiplier: 5 }
	if (isThreeFace && faces === 3 && !sameRank) return { level: 60, tie: ranks, name: '混三公', multiplier: 3 }
	const points = ranks.reduce((a, r) => a + (r >= 11 ? 0 : r === 1 ? 1 : r), 0) % 10
	if (points === 9) return { level: 90, tie: [9], name: '九点', multiplier: 2 }
	if (points === 8) return { level: 80, tie: [8], name: '八点', multiplier: 2 }
	return { level: points, tie: [points], name: `${points}点`, multiplier: 1 }
}

/* ============================================================
 * 房间（wallet_service /api/rooms/* 行为）
 * ============================================================ */

const rooms = new Map() // room_id -> room record

function newRoomRecord(req, createdBy) {
	const base = Number(req.base_score ?? 100)
	const room = {
		room_id: rnd6(),
		room_name: req.room_name ?? '未命名房间',
		game_type: req.game_type,
		mode: req.mode ?? 'cash',
		total_rounds: Number(req.total_rounds ?? 10),
		base_score: base,
		platform_fee_rate: Number(req.platform_fee_rate ?? PLATFORM_FEE_RATE),
		agent_commission_rate: Number(req.agent_commission_rate ?? AGENT_COMMISSION_RATE),
		min_players: Number(req.min_players ?? 2),
		max_players: Number(req.max_players ?? 6),
		big_blind: Number(req.big_blind ?? base),
		rake_cap_multiplier: Number(req.rake_cap_multiplier ?? RAKE_CAP_MULTIPLIER),
		status: 'waiting',
		current_round: 0,
		created_by: createdBy,
		room_type: (req.room_password ?? '').length > 0 ? req.room_type ?? 'private' : 'public',
		room_password: req.room_password ?? '',
		created_at: now(),
		updated_at: now()
	}
	// 引擎侧状态
	room.engine = {
		seats: [],
		deck: [],
		phase: 'WAITING',
		betting_round_count: 0,
		total_pot: 0,
		current_highest_bet: 0,
		min_call_amount: base,
		side_pots: [],
		community_cards: [],
		banker_seat_index: null,
		current_turn_seat_index: null,
		turn_deadline: null,
		botSeats: new Set(),
		subscribers: new Map(),
		event_log: [],
		last_results: null,
		nextHandAt: 0,
		action_count: 0
	}
	for (let i = 0; i < room.max_players; i++) room.engine.seats.push(emptySeat(i))
	rooms.set(room.room_id, room)
	return room
}

function emptySeat(i) {
	return {
		seat_index: i,
		user_id: null,
		chips: 0,
		current_bet: 0,
		invested: 0,
		status: 'empty',
		cards: [],
		is_banker: false,
		banker_multiplier: 0,
		bet_multiplier: 1,
		has_acted: false,
		has_viewed_cards: false,
		is_disconnected: false
	}
}

const seatOf = (room, userId) => room.engine.seats.find((s) => s.user_id === userId) ?? null

function seatPlayer(room, userId, buyIn, isBot = false) {
	const seat = room.engine.seats.find((s) => s.status === 'empty')
	if (seat == null) return null
	seat.user_id = userId
	if (isBot) {
		// 机器人绕过钱包（真实引擎如此），筹码直接用请求值
		seat.chips = buyIn > 0 ? buyIn : 5000
	} else {
		const w = getOrCreateWallet(userId, 'player')
		seat.chips = buyIn > 0 ? Math.min(buyIn, w.balance) : w.balance
	}
	seat.status = 'ready'
	seat.cards = []
	seat.current_bet = 0
	seat.invested = 0
	seat.has_acted = false
	seat.has_viewed_cards = false
	return seat
}

function roomItem(room) {
	return {
		room_id: room.room_id,
		room_name: room.room_name,
		game_type: room.game_type,
		mode: room.mode,
		total_rounds: room.total_rounds,
		base_score: room.base_score,
		platform_fee_rate: room.platform_fee_rate,
		min_players: room.min_players,
		max_players: room.max_players,
		status: room.status,
		current_round: room.current_round,
		created_by: room.created_by,
		room_type: room.room_type,
		created_at: room.created_at
	}
}

function roomDetail(room) {
	return {
		...roomItem(room),
		room_password: room.room_password,
		agent_commission_rate: room.agent_commission_rate,
		big_blind: room.big_blind,
		rake_cap_multiplier: room.rake_cap_multiplier,
		updated_at: room.updated_at
	}
}

/* ============================================================
 * 引擎：对局流程（game-engine 行为）
 * ============================================================ */

const holeCount = (gt) => (gt === 'zha_jin_hua' || gt === 'san_gong' ? 3 : gt === 'niu_niu' ? 5 : 2)
const engineMode = (room) => {
	if (room.game_type === 'texas_holdem') return 'fixed'
	if (room.game_type === 'zha_jin_hua') return 'normal'
	return room.mode === 'qiang_zhuang' ? 'qiang_zhuang' : 'tong_bi'
}

const inHand = (room) => room.engine.seats.filter((s) => s.status === 'playing' || s.status === 'all_in')
const activeSeats = (room) => room.engine.seats.filter((s) => s.user_id != null && s.status !== 'empty')

function logEvent(room, type, payload) {
	room.engine.event_log.push({ seq: room.engine.event_log.length + 1, ts: now(), type, payload })
}

function transitionTo(room, next) {
	const prev = room.engine.phase
	room.engine.phase = next
	if (prev !== next) {
		logEvent(room, 'phase', { prev, next })
		notify(room, 'phase_changed', { prev_phase: prev, new_phase: next })
	}
}

function startRound(room) {
	const players = activeSeats(room).filter((s) => s.status === 'ready' || s.status === 'playing')
	if (players.length < room.min_players) {
		room.engine.phase = 'WAITING'
		broadcast(room)
		return
	}
	const e = room.engine
	e.deck = makeDeck()
	e.community_cards = []
	e.total_pot = 0
	e.current_highest_bet = 0
	e.min_call_amount = room.base_score
	e.betting_round_count = 0
	e.current_turn_seat_index = null
	e.turn_deadline = null
	e.side_pots = []
	e.last_results = null
	e.event_log = []
	e.action_count = 0
	e.banker_seat_index = null
	room.current_round += 1
	room.status = 'playing'
	logEvent(room, 'round_start', { base_score: room.base_score, players: players.length })

	const n = holeCount(room.game_type)
	for (const s of players) {
		s.cards = []
		s.current_bet = 0
		s.invested = 0
		s.has_acted = false
		s.has_viewed_cards = false
		s.status = 'playing'
		s.hand_result = undefined
		for (let i = 0; i < n; i++) s.cards.push(e.deck.pop())
	}
	logEvent(room, 'cards_dealt', { players: players.map((s) => ({ seat_index: s.seat_index, count: n })) })

	transitionTo(room, 'DEALING')

	if (room.game_type === 'texas_holdem') {
		const bb = room.big_blind
		const sb = Math.max(1, Math.floor(room.base_score / 2))
		const p = players
		betChips(room, p[0], sb)
		betChips(room, p[1], bb)
		e.current_highest_bet = bb
		e.min_call_amount = bb
		e.betting_round_count = 1
		logEvent(room, 'blind', { user_id: p[0].user_id, blind: 'sb', amount: sb })
		logEvent(room, 'blind', { user_id: p[1].user_id, blind: 'bb', amount: bb })
		transitionTo(room, 'BETTING')
		e.current_turn_seat_index = p.length > 2 ? p[2].seat_index : p[0].seat_index
	} else {
		// 炸金花：全员扣底注；牛牛/三公：发牌后进入抢庄或下注
		const ante = room.base_score
		for (const s of players) betChips(room, s, ante)
		e.current_highest_bet = ante
		e.min_call_amount = ante
		e.betting_round_count = 1
		transitionTo(room, 'BETTING')
		e.current_turn_seat_index = players[0].seat_index
	}

	maybeStartTurnTimer(room)
	broadcast(room)
}

function betChips(room, seat, amount) {
	const real = Math.min(amount, seat.chips)
	seat.chips -= real
	seat.current_bet += real
	seat.invested += real
	room.engine.total_pot += real
	if (seat.chips <= 0) seat.status = 'all_in'
}

function rotateTurn(room) {
	const e = room.engine
	const order = e.seats.filter((s) => s.status === 'playing').sort((a, b) => a.seat_index - b.seat_index)
	if (order.length === 0) {
		e.current_turn_seat_index = null
		return
	}
	const after = order.filter((s) => s.seat_index > (e.current_turn_seat_index ?? -1))
	e.current_turn_seat_index = (after[0] ?? order[0]).seat_index
}

function isPhaseComplete(room) {
	const e = room.engine
	const alive = e.seats.filter((s) => s.status === 'playing')
	if (alive.length <= 1) return true
	if (e.phase === 'BETTING') {
		if (room.game_type === 'texas_holdem') {
			return alive.every((s) => s.has_acted && s.current_bet === e.current_highest_bet)
		}
		if (room.game_type === 'zha_jin_hua') {
			return alive.every((s) => s.has_acted) && alive.every((s) => s.current_bet === alive[0].current_bet)
		}
		return alive.every((s) => s.has_acted)
	}
	return true
}

function dealCommunity(room) {
	const e = room.engine
	const street = e.betting_round_count
	e.deck.pop() // 烧牌
	if (street === 1) {
		e.community_cards.push(e.deck.pop(), e.deck.pop(), e.deck.pop())
		logEvent(room, 'community', { street: 'flop', cards: e.community_cards.map((c) => c.code) })
	} else {
		e.community_cards.push(e.deck.pop())
		logEvent(room, 'community', { street: street === 2 ? 'turn' : 'river', cards: [e.community_cards[e.community_cards.length - 1].code] })
	}
}

function getNextPhase(room) {
	const e = room.engine
	const alive = e.seats.filter((s) => s.status === 'playing')
	if (alive.length <= 1) return 'SHOWDOWN'
	if (room.game_type === 'texas_holdem') {
		if (e.betting_round_count < 4) {
			e.betting_round_count += 1
			dealCommunity(room)
			for (const s of inHand(room)) s.has_acted = false
			e.current_turn_seat_index = alive[0].seat_index
			return 'BETTING'
		}
		return 'SHOWDOWN'
	}
	if (room.game_type === 'zha_jin_hua' && e.betting_round_count < 3) {
		e.betting_round_count += 1
		for (const s of inHand(room)) s.has_acted = false
		e.current_turn_seat_index = alive[0].seat_index
		return 'BETTING'
	}
	return 'SHOWDOWN'
}

function handleAction(room, userId, action) {
	const e = room.engine
	const seat = seatOf(room, userId)
	if (seat == null) return { success: false, error: 'Player not seated.' }
	if (e.current_turn_seat_index !== seat.seat_index) return { success: false, error: 'Not your turn.' }
	const type = action.action_type
	e.action_count += 1

	if (type === 'fold') {
		seat.status = 'folded'
		seat.has_acted = true
		logEvent(room, 'action', { user_id: userId, action_type: 'fold', amount: null, multiplier: null, success: true })
	} else if (type === 'check') {
		if (seat.current_bet < e.current_highest_bet) return { success: false, error: 'Cannot check when there is an active bet to call.' }
		seat.has_acted = true
		logEvent(room, 'action', { user_id: userId, action_type: 'check', amount: null, multiplier: null, success: true })
	} else if (type === 'call') {
		betChips(room, seat, Math.max(0, e.current_highest_bet - seat.current_bet))
		seat.has_acted = true
		logEvent(room, 'action', { user_id: userId, action_type: 'call', amount: null, multiplier: null, success: true })
	} else if (type === 'raise' || type === 'bet') {
		const amt = Number(action.amount ?? 0)
		let target
		if (amt > e.current_highest_bet) target = amt
		else if (amt > 0) target = e.current_highest_bet + amt
		else target = e.current_highest_bet + room.base_score
		betChips(room, seat, target - seat.current_bet)
		e.current_highest_bet = Math.max(e.current_highest_bet, target)
		for (const s of inHand(room)) if (s.seat_index !== seat.seat_index) s.has_acted = false
		seat.has_acted = true
		logEvent(room, 'action', { user_id: userId, action_type: type, amount: target, multiplier: null, success: true })
	} else if (type === 'all_in') {
		const total = seat.current_bet + seat.chips
		betChips(room, seat, seat.chips)
		e.current_highest_bet = Math.max(e.current_highest_bet, total)
		for (const s of inHand(room)) if (s.seat_index !== seat.seat_index) s.has_acted = false
		seat.has_acted = true
		logEvent(room, 'action', { user_id: userId, action_type: 'all_in', amount: total, multiplier: null, success: true })
	} else if (type === 'view_cards') {
		seat.has_viewed_cards = true
		seat.has_acted = true
		logEvent(room, 'action', { user_id: userId, action_type: 'view_cards', amount: null, multiplier: null, success: true })
	} else if (type === 'compare') {
		// 炸金花比牌：第二轮起可用
		if (room.game_type !== 'zha_jin_hua') return { success: false, error: 'compare not supported.' }
		if (e.betting_round_count < 2) return { success: false, error: '比牌必须从第二轮下注开始' }
		const target = seatOf(room, action.target_user_id)
		if (target == null || target.status !== 'playing') return { success: false, error: 'Invalid compare target.' }
		const a = evaluateZjh(seat.cards)
		const b = evaluateZjh(target.cards)
		const loser = cmp(a, b) > 0 ? target : seat
		loser.status = 'folded'
		loser.has_acted = true
		seat.has_acted = true
		logEvent(room, 'action', { user_id: userId, action_type: 'compare', amount: null, multiplier: null, success: true })
	} else if (type === 'qiang_zhuang') {
		seat.banker_multiplier = Number(action.multiplier ?? 0)
		seat.has_acted = true
	} else if (type === 'ready') {
		seat.status = 'ready'
		return { success: true }
	} else if (type === 'showdown') {
		seat.has_viewed_cards = true
		seat.has_acted = true
	} else {
		return { success: false, error: `Unknown action_type: ${type}` }
	}

	// 比牌/加注后推进
	if (room.game_type === 'zha_jin_hua' && type === 'compare') {
		// 比牌不 rotateTurn，直接判定本轮
	}

	if (isPhaseComplete(room) || e.action_count > 80) {
		if (e.action_count > 80 && room.game_type === 'texas_holdem') {
			while (e.community_cards.length < 5) e.deck.pop(), e.community_cards.push(e.deck.pop())
		}
		const next = getNextPhase(room)
		if (next === 'SHOWDOWN') {
			transitionTo(room, 'SHOWDOWN')
			doShowdown(room)
			return { success: true }
		}
		transitionTo(room, next)
	} else {
		rotateTurn(room)
	}
	maybeStartTurnTimer(room)
	broadcast(room)
	return { success: true }
}

function doShowdown(room) {
	const e = room.engine
	const alive = e.seats.filter((s) => s.status === 'playing' || s.status === 'all_in')
	const pot = e.total_pot

	// 边池（德州）
	let pots = [{ amount: pot, eligible: alive.map((s) => s.user_id) }]
	if (room.game_type === 'texas_holdem') {
		const levels = [...new Set(alive.filter((s) => s.invested > 0).map((s) => s.invested))].sort((a, b) => a - b)
		pots = []
		let prev = 0
		for (const lv of levels) {
			const contributors = alive.filter((s) => s.invested >= lv)
			const amt = (lv - prev) * contributors.length
			pots.push({ amount: amt, eligible: contributors.map((s) => s.user_id) })
			prev = lv
		}
		if (pots.length === 0) pots = [{ amount: pot, eligible: alive.map((s) => s.user_id) }]
	}

	const evalOf = (s) => {
		if (room.game_type === 'texas_holdem') {
			const r = evaluateTexas([...s.cards, ...e.community_cards])
			return { level: r.level, tie: r.tie, name: TX_NAMES[r.level] ?? '高牌' }
		}
		if (room.game_type === 'zha_jin_hua') return evaluateZjh(s.cards)
		if (room.game_type === 'niu_niu') return evaluateNiuNiu(s.cards)
		return evaluateSanGong(s.cards)
	}

	const wins = new Map(alive.map((s) => [s.user_id, 0]))
	for (const pot of pots) {
		const elig = alive.filter((s) => pot.eligible.includes(s.user_id))
		if (elig.length === 0) continue
		let best = null
		let winners = []
		for (const s of elig) {
			const r = evalOf(s)
			s.hand_result = { rank_name: r.name, rank_level: r.level, score: 0, multiplier: r.multiplier ?? 1, best_cards: s.cards }
			if (best == null || cmp(r, best) > 0) {
				best = r
				winners = [s]
			} else if (cmp(r, best) === 0) winners.push(s)
		}
		const share = Math.floor(pot.amount / winners.length)
		let rest = pot.amount - share * winners.length
		for (const w of winners) {
			const extra = rest > 0 ? 1 : 0
			rest -= extra
			wins.set(w.user_id, wins.get(w.user_id) + share + extra)
			w.chips += share + extra
		}
	}

	const results = alive.map((s) => ({
		user_id: s.user_id,
		net_amount: (wins.get(s.user_id) ?? 0) - s.invested,
		bet_total: s.invested,
		gross_win: wins.get(s.user_id) ?? 0,
		hand_name: s.hand_result?.rank_name ?? '高牌'
	}))
	e.last_results = results
	logEvent(room, 'showdown', { results: results.map((r) => ({ user_id: r.user_id, hand_name: r.hand_name, net_amount: r.net_amount })) })

	transitionTo(room, 'SETTLING')
	settleRound(room)
}

function settleRound(room) {
	const e = room.engine
	const results = e.last_results ?? []
	const winners = results.filter((r) => r.net_amount > 0).map((r) => r.user_id)
	const totalPot = e.total_pot

	// 结算入账（wallet_service process_game_settle 简化：无抽水时全额派发）
	for (const r of results) {
		const w = getOrCreateWallet(r.user_id, 'player')
		w.balance = Math.max(0, w.balance + r.net_amount)
		w.updated_at = now()
		addTx({
			transaction_id: nid('settle'),
			from_wallet_id: walletIdOf('room', roomUserId(room.room_id)),
			to_wallet_id: w.wallet_id ?? walletIdOf('player', r.user_id),
			amount: Math.abs(r.net_amount),
			fee: 0,
			type: 'game_settle',
			remark: r.hand_name
		})
	}
	logEvent(room, 'settle', { total_pot: totalPot, winners, side_pots: e.side_pots })
	e.total_pot = 0
	e.side_pots = []
	room.current_round = room.current_round
	room.updated_at = now()

	finishSettlement(room)
}

function finishSettlement(room) {
	const e = room.engine
	transitionTo(room, 'FINISHED')
	e.phase = 'WAITING'
	room.status = 'waiting'
	e.current_turn_seat_index = null
	e.turn_deadline = null
	e.nextHandAt = now() + NEXT_HAND_DELAY_MS

	notify(room, 'round_result', {
		results: e.last_results ?? [],
		event_log: {
			room_id: room.room_id,
			game_type: room.game_type,
			round_no: room.current_round,
			events: e.event_log,
			total: e.event_log.length
		}
	})

	for (const s of e.seats) {
		if (s.user_id != null) {
			s.status = 'ready'
			s.cards = []
			s.current_bet = 0
			s.invested = 0
			s.has_acted = false
			s.has_viewed_cards = false
		}
	}
	e.community_cards = []
	e.betting_round_count = 0
	broadcast(room)
}

function maybeStartTurnTimer(room) {
	const e = room.engine
	if (e.phase !== 'BETTING' || e.current_turn_seat_index == null) return
	const seat = e.seats[e.current_turn_seat_index]
	if (seat == null || seat.status !== 'playing') return
	e.turn_deadline = now() + TURN_TIMEOUT_MS
	notify(room, 'turn_timer', {
		event: 'start',
		seat_index: seat.seat_index,
		user_id: seat.user_id,
		deadline_ms: e.turn_deadline,
		timeout_ms: TURN_TIMEOUT_MS
	})
}

/* ============================================================
 * WS 消息构造与广播（game-engine 字段精确对齐）
 * ============================================================ */

function gameRoomOf(room) {
	return {
		room_id: room.room_id,
		game_type: room.game_type,
		mode: engineMode(room),
		base_score: room.base_score,
		max_seats: room.max_players,
		min_players_to_start: room.min_players,
		platform_fee_rate: room.platform_fee_rate,
		agent_commission_rate: room.agent_commission_rate,
		agent_ids: ['agt_room_03', 'agt_sub_02', 'agt_top_01'],
		status: room.status,
		current_round_id: null,
		created_at: room.created_at,
		updated_at: room.updated_at
	}
}

function snapshot(room, viewerId) {
	const e = room.engine
	const seats = e.seats.map((s) => ({
		seat_index: s.seat_index,
		user_id: s.user_id,
		chips: s.chips,
		current_bet: s.current_bet,
		status: s.status,
		cards: viewerId === '' ? [] : s.cards,
		is_banker: s.is_banker,
		banker_multiplier: s.banker_multiplier,
		bet_multiplier: s.bet_multiplier,
		has_acted: s.has_acted,
		has_viewed_cards: s.has_viewed_cards,
		is_disconnected: s.is_disconnected,
		hand_result: s.hand_result
	}))
	const turnSeat = e.current_turn_seat_index != null ? e.seats[e.current_turn_seat_index] : null
	return {
		room: gameRoomOf(room),
		round_state: {
			room: gameRoomOf(room),
			seats,
			deck: viewerId === '' ? [] : e.deck,
			community_cards: e.community_cards,
			phase: e.phase,
			banker_seat_index: e.banker_seat_index,
			current_turn_seat_index: e.current_turn_seat_index,
			total_pot: e.total_pot,
			current_highest_bet: e.current_highest_bet,
			min_call_amount: e.min_call_amount,
			betting_round_count: e.betting_round_count,
			side_pots: e.side_pots
		},
		seats,
		turn_timer:
			turnSeat != null && e.turn_deadline != null
				? {
						seat_index: turnSeat.seat_index,
						user_id: turnSeat.user_id,
						deadline_ms: e.turn_deadline,
						remaining_ms: Math.max(0, e.turn_deadline - now())
					}
				: { seat_index: null, user_id: null, deadline_ms: null, remaining_ms: null }
	}
}

function notify(room, type, data) {
	const payload = { type, data, room_id: room.room_id, timestamp: now() }
	room.engine.subscribers.forEach((_sub, ws) => sendWs(ws, payload))
}

function broadcast(room) {
	room.engine.subscribers.forEach((sub, ws) => {
		sendWs(ws, { type: 'game_state', room_id: room.room_id, data: snapshot(room, sub.asSpectator ? '' : sub.userId), timestamp: now() })
	})
}

/* ============================================================
 * 最小 WebSocket 服务端（文本帧）
 * ============================================================ */

const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'
const wsAccept = (key) => crypto.createHash('sha1').update(key + WS_GUID).digest('base64')

function encodeFrame(payload) {
	const len = payload.length
	let header
	if (len < 126) header = Buffer.from([0x81, len])
	else if (len < 65536) {
		header = Buffer.alloc(4)
		header[0] = 0x81
		header[1] = 126
		header.writeUInt16BE(len, 2)
	} else {
		header = Buffer.alloc(10)
		header[0] = 0x81
		header[1] = 127
		header.writeBigUInt64BE(BigInt(len), 2)
	}
	return Buffer.concat([header, payload])
}

function sendWs(ws, obj) {
	try {
		ws.write(encodeFrame(Buffer.from(JSON.stringify(obj), 'utf8')))
	} catch {
		/* ignore */
	}
}

function decodeFrame(buf) {
	if (buf.length < 2) return null
	const opcode = buf[0] & 0x0f
	const masked = (buf[1] & 0x80) !== 0
	let len = buf[1] & 0x7f
	let offset = 2
	if (len === 126) {
		if (buf.length < 4) return null
		len = buf.readUInt16BE(2)
		offset = 4
	} else if (len === 127) {
		if (buf.length < 10) return null
		len = Number(buf.readBigUInt64BE(2))
		offset = 10
	}
	let mask = null
	if (masked) {
		if (buf.length < offset + 4) return null
		mask = buf.subarray(offset, offset + 4)
		offset += 4
	}
	if (buf.length < offset + len) return null
	const payload = Buffer.from(buf.subarray(offset, offset + len))
	if (mask != null) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4]
	return { opcode, payload, total: offset + len }
}

function attachWs(server) {
	server.on('upgrade', (req, socket) => {
		const key = req.headers['sec-websocket-key']
		if (key == null) return socket.destroy()
		socket.write(
			'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n' +
				`Sec-WebSocket-Accept: ${wsAccept(key)}\r\n\r\n`
		)
		const ctx = { userId: null, roomId: null, asSpectator: false, buffer: Buffer.alloc(0) }
		socket.on('data', (chunk) => {
			ctx.buffer = Buffer.concat([ctx.buffer, chunk])
			let f
			while ((f = decodeFrame(ctx.buffer)) != null) {
				ctx.buffer = ctx.buffer.subarray(f.total)
				if (f.opcode === 0x8) return socket.end()
				if (f.opcode === 0x9) {
					socket.write(Buffer.from([0x8a, 0x00]))
					continue
				}
				if (f.opcode !== 0x1) continue
				let msg
				try {
					msg = JSON.parse(f.payload.toString('utf8'))
				} catch {
					continue
				}
				handleWs(socket, ctx, msg)
			}
		})
		socket.on('close', () => onWsClose(socket, ctx))
		socket.on('error', () => onWsClose(socket, ctx))
	})
}

function onWsClose(socket, ctx) {
	if (ctx.roomId != null) {
		const room = rooms.get(ctx.roomId)
		if (room != null) {
			room.engine.subscribers.delete(socket)
			const seat = seatOf(room, ctx.userId)
			if (seat != null && seat.status !== 'empty') {
				seat.is_disconnected = true
				logEvent(room, 'disconnect', { user_id: ctx.userId })
				notify(room, 'player_status', { user_id: ctx.userId, status: 'disconnected' })
			}
			broadcast(room)
		}
	}
}

function handleWs(socket, ctx, msg) {
	if (msg.type === 'ping') {
		sendWs(socket, { type: 'pong', timestamp: now() })
		return
	}
	if (msg.type === 'join_room') {
		const room = rooms.get(String(msg.room_id))
		ctx.userId = String(msg.user_id ?? '')
		ctx.roomId = String(msg.room_id)
		ctx.asSpectator = msg.as_spectator === true
		if (room == null) {
			sendWs(socket, { type: 'error', code: 404, message: 'Room not found', timestamp: now() })
			return
		}
		room.engine.subscribers.set(socket, { userId: ctx.userId, asSpectator: ctx.asSpectator })
		const seat = seatOf(room, ctx.userId)
		if (seat != null && !ctx.asSpectator) {
			seat.is_disconnected = false
			logEvent(room, 'reconnect', { user_id: ctx.userId })
		}
		sendWs(socket, { type: 'joined', room_id: room.room_id, as_spectator: ctx.asSpectator, timestamp: now() })
		sendWs(socket, { type: 'game_state', room_id: room.room_id, data: snapshot(room, ctx.asSpectator ? '' : ctx.userId), timestamp: now() })
		if (seat != null && !ctx.asSpectator) notify(room, 'player_status', { user_id: ctx.userId, status: 'reconnected' })
		broadcast(room)
		console.log(`[ws] ${ctx.userId} join ${room.room_id} spectator=${ctx.asSpectator}`)
		return
	}
	if (msg.type === 'leave_room') {
		if (ctx.roomId != null) {
			const room = rooms.get(ctx.roomId)
			if (room != null) room.engine.subscribers.delete(socket)
		}
		ctx.roomId = null
		return
	}
	if (msg.type === 'player_action') {
		const reqId = msg.req_id
		if (ctx.asSpectator) {
			sendWs(socket, { type: 'action_ack', req_id: reqId, success: false, message: 'Spectators cannot perform actions', timestamp: now() })
			return
		}
		const room = ctx.roomId != null ? rooms.get(ctx.roomId) : null
		if (room == null) {
			sendWs(socket, { type: 'action_ack', req_id: reqId, code: 400, message: 'Not joined any room' })
			return
		}
		const action = msg.action ?? {}
		const userId = String(msg.user_id ?? action.user_id ?? '')
		if (action.action_type === 'ready') {
			const seat = seatOf(room, userId)
			if (seat != null) seat.status = 'ready'
			sendWs(socket, { type: 'action_ack', req_id: reqId, room_id: room.room_id, code: 0, message: 'OK', timestamp: now() })
			// [补全] 真实引擎无开局入口，这里在足够玩家 ready 时自动开局
			const readyCount = activeSeats(room).filter((s) => s.status === 'ready').length
			if (room.engine.phase === 'WAITING' && readyCount >= room.min_players) startRound(room)
			else broadcast(room)
			return
		}
		const r = handleAction(room, userId, action)
		sendWs(socket, {
			type: 'action_ack',
			req_id: reqId,
			room_id: room.room_id,
			code: r.success ? 0 : 400,
			message: r.success ? 'OK' : r.error,
			timestamp: now()
		})
		if (r.success) notify(room, 'action_broadcast', { action: { action_type: action.action_type, user_id: userId, amount: action.amount ?? null } })
		return
	}
}

/* ============================================================
 * 定时器
 * ============================================================ */

setInterval(() => {
	for (const room of rooms.values()) {
		const e = room.engine
		// 自动开下一局
		if (e.phase === 'WAITING' && e.nextHandAt > 0 && now() >= e.nextHandAt) {
			e.nextHandAt = 0
			if (activeSeats(room).filter((s) => s.status === 'ready').length >= room.min_players) startRound(room)
			continue
		}
		if (e.phase !== 'BETTING' || e.current_turn_seat_index == null) continue
		const seat = e.seats[e.current_turn_seat_index]
		if (seat == null || seat.status !== 'playing') continue

		notify(room, 'turn_timer', { event: 'tick', seat_index: seat.seat_index, remaining_ms: Math.max(0, e.turn_deadline - now()) })

		// 超时：能过牌则过牌，否则弃牌
		if (now() >= e.turn_deadline) {
			const canCheck = seat.current_bet >= e.current_highest_bet
			handleAction(room, seat.user_id, { action_type: canCheck ? 'check' : 'fold', user_id: seat.user_id })
			notify(room, 'auto_fold', { folded: [{ userId: seat.user_id, seatIndex: seat.seat_index }] })
			continue
		}
		// 机器人
		if (e.botSeats.has(seat.seat_index) && e.turn_deadline - now() < TURN_TIMEOUT_MS - BOT_THINK_MS) {
			const canCheck = seat.current_bet >= e.current_highest_bet
			const r = Math.random()
			if (r < 0.08) handleAction(room, seat.user_id, { action_type: 'fold', user_id: seat.user_id })
			else if (r < 0.16 && e.current_highest_bet <= room.base_score * 2) handleAction(room, seat.user_id, { action_type: 'raise', amount: e.current_highest_bet + room.base_score, user_id: seat.user_id })
			else handleAction(room, seat.user_id, { action_type: canCheck ? 'check' : 'call', user_id: seat.user_id })
		}
	}
}, TURN_TICK_MS)

setInterval(() => {
	for (const room of rooms.values()) if (room.engine.subscribers.size > 0) broadcast(room)
}, SYNC_INTERVAL_MS)

/* ============================================================
 * HTTP 路由
 * ============================================================ */

function authOf(req) {
	const h = req.headers['authorization'] ?? ''
	const token = h.replace(/^Bearer\s+/i, '')
	if (!token) return { err: envelope(401, 'Missing token') }
	const payload = verifyToken(token)
	if (payload == null) return { err: envelope(401, 'Invalid or expired token') }
	return { userId: payload.sub, role: payload.role }
}

function requireRole(me, roles) {
	if (!roles.includes(me.role)) return envelope(403, 'Forbidden: Insufficient privileges')
	return null
}

const server = http.createServer(async (req, res) => {
	const url = new URL(req.url, `http://localhost:${HTTP_PORT}`)
	const path = url.pathname
	const method = req.method ?? 'GET'

	if (method === 'OPTIONS') return sendJson(res, 204, {})

	if (path === '/health') return sendJson(res, 200, envelope(0, 'OK', { status: 'healthy' }))
	if (path === '/') return sendJson(res, 200, envelope(0, 'V-POKER BFF Service is running', { service: 'v-poker-bff', version: '1.0.0', status: 'healthy', timestamp: now() }))

	// ---- 登录限流（60s 内 5 次，第 6 次 429）----
	if (path === '/api/auth/login' && method === 'POST') {
		const ip = req.headers['x-forwarded-for'] ?? 'unknown'
		const rec = loginAttempts.get(ip)
		if (rec != null && rec.resetAt > now()) {
			if (rec.count >= LOGIN_MAX_ATTEMPTS) return sendJson(res, 429, envelope(429, 'Too many login attempts. Please try again later.'))
			rec.count++
		} else {
			loginAttempts.set(ip, { count: 1, resetAt: now() + LOGIN_WINDOW_MS })
		}
		const body = await readBody(req)
		const username = body.username
		const password = body.password
		if (!username || !password) return sendJson(res, 400, envelope(400, 'Username and password required'))
		const u = users.get(String(username))
		if (u == null || u.password !== String(password)) return sendJson(res, 401, envelope(401, 'Invalid username or password'))
		getOrCreateWallet(u.username, 'player')
		const token = signToken(u.username, u.role)
		console.log(`[http] login ${u.username} (${u.role})`)
		return sendJson(res, 200, envelope(0, 'Login successful', { access_token: token, token_type: 'Bearer', user: { user_id: u.username, role: u.role } }))
	}

	if (path === '/api/auth/register' && method === 'POST') {
		const body = await readBody(req)
		const username = body.username
		const password = body.password
		const role = String(body.role ?? 'player')
		if (!username || !password) return sendJson(res, 400, envelope(400, 'Username and password required'))
		if (users.has(String(username))) return sendJson(res, 409, envelope(409, 'Username already exists'))
		users.set(String(username), { username: String(username), password: String(password), role })
		getOrCreateWallet(String(username), 'player')
		return sendJson(res, 200, envelope(0, 'User registered successfully', { user_id: String(username), role }))
	}

	// ---- 其余 /api/* 需鉴权 ----
	const me = authOf(req)
	if (me.err != null) return sendJson(res, 401, me.err)

	// ================= 房间 =================
	if (path === '/api/rooms/create' && method === 'POST') {
		const err = requireRole(me, ['player', 'agent', 'admin'])
		if (err != null) return sendJson(res, 403, err)
		const body = await readBody(req)
		const gt = String(body.game_type ?? '')
		if (!['texas_holdem', 'zha_jin_hua', 'niu_niu', 'san_gong'].includes(gt)) {
			return sendJson(res, 400, envelope(400, `Invalid game_type. Must be one of: ['texas_holdem', 'zha_jin_hua', 'niu_niu', 'san_gong']`))
		}
		if (wallets.get(me.userId) == null) return sendJson(res, 404, envelope(404, `Creator wallet '${me.userId}' not found.`))
		body.created_by = me.userId // 服务端注入
		const room = newRoomRecord(body, me.userId)
		seatPlayer(room, me.userId, 0)
		console.log(`[http] create room ${room.room_id} by ${me.userId} (${gt})`)
		return sendJson(res, 200, envelope(0, 'Room created successfully', roomDetail(room)))
	}

	if (path === '/api/rooms/list' && method === 'GET') {
		const gt = url.searchParams.get('game_type') ?? ''
		const st = url.searchParams.get('status') ?? 'waiting'
		const list = [...rooms.values()]
			.filter((r) => r.room_type === 'public' && (st === '' || r.status === st) && (gt === '' || r.game_type === gt))
			.sort((a, b) => b.created_at - a.created_at)
			.slice(0, 50)
			.map(roomItem)
		return sendJson(res, 200, envelope(0, 'Success', list))
	}

	if (path === '/api/rooms/join' && method === 'POST') {
		const err = requireRole(me, ['player', 'agent', 'admin'])
		if (err != null) return sendJson(res, 403, err)
		const body = await readBody(req)
		const room = rooms.get(String(body.room_id ?? ''))
		if (room == null) return sendJson(res, 404, envelope(404, `Room '${body.room_id}' not found.`))
		if (room.room_type === 'private' || room.room_password.length > 0) {
			if (String(body.room_password ?? '') !== room.room_password) return sendJson(res, 403, envelope(403, 'Invalid room password.'))
		}
		if (wallets.get(me.userId) == null) return sendJson(res, 404, envelope(404, `Player wallet '${me.userId}' not found.`))
		if (seatOf(room, me.userId) == null) {
			const seat = seatPlayer(room, me.userId, 0)
			if (seat == null) return sendJson(res, 409, envelope(409, 'Room is full'))
		}
		console.log(`[http] join room ${room.room_id} by ${me.userId}`)
		return sendJson(res, 200, envelope(0, 'Joined room successfully', roomDetail(room)))
	}

	const botM = path.match(/^\/api\/rooms\/([^/]+)\/bots$/)
	if (botM != null && method === 'POST') {
		const err = requireRole(me, ['player', 'agent', 'admin'])
		if (err != null) return sendJson(res, 403, err)
		const room = rooms.get(botM[1])
		if (room == null) return sendJson(res, 404, { code: 404, message: 'Room not found' })
		const body = await readBody(req)
		if (body.seat_index == null && body.count == null) return sendJson(res, 400, { code: 400, message: 'Need seat_index or count' })
		const strategy = String(body.strategy ?? 'loose')
		const chips = Number(body.chips ?? 5000)
		const bots = []
		const count = body.count != null ? Number(body.count) : 1
		for (let i = 0; i < count; i++) {
			const botId = `bot_${room.room_id}_${Math.random().toString(36).slice(2, 8)}`
			const seat = seatPlayer(room, botId, chips, true)
			if (seat == null) break
			room.engine.botSeats.add(seat.seat_index)
			bots.push(botId)
		}
		console.log(`[http] add ${bots.length} bots to ${room.room_id} (${strategy})`)
		broadcast(room)
		return sendJson(res, 200, envelope(0, `Added ${bots.length} bots`, { bots }))
	}

	const hhM = path.match(/^\/api\/rooms\/([^/]+)\/hand-history$/)
	if (hhM != null && method === 'GET') {
		const room = rooms.get(hhM[1])
		if (room == null) return sendJson(res, 404, { code: 404, message: 'Room not found' })
		return sendJson(res, 200, envelope(0, 'OK', {
			room_id: room.room_id,
			game_type: room.game_type,
			base_score: room.base_score,
			exported_at: new Date().toISOString(),
			events: room.engine.event_log,
			final_results: room.engine.last_results,
			total_pot: room.engine.total_pot,
			side_pots: room.engine.side_pots
		}))
	}

	const roomM = path.match(/^\/api\/rooms\/([^/]+)$/)
	if (roomM != null && method === 'GET') {
		const room = rooms.get(roomM[1])
		if (room == null) return sendJson(res, 404, envelope(404, `Room '${roomM[1]}' not found.`))
		return sendJson(res, 200, envelope(0, 'Success', roomDetail(room)))
	}

	// ================= 钱包（[补全] BFF 实际未挂载，按契约补上） =================
	const balM = path.match(/^\/api\/wallet\/balance\/([^/]+)$/)
	if (balM != null && method === 'GET') {
		const w = wallets.get(balM[1])
		if (w == null) return sendJson(res, 404, envelope(404, `User wallet '${balM[1]}' not found.`))
		return sendJson(res, 200, envelope(0, 'success', {
			user_id: w.user_id,
			wallet_id: walletIdOf(w.user_type, w.user_id),
			user_type: w.user_type,
			balance: w.balance,
			frozen_balance: w.frozen_balance,
			updated_at: w.updated_at
		}))
	}

	const txM = path.match(/^\/api\/wallet\/transactions\/([^/]+)$/)
	if (txM != null && method === 'GET') {
		let limit = Number(url.searchParams.get('limit') ?? 50)
		let offset = Number(url.searchParams.get('offset') ?? 0)
		if (!(limit >= 1)) limit = 50
		if (limit > 100) limit = 100
		if (!(offset >= 0)) offset = 0
		const w = wallets.get(txM[1])
		if (w == null) return sendJson(res, 200, envelope(0, 'No wallet found', []))
		const list = txsOfWallet(walletIdOf(w.user_type, w.user_id)).slice(offset, offset + limit)
		return sendJson(res, 200, envelope(0, 'success', list))
	}

	if (path === '/api/wallet/transfer' && method === 'POST') {
		const body = await readBody(req)
		const fromId = String(body.from_user_id ?? me.userId)
		const toId = String(body.to_user_id ?? '')
		const amount = Number(body.amount ?? 0)
		const txId = String(body.transaction_id ?? nid('tx_transfer'))
		if (fromId === toId) return sendJson(res, 400, envelope(400, 'Cannot transfer chips to self.'))
		if (txIndex.has(txId)) return sendJson(res, 400, envelope(400, `Duplicate transaction_id '${txId}'.`))
		const from = wallets.get(fromId)
		if (from == null) return sendJson(res, 404, envelope(404, `Sender wallet for '${fromId}' not found.`))
		const to = getOrCreateWallet(toId, 'player')
		const fee = decFloor(amount * 0.0001)
		const net = amount - fee
		if (from.balance < amount) return sendJson(res, 400, envelope(400, `Insufficient balance. Available: ${from.balance}, Requested: ${amount}`))
		from.balance -= amount
		from.updated_at = now()
		to.balance += net
		to.updated_at = now()
		feePoolBalance += fee
		addTx({ transaction_id: txId, from_wallet_id: walletIdOf(from.user_type, from.user_id), to_wallet_id: walletIdOf(to.user_type, to.user_id), amount: net, fee, type: 'transfer', remark: `${body.remark ?? ''} | Gross:${amount}, Fee:${fee}` })
		console.log(`[http] transfer ${amount} (fee ${fee}) ${fromId} -> ${toId}`)
		return sendJson(res, 200, envelope(0, 'Transfer successful', {
			transaction_id: txId, from_user_id: fromId, to_user_id: toId, gross_amount: amount, fee, net_amount: net,
			from_balance: from.balance, to_balance: to.balance, fee_pool_balance: feePoolBalance, created_at: now()
		}))
	}

	if (path === '/api/wallet/audit' && method === 'GET') {
		let player = 0, room = 0, agent = 0, admin = 0, support = 0
		for (const w of wallets.values()) {
			const v = w.balance + w.frozen_balance
			if (w.user_type === 'player') player += v
			else if (w.user_type === 'room') room += v
			else if (w.user_type === 'agent') agent += v
			else if (w.user_type === 'admin') admin += v
			else support += v
		}
		const sumAll = player + room + agent + admin + support
		const totalMinted = transactions.filter((t) => t.type === 'mint').reduce((a, t) => a + t.amount, 0)
		const totalAssets = sumAll + feePoolBalance
		const difference = totalAssets - totalMinted
		const passed = difference === 0
		return sendJson(res, 200, envelope(passed ? 0 : 5001, passed ? 'Energy conserved: System in balance.' : 'CRITICAL ALERT: Energy conservation violated!', {
			total_minted: totalMinted, sum_all_wallets: sumAll, sum_fee_pool: feePoolBalance, total_system_assets: totalAssets,
			difference, check_passed: passed, wallets_count: wallets.size,
			breakdown: { player_wallets: player, room_wallets: room, agent_wallets: agent, admin_wallets: admin, support_wallets: support, fee_pool: feePoolBalance },
			audit_time: new Date().toISOString()
		}))
	}

	if (path === '/api/wallet/mint' && method === 'POST') {
		const body = await readBody(req)
		const target = String(body.target_user_id ?? body.user_id ?? '')
		const amount = Number(body.amount ?? 0)
		const txId = String(body.transaction_id ?? nid('mint'))
		if (txIndex.has(txId)) return sendJson(res, 400, envelope(400, `Duplicate transaction_id '${txId}'. Idempotency violation.`))
		const w = getOrCreateWallet(target, 'player')
		w.balance += amount
		w.updated_at = now()
		addTx({ transaction_id: txId, from_wallet_id: null, to_wallet_id: walletIdOf(w.user_type, w.user_id), amount, fee: 0, type: 'mint', remark: `${body.remark ?? 'Admin Mint'} | Admin:${me.userId}` })
		return sendJson(res, 200, envelope(0, 'Mint successful', { transaction_id: txId, target_user_id: target, wallet_id: walletIdOf(w.user_type, w.user_id), amount, balance: w.balance, created_at: now() }))
	}

	if (path === '/api/wallet/leaderboard' && method === 'GET') {
		const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100)
		const list = [...wallets.values()].filter((w) => w.user_type === 'player' && w.balance > 0).sort((a, b) => b.balance - a.balance).slice(0, limit)
			.map((w, i) => ({ rank: i + 1, user_id: w.user_id, balance: w.balance }))
		return sendJson(res, 200, envelope(0, 'success', list))
	}

	// ================= 代理（BFF 聚合） =================
	if (path === '/api/agent/dashboard' && method === 'GET') {
		const err = requireRole(me, ['agent', 'admin'])
		if (err != null) return sendJson(res, 403, err)
		const agentId = url.searchParams.get('agent_id') ?? me.userId
		const w = getOrCreateWallet(agentId, 'player')
		const tree = agents.filter((a) => a.parent_id === agentId)
		return sendJson(res, 200, envelope(0, 'Success', {
			agent_id: agentId,
			wallet: { balance: w.balance, frozen_balance: w.frozen_balance },
			commission_tree: tree.map((a) => ({ agent_id: a.agent_id, parent_id: a.parent_id, level: a.level, r_ratio: a.r_ratio, commission_balance: a.commission_balance, status: a.status })),
			daily_rebate: 0,
			sub_players_count: 0
		}))
	}

	if (path === '/api/agent/children' && method === 'GET') {
		const err = requireRole(me, ['agent', 'admin'])
		if (err != null) return sendJson(res, 403, err)
		const parentId = url.searchParams.get('parent_id') ?? me.userId
		return sendJson(res, 200, envelope(0, 'Success', agents.filter((a) => a.parent_id === parentId)))
	}

	if (path === '/api/agent/settlements' && method === 'GET') {
		const err = requireRole(me, ['agent', 'admin'])
		if (err != null) return sendJson(res, 403, err)
		const w = getOrCreateWallet(me.userId, 'player')
		return sendJson(res, 200, envelope(0, 'Success', txsOfWallet(walletIdOf(w.user_type, w.user_id)).slice(0, 50)))
	}

	if (path === '/api/agent/commission' && method === 'GET') {
		const err = requireRole(me, ['agent', 'admin'])
		if (err != null) return sendJson(res, 403, err)
		const w = getOrCreateWallet(me.userId, 'player')
		const records = txsOfWallet(walletIdOf(w.user_type, w.user_id)).filter((t) => t.type === 'commission')
		return sendJson(res, 200, envelope(0, 'Success', { agent_id: me.userId, total_commission: records.reduce((a, t) => a + t.amount, 0), records }))
	}

	// ================= 管理 =================
	if (path === '/api/admin/overview' && method === 'GET') {
		const err = requireRole(me, ['admin'])
		if (err != null) return sendJson(res, 403, err)
		const audit = await fetchAudit()
		return sendJson(res, 200, envelope(0, 'Success', {
			audit: { total_minted: audit.total_minted, sum_all_wallets: audit.sum_all_wallets, check_passed: audit.check_passed },
			system_status: 'HEALTHY',
			active_tables: rooms.size,
			online_players: wallets.size
		}))
	}

	if (path === '/api/admin/audit' && method === 'GET') {
		const err = requireRole(me, ['admin'])
		if (err != null) return sendJson(res, 403, err)
		const audit = await fetchAudit()
		return sendJson(res, 200, envelope(audit.check_passed ? 0 : 5001, audit.check_passed ? 'Energy conserved: System in balance.' : 'CRITICAL ALERT: Energy conservation violated!', audit))
	}

	if (path === '/api/admin/mint' && method === 'POST') {
		const err = requireRole(me, ['admin'])
		if (err != null) return sendJson(res, 403, err)
		const body = await readBody(req)
		const target = String(body.user_id ?? body.target_user_id ?? '')
		const amount = Number(body.amount ?? 0)
		const txId = String(body.transaction_id ?? nid('mint'))
		if (txIndex.has(txId)) return sendJson(res, 400, envelope(400, `Duplicate transaction_id '${txId}'. Idempotency violation.`))
		const w = getOrCreateWallet(target, 'player')
		w.balance += amount
		w.updated_at = now()
		addTx({ transaction_id: txId, from_wallet_id: null, to_wallet_id: walletIdOf(w.user_type, w.user_id), amount, fee: 0, type: 'mint', remark: `${body.remark ?? '初始筹码'} | Admin:${me.userId}` })
		console.log(`[http] mint ${amount} -> ${target}`)
		return sendJson(res, 200, envelope(0, 'Mint successful', { transaction_id: txId, target_user_id: target, wallet_id: walletIdOf(w.user_type, w.user_id), amount, balance: w.balance, created_at: now() }))
	}

	if (path === '/api/admin/rooms' && method === 'GET') {
		const err = requireRole(me, ['admin'])
		if (err != null) return sendJson(res, 403, err)
		return sendJson(res, 200, envelope(0, 'Success', [...rooms.values()].map(roomItem)))
	}

	if (path === '/api/admin/transactions' && method === 'GET') {
		const err = requireRole(me, ['admin'])
		if (err != null) return sendJson(res, 403, err)
		const userId = url.searchParams.get('user_id')
		if (userId == null) return sendJson(res, 400, envelope(400, 'user_id query param required'))
		const w = wallets.get(userId)
		if (w == null) return sendJson(res, 200, envelope(0, 'success', []))
		return sendJson(res, 200, envelope(0, 'success', txsOfWallet(walletIdOf(w.user_type, w.user_id))))
	}

	sendJson(res, 404, envelope(404, `no route: ${method} ${path}`))
})

function fetchAudit() {
	let player = 0, room = 0, agent = 0, admin = 0, support = 0
	for (const w of wallets.values()) {
		const v = w.balance + w.frozen_balance
		if (w.user_type === 'player') player += v
		else if (w.user_type === 'room') room += v
		else if (w.user_type === 'agent') agent += v
		else if (w.user_type === 'admin') admin += v
		else support += v
	}
	const sumAll = player + room + agent + admin + support
	const totalMinted = transactions.filter((t) => t.type === 'mint').reduce((a, t) => a + t.amount, 0)
	const totalAssets = sumAll + feePoolBalance
	const difference = totalAssets - totalMinted
	return {
		total_minted: totalMinted, sum_all_wallets: sumAll, sum_fee_pool: feePoolBalance, total_system_assets: totalAssets,
		difference, check_passed: difference === 0, wallets_count: wallets.size,
		breakdown: { player_wallets: player, room_wallets: room, agent_wallets: agent, admin_wallets: admin, support_wallets: support, fee_pool: feePoolBalance },
		audit_time: new Date().toISOString()
	}
}

/* ============================================================
 * 启动
 * ============================================================ */

attachWs(server)
server.listen(HTTP_PORT, () => {
	console.log('')
	console.log('  V-POKER mock 后端已启动（BFF + wallet + commission + game-engine）')
	console.log(`  HTTP  http://localhost:${HTTP_PORT}`)
	console.log(`  WS    ws://localhost:${WS_PORT}/ws`)
	console.log('  种子账号（密码均为 test）：player_alice / player_bob / agent_root / admin_root / support_01')
	console.log('')
})

const wsServer = http.createServer((_req, res) => {
	res.writeHead(426)
	res.end('Upgrade Required')
})
attachWs(wsServer)
wsServer.listen(WS_PORT, () => console.log(`  WebSocket 监听中：ws://localhost:${WS_PORT}/ws\n`))

process.on('SIGINT', () => {
	console.log('\n[mock] 退出')
	process.exit(0)
})

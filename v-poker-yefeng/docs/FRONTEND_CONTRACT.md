# V-POKER 前端对接契约文档

> 版本：v1.0  
> 基于：`v-poker-yefeng` 远程仓库  
> 更新日期：2026-09-22  
> 适用范围：所有前端项目（client / admin-dashboard / agent-dashboard / support-dashboard）

---

## 目录

1. [全局约定](#一全局约定)
2. [认证与鉴权](#二认证与鉴权)
3. [HTTP API 接口总表](#三http-api-接口总表)
4. [WebSocket 协议](#四websocket-协议)
5. [资金闭环说明](#五资金闭环说明)
6. [错误码规范](#六错误码规范)
7. [前端实现约束](#七前端实现约束)

---

## 一、全局约定

### 数据格式

| 类型 | 存储方式 | 示例 |
|------|---------|------|
| 金额/筹码 | 整数（最小单位，无小数点） | `10000` 表示 1 万筹码 |
| 比例/费率 | 小数，保留 4 位 | `0.0300` = 3%，`0.0001` = 0.01% |
| 时间戳 | Unix 毫秒（bigint 等价） | `1726531200000` |
| 用户 ID | 字符串，避免 JS 精度丢失 | `"player_alice"` |
| 流水号 | 字符串，全局唯一 | `"bet_room888_p1_001"` |

### 统一响应格式

所有接口返回同一结构：

```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

- `code === 0` 表示成功
- `code !== 0` 表示失败，`message` 为错误描述
- `data` 可能为 `null`、对象或数组

### 基础地址

| 环境 | BFF | 游戏引擎 HTTP | 游戏引擎 WS |
|------|-----|--------------|------------|
| 开发 | `http://localhost:4000` | `http://localhost:8003` | `ws://localhost:8003/ws` |
| 生产 | `https://goodspage.cn` | `https://goodspage.cn`（nginx 反代） | `wss://goodspage.cn`（nginx 反代） |

---

## 二、认证与鉴权

### Token 机制

- **算法**：HS256（JWT）
- **有效期**：7 天
- **字段结构**：

```typescript
interface JWTClaim {
  sub: string;       // 用户 ID（如 "player_alice"）
  role: "admin" | "support" | "agent" | "player";
  iat: number;       // 签发时间（秒级时间戳）
  exp: number;       // 过期时间（秒级时间戳）
}
```

### 客户端存储

```typescript
// 玩家端（原生 fetch）
localStorage.setItem("poker_jwt_token", token);
// 三个 Dashboard（axios 拦截器）
const token = useAuthStore.getState().token; // Zustand 状态
```

### 请求头传递

```
Authorization: Bearer <token>
```

所有需要认证的接口均通过此 header 携带 Token，不携带或 Token 无效时返回 `401`，角色不符时返回 `403`。

### 登录限流

- 路径：`POST /api/auth/login`
- 规则：同一 IP 60 秒内最多 5 次，超限返回 `429`

### 角色权限矩阵

| 接口路径前缀 | 允许角色 |
|-------------|---------|
| `/api/auth/*` | 公开 |
| `/api/rooms/*` | player / agent / admin |
| `/api/agent/*` | agent / admin |
| `/api/support/*` | support / admin |
| `/api/admin/*` | admin |

### 测试账号

| 角色 | 用户名 | 密码 |
|------|--------|------|
| admin | `admin_root` | `test` |
| agent | `agent_root` | `test` |
| support | `support_01` | `test` |
| player | `player_alice` | `test` |
| player | `player_bob` | `test` |

---

## 三、HTTP API 接口总表

### 3.1 认证接口（公开）

#### POST /api/auth/login

用户登录，获取 JWT Token。

**请求体：**
```json
{
  "username": "player_alice",
  "password": "test"
}
```

**响应：**
```json
{
  "code": 0,
  "message": "Login successful",
  "data": {
    "access_token": "eyJhbG...",
    "token_type": "Bearer",
    "user": { "user_id": "player_alice", "role": "player" }
  }
}
```

#### POST /api/auth/register

用户注册。

**请求体：**
```json
{
  "username": "new_player",
  "password": "password123",
  "role": "player"
}
```

**响应：**
```json
{ "code": 0, "message": "User registered successfully", "data": { "user_id": "new_player", "role": "player" } }
```

---

### 3.2 玩家端房间接口（需 player/agent/admin）

#### GET /api/rooms/list

获取公开房间列表。

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `game_type` | string | 否 | 筛选：`texas_holdem` / `zha_jin_hua` / `niu_niu` / `san_gong` |
| `status` | string | 否 | 默认 `waiting` |

**响应：**
```json
{
  "code": 0,
  "data": [
    {
      "room_id": "389236",
      "room_name": "德州扑克房间",
      "game_type": "texas_holdem",
      "mode": "cash",
      "total_rounds": 10,
      "base_score": 100,
      "min_players": 2,
      "max_players": 6,
      "status": "waiting",
      "current_round": 0,
      "created_by": "player_alice",
      "room_type": "public",
      "created_at": 1726531200000
    }
  ]
}
```

#### POST /api/rooms/create

创建房间。**注意：`created_by` 由服务端从 JWT 注入，前端不要传。**

**请求体：**
```json
{
  "room_name": "德州扑克房间",
  "game_type": "texas_holdem",
  "mode": "cash",
  "total_rounds": 10,
  "base_score": 100,
  "platform_fee_rate": 0.0300,
  "agent_commission_rate": 0.0300,
  "min_players": 2,
  "max_players": 6,
  "big_blind": 100,
  "rake_cap_multiplier": 5,
  "room_password": ""
}
```

**响应：**
```json
{
  "code": 0,
  "data": {
    "room_id": "389236",
    "room_name": "德州扑克房间",
    "game_type": "texas_holdem",
    "status": "waiting",
    "current_round": 0,
    "room_password": "",
    "room_type": "public",
    ...
  }
}
```

#### POST /api/rooms/join

加入房间。**注意：`user_id` 由服务端从 JWT 注入，前端不要传。**

**请求体：**
```json
{
  "room_id": "389236",
  "room_password": ""
}
```

**错误响应（私有房密码错误）：**
```json
{ "code": 403, "message": "Invalid room password.", "data": null }
```

#### GET /api/rooms/:room_id

获取房间详情。

#### POST /api/rooms/:room_id/bots

添加 AI 机器人。

**请求体：**
```json
{
  "count": 3,
  "strategy": "loose",
  "chips": 5000
}
```

#### GET /api/rooms/:room_id/hand-history

获取完整牌谱 JSON（含所有事件日志）。

---

### 3.3 钱包接口（玩家端，需 player 角色）

> 以下接口通过 BFF 透明转发，路径不变。

#### GET /api/wallet/balance/:user_id

查询余额。

**响应：**
```json
{
  "code": 0,
  "data": {
    "user_id": "player_alice",
    "wallet_id": "w_player_player_alice",
    "user_type": "player",
    "balance": 100000,
    "frozen_balance": 0,
    "updated_at": 1726531200000
  }
}
```

#### GET /api/wallet/transactions/:user_id

查询流水账本。

**查询参数：**

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `limit` | int | 50 | 每页条数（1-100） |
| `offset` | int | 0 | 偏移量 |

**响应：**
```json
{
  "code": 0,
  "data": [
    {
      "transaction_id": "tx_transfer_001",
      "from_wallet_id": "w_player_player_alice",
      "to_wallet_id": "w_player_player_bob",
      "amount": 10000,
      "fee": 1,
      "type": "transfer",
      "status": "completed",
      "remark": "转账",
      "created_at": 1726531200000
    }
  ]
}
```

**流水类型：** `mint` / `transfer` / `bet` / `refund` / `game_settle` / `commission`

#### POST /api/wallet/transfer

自由转账，扣 0.01% 手续费。

**请求体：**
```json
{
  "transaction_id": "tx_transfer_001",
  "from_user_id": "player_alice",
  "to_user_id": "player_bob",
  "amount": 10000,
  "remark": "转账"
}
```

> `transaction_id` 需前端保证全局唯一（建议格式：`tx_{from}_{to}_{timestamp}`）

---

### 3.4 代理端接口（需 agent/admin）

#### GET /api/agent/dashboard

代理仪表盘（余额 + 代理树）。

**响应：**
```json
{
  "code": 0,
  "data": {
    "agent_id": "agent_root",
    "wallet": { "balance": 50000, "frozen_balance": 0 },
    "commission_tree": [
      { "agent_id": "agt_sub_02", "parent_id": "agent_root", "level": 1, "r_ratio": 0.3000, "commission_balance": 1200, "status": "active" }
    ],
    "daily_rebate": 50000,
    "sub_players_count": 0
  }
}
```

#### GET /api/agent/children

下级代理列表。

**查询参数：** `parent_id`（默认取当前登录用户 ID）

#### GET /api/agent/settlements

代理结算流水。

#### GET /api/agent/commission

佣金明细（自动过滤 `type === "commission"` 的流水）。

**响应：**
```json
{
  "code": 0,
  "data": {
    "agent_id": "agent_root",
    "total_commission": 3600,
    "records": [
      { "transaction_id": "...", "amount": 1500, "type": "commission", "created_at": 1726... }
    ]
  }
}
```

---

### 3.5 管理端接口（需 admin）

#### GET /api/admin/overview

系统全景数据。

**响应：**
```json
{
  "code": 0,
  "data": {
    "audit": { "total_minted": 500100, "sum_all_wallets": 500100, "check_passed": true },
    "system_status": "HEALTHY",
    "active_tables": 12,
    "online_players": 48
  }
}
```

#### POST /api/admin/mint

管理员铸币（唯一凭空产生筹码的入口）。

**请求体：**
```json
{
  "transaction_id": "mint_player_alice_1726531200000",
  "user_id": "player_alice",
  "amount": 100000,
  "remark": "初始筹码"
}
```

#### GET /api/admin/audit

能量守恒审计。

**响应：**
```json
{
  "code": 0,
  "data": {
    "total_minted": 500100,
    "sum_all_wallets": 500100,
    "sum_fee_pool": 0,
    "difference": 0,
    "check_passed": true
  }
}
```

> `code: 5001` 表示审计失败，系统能量守恒被破坏，需紧急排查。

#### GET /api/admin/agents

代理树（扁平列表）。

#### POST /api/admin/agents

新增代理。

**请求体：**
```json
{
  "agent_id": "agt_new_01",
  "parent_id": "agent_root",
  "level": 1,
  "r_ratio": 0.3000,
  "status": "active"
}
```

#### GET /api/admin/transactions?user_id=xxx

用户流水查询。

#### GET /api/admin/rooms

活跃房间列表。

---

### 3.6 客服端接口（需 support/admin）

#### GET /api/support/tickets

工单列表。

**查询参数：** `status`（open/processing/closed）、`category`（deposit/game_bug/report/other）

#### GET /api/support/tickets/:id

工单详情。

#### PATCH /api/support/tickets/:id

更新工单。

**请求体：**
```json
{
  "status": "processing",
  "assignee": "support_01",
  "reply": "正在核查对局录像"
}
```

#### GET /api/support/dashboard

客服仪表盘统计。

#### GET /api/support/player_profile?user_id=xxx

玩家全息档案（余额 + 近期流水 + 工单数）。

#### GET /api/support/refund（POST）

客服应急退款（直接调用 wallet-service/refund）。

---

## 四、WebSocket 协议

### 连接信息

```
开发环境：ws://localhost:8003/ws
生产环境：wss://goodspage.cn/ws  （通过 nginx 反代）
```

### 4.1 客户端 → 服务端消息

| type | payload | 说明 |
|------|---------|------|
| `join_room` | `{ room_id, user_id, as_spectator?: boolean }` | 加入房间；`as_spectator=true` 进入旁观模式（隐藏其他玩家底牌） |
| `player_action` | `{ req_id, user_id, action }` | 执行动作；`req_id` 用于后续 action_ack 匹配 |
| `leave_room` | `{ room_id }` | 离开房间（静默，无响应） |
| `ping` | — | 心跳（服务端回 pong） |

**action 结构：**
```typescript
interface GameAction {
  action_type: "fold" | "check" | "call" | "raise" | "all_in"
              | "ready" | "view_cards" | "compare" | "bet";
  user_id: string;
  amount?: number;        // raise/all_in 时必需
  target_user_id?: string; // compare（炸金花比牌）时必需
}
```

### 4.2 服务端 → 客户端推送

所有推送消息均带 `room_id` 和 `timestamp` 字段。

#### `joined`

加入成功确认。

```json
{ "type": "joined", "room_id": "389236", "as_spectator": false, "timestamp": 1726... }
```

#### `game_state`

全量房间状态（最频繁推送的事件）。

```json
{
  "type": "game_state",
  "room_id": "389236",
  "timestamp": 1726...,
  "data": {
    "room": {
      "room_id": "389236",
      "game_type": "texas_holdem",
      "mode": "cash",
      "base_score": 100,
      "big_blind": 100,
      "total_rounds": 10,
      "status": "playing",
      "created_by": "player_alice"
    },
    "round_state": {
      "phase": "BETTING",
      "total_pot": 5000,
      "current_highest_bet": 1000,
      "min_call_amount": 1000,
      "betting_round_count": 2,
      "community_cards": [
        { "suit": "S", "rank": 10, "code": "S-10" },
        { "suit": "H", "rank": 7, "code": "H-7" },
        { "suit": "D", "rank": 3, "code": "D-3" }
      ],
      "side_pots": []
    },
    "seats": [
      {
        "seat_index": 0,
        "user_id": "player_alice",
        "chips": 95000,
        "current_bet": 1000,
        "status": "playing",
        "cards": [
          { "suit": "S", "rank": 14, "code": "S-14" },
          { "suit": "H", "rank": 13, "code": "H-13" }
        ],
        "is_banker": false,
        "banker_multiplier": 0,
        "bet_multiplier": 1,
        "has_acted": false,
        "is_disconnected": false
      }
    ],
    "turn_timer": {
      "seat_index": 0,
      "user_id": "player_alice",
      "deadline_ms": 1726531230000,
      "remaining_ms": 12345
    }
  }
}
```

> 旁观者收到的 `game_state` 中，非自己的 `cards` 为空数组 `[]`。

#### `action_ack`

动作执行确认（立即回复，带 req_id 匹配）。

```json
{ "type": "action_ack", "req_id": "act_1_1726...", "room_id": "389236", "code": 0, "message": "OK", "timestamp": 1726... }
// code=400 时表示动作无效，message 包含具体原因（如 "Cannot check when there is an active bet"）
```

#### `phase_changed`

阶段切换通知。

```json
{ "type": "phase_changed", "room_id": "389236", "data": { "prev_phase": "preflop", "new_phase": "flop" } }
```

`phase` 取值：`WAITING` / `DEALING` / `BETTING` / `SHOWDOWN` / `SETTLING` / `FINISHED`

#### `action_broadcast`

其他玩家的动作广播。

```json
{ "type": "action_broadcast", "room_id": "389236", "data": { "action": { "type": "raise", "user_id": "player_bob", "amount": 2000 } } }
```

#### `turn_timer`

回合倒计时事件。

```json
// 倒计时开始
{ "type": "turn_timer", "data": { "event": "start", "seat_index": 0, "user_id": "player_alice", "deadline_ms": 1726..., "timeout_ms": 15000 } }

// 每秒 tick
{ "type": "turn_timer", "data": { "event": "tick", "seat_index": 0, "remaining_ms": 12000 } }

// 玩家正常动作后取消
{ "type": "turn_timer", "data": { "event": "cancel", "seat_index": 0 } }

// 超时触发
{ "type": "turn_timer", "data": { "event": "expired", "seat_index": 0, "user_id": "player_alice" } }
```

#### `player_status`

玩家断线/重连状态变更。

```json
{ "type": "player_status", "room_id": "389236", "data": { "user_id": "player_bob", "status": "disconnected" } }
// status: "disconnected" | "reconnected"
```

#### `auto_fold`

超时自动弃牌。

```json
{ "type": "auto_fold", "room_id": "389236", "data": { "folded": [{ "userId": "player_bob", "seatIndex": 1 }] } }
```

#### `round_result`

一局结束（含结果和事件日志）。

```json
{
  "type": "round_result",
  "room_id": "389236",
  "data": {
    "results": [
      { "user_id": "player_alice", "net_amount": 5000, "hand_name": "同花顺" },
      { "user_id": "player_bob", "net_amount": -5000, "hand_name": "两对" }
    ],
    "event_log": [
      { "seq": 1, "ts": 1726..., "type": "round_start", "payload": {} },
      { "seq": 2, "ts": 1726..., "type": "cards_dealt", "payload": { "players": [...] } },
      { "seq": 3, "ts": 1726..., "type": "blind", "payload": { "user_id": "...", "blind": "sb", "amount": 50 } }
    ]
  }
}
```

#### `pong`

心跳响应。

```json
{ "type": "pong", "timestamp": 1726... }
```

---

### 4.3 推流触发时机总表

| 事件 | 触发条件 | 推送范围 |
|------|---------|---------|
| `joined` | join_room 成功 | 仅发起者 |
| `game_state` | join 时首次推送 | 房间内所有订阅者 |
| `game_state` | 每次有效动作后 | 房间内所有订阅者 |
| `game_state` | 每 5 秒兜底同步 | 房间内所有订阅者 |
| `action_ack` | player_action 执行后 | 仅发起者（立即回复） |
| `phase_changed` | 状态机阶段切换 | 房间内所有订阅者 |
| `action_broadcast` | 任何玩家执行有效动作 | 房间内所有订阅者 |
| `turn_timer.start` | 轮到玩家行动，进入 BETTING | 房间内所有订阅者 |
| `turn_timer.tick` | 每秒定时器 | 房间内所有订阅者 |
| `turn_timer.cancel` | 玩家正常动作后 | 房间内所有订阅者 |
| `turn_timer.expired` | 倒计时归零 | 房间内所有订阅者 |
| `player_status` | WS close → 断线 / join_room → 重连 | 房间内所有订阅者 |
| `auto_fold` | 断线超时（默认 5 分钟）检查触发 | 房间内所有订阅者 |
| `round_result` | stateMachine.finishSettlement() | 房间内所有订阅者 |

---

### 4.4 状态机完整时序（德州扑克为例）

```
服务端事件流                          前端收到推送
──────────────────────────────────────────────────────────────
[状态机] WAITING → DEALING
                                              ← game_state（发牌后）

[状态机] DEALING → BETTING
  启动回合倒计时                            ← turn_timer { event: start, seat_index, deadline_ms }
  每秒推送剩余时间                          ← turn_timer { event: tick, remaining_ms }

[玩家] player_action { fold/check/call/raise/all_in }
                                              ← action_ack { code: 0 }
                                              ← action_broadcast { action }
                                              ← game_state（状态同步）

[状态机] 本轮结束 → 下一轮或 SHOWDOWN
                                              ← phase_changed { new_phase }
                                              ← turn_timer { event: start }（新首位玩家）

[状态机] BETTING → SHOWDOWN
                                              ← phase_changed { new_phase: "SHOWDOWN" }
                                              ← game_state（各玩家手牌可见）

[状态机] SHOWDOWN → SETTLING
  调用 wallet-service/game_settle（HTTP）
                                              ← round_result { results, event_log }
                                              ← turn_timer { event: cancel }

[状态机] SETTLING → FINISHED → WAITING
                                              ← game_state（终态，筹码已更新）
```

---

## 五、资金闭环说明

### 筹码流向

```
铸币（唯一入口）
  POST /api/wallet/mint
  ↓
玩家钱包（balance）
  ↓ 下注（bet）
牌桌虚拟钱包（room_{room_id}）
  ↓ 结算（game_settle）
  ├─→ 赢家钱包
  ├─→ 平台手续费池（fee_pool）
  └─→ 代理返佣池（经 commission-service 分账）
  ↓ 异常退款（refund）
玩家钱包（退还未结算筹码）
```

### 能量守恒公式

```
sum(所有钱包余额) + sum(fee_pool) == total_minted
```

前端可通过 `GET /api/admin/audit` 验证此等式是否成立。

### 转账手续费

- 自由转账扣 **0.01%**（即 `fee = floor(amount × 0.0001)`）
- 手续费进入 `fee_pool`

---

## 六、错误码规范

| code | HTTP 状态 | 含义 | 处理建议 |
|------|----------|------|---------|
| 0 | 200 | 成功 | — |
| 400 | 400 | 请求参数错误 | 展示 message 提示用户 |
| 401 | 401 | 未授权 / Token 无效 | 清除本地 token，跳转登录页 |
| 403 | 403 | 权限不足 | 展示"无权限"提示 |
| 404 | 404 | 资源不存在 | 展示"未找到"提示 |
| 409 | 409 | 资源冲突（如用户名已存在） | 展示冲突原因 |
| 429 | 429 | 请求过于频繁 | 提示用户稍后再试 |
| 500 | 500 | 服务器内部错误 | 展示通用错误，记录日志 |
| 5001 | 200 | 能量守恒校验失败 | **严重**，需立即通知运维 |

---

## 七、前端实现约束

### 必须遵守

1. **禁止绕过 BFF 直连后端服务**。所有 HTTP 请求统一走 BFF（`/api/*`），WS 连接统一走游戏引擎 `/ws`。
   - 例外：`/health` 和 `/__debug/*` 仅在开发环境使用。

2. **所有写操作必须携带全局唯一 `transaction_id`**（如 `tx_{from}_{to}_{timestamp}_{nonce}`），幂等校验由后端完成。

3. **金额字段使用整数**，禁止使用浮点数（如 `100.50`），使用 `10050` 表示。

4. **Token 过期（401）时自动跳转登录页**，清除本地存储。

5. **WebSocket 断线重连**：采用指数退避策略（1s → 2s → 4s → 8s → 16s → 最大 30s），最多重试 5 次。

6. ** spectator（旁观者）模式**：通过 `as_spectator: true` 加入房间，系统自动屏蔽其他玩家的底牌。

### 禁止事项

- ❌ 禁止在前端直接计算筹码分账（所有资金操作走后端 API）
- ❌ 禁止硬编码后端服务地址（通过环境变量或 config 文件管理）
- ❌ 禁止省略 action_ack 的超时处理（建议 5 秒超时降级到 HTTP）
- ❌ 禁止在前端做断线重连状态判断（以服务端 `game_state` 为准）

---

*文档结束*

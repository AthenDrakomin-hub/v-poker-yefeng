# V-POKER 平台 API 文档

> 版本：v1.0.0  
> 更新时间：2026-09-22  
> 基础地址：`https://goodspage.cn`

---

## 📋 目录

1. [全局约定](#全局约定)
2. [BFF 聚合层 API](#bff-聚合层-api)
3. [钱包服务 API](#钱包服务-api)
4. [代理结算服务 API](#代理结算服务-api)
5. [游戏引擎 API](#游戏引擎-api)
6. [WebSocket 协议](#websocket-协议)
7. [错误码说明](#错误码说明)

---

## 全局约定

### 统一响应格式

所有 API 接口统一返回以下格式：

```json
{
  "code": 0,
  "message": "success",
  "data": { ... }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| code | integer | 状态码，0 表示成功，非 0 表示失败 |
| message | string | 状态描述 |
| data | object/array/null | 响应数据 |

### 数据类型约定

| 类型 | 说明 | 示例 |
|------|------|------|
| 金额 | 整数（筹码最小单位），禁止浮点 | `10000` |
| 比例 | 小数，保留 4 位 | `0.0300` = 3% |
| 时间 | Unix 毫秒时间戳 | `1789761921876` |
| ID | 字符串，避免 JS 精度丢失 | `"player_alice"` |

### 认证方式

除登录/注册/健康检查外，所有接口需要在请求头携带 JWT Token：

```
Authorization: Bearer <token>
```

---

## BFF 聚合层 API

> 端口：4000  
> 基础路径：`/api`

### 1. 健康检查

#### GET /

获取 BFF 服务状态。

**响应示例：**
```json
{
  "code": 0,
  "message": "V-POKER BFF Service is running",
  "data": {
    "service": "v-poker-bff",
    "version": "1.0.0",
    "status": "healthy",
    "timestamp": 1789761921876
  }
}
```

#### GET /health

健康检查端点。

---

### 2. 认证接口

#### POST /api/auth/login

用户登录，获取 JWT Token。

**请求体：**
```json
{
  "username": "player_alice",
  "password": "test123"
}
```

**响应示例：**
```json
{
  "code": 0,
  "message": "Login successful",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "token_type": "Bearer",
    "user": {
      "user_id": "player_alice",
      "role": "player"
    }
  }
}
```

**速率限制：** 同一 IP 每分钟最多 5 次请求。

---

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

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名 |
| password | string | 是 | 密码 |
| role | string | 否 | 角色，默认 `player` |

---

### 3. 房间接口

> 需要认证：`player` / `agent` / `admin`

#### POST /api/rooms/create

创建房间。

**请求体：**
```json
{
  "room_name": "德州扑克房间",
  "game_type": "texas_holdem",
  "mode": "cash",
  "total_rounds": 10,
  "base_score": 10,
  "platform_fee_rate": 0.0300,
  "agent_commission_rate": 0.0300,
  "min_players": 2,
  "max_players": 6,
  "big_blind": 100,
  "rake_cap_multiplier": 5,
  "room_password": ""
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| room_name | string | 是 | 房间名称 |
| game_type | string | 是 | 游戏类型：`texas_holdem` / `zha_jin_hua` / `niu_niu` / `san_gong` |
| mode | string | 是 | 模式：`cash` / `sng` / `tournament` |
| total_rounds | integer | 否 | 总局数，0 表示无限局 |
| base_score | integer | 否 | 底分 |
| platform_fee_rate | decimal | 否 | 平台抽水比例，默认 0.0300 |
| agent_commission_rate | decimal | 否 | 代理返佣比例，默认 0.0300 |
| min_players | integer | 否 | 最少玩家数 |
| max_players | integer | 否 | 最多玩家数 |
| big_blind | integer | 否 | 大盲注 |
| rake_cap_multiplier | integer | 否 | 抽水上限倍数 |
| room_password | string | 否 | 房间密码，空表示公开房 |

**响应示例：**
```json
{
  "code": 0,
  "message": "Room created successfully",
  "data": {
    "room_id": "389236",
    "room_name": "德州扑克房间",
    "game_type": "texas_holdem",
    "status": "waiting",
    "current_round": 0,
    ...
  }
}
```

---

#### GET /api/rooms/list

获取房间列表。

**查询参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| game_type | string | 否 | 按游戏类型筛选 |
| status | string | 否 | 按状态筛选，默认 `waiting` |

**响应示例：**
```json
{
  "code": 0,
  "message": "Success",
  "data": [
    {
      "room_id": "389236",
      "room_name": "德州扑克房间",
      "game_type": "texas_holdem",
      "status": "waiting",
      "current_round": 0,
      ...
    }
  ]
}
```

---

#### GET /api/rooms/{room_id}

获取房间详情。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| room_id | string | 房间 ID（6 位数字） |

---

#### POST /api/rooms/join

加入房间。

**请求体：**
```json
{
  "room_id": "389236",
  "room_password": ""
}
```

---

#### POST /api/rooms/{room_id}/bots

向房间添加 AI 机器人。

**请求体：**
```json
{
  "count": 3,
  "strategy": "loose",
  "chips": 5000
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| count | integer | 批量添加机器人数量 |
| seat_index | integer | 指定座位添加（与 count 二选一） |
| strategy | string | AI 策略：`loose` / `tight` / `aggressive` |
| chips | integer | 机器人初始筹码 |

---

#### GET /api/rooms/{room_id}/hand-history

获取牌谱/对局历史。

---

## 钱包服务 API

> 端口：8001  
> 基础路径：`/api/wallet`  
> 内部服务，不直接对外暴露，通过 BFF 调用

### 1. 铸币

#### POST /api/wallet/mint

管理员铸币，唯一凭空产生筹码的接口。

**请求体：**
```json
{
  "transaction_id": "mint_player_alice_1789761916736",
  "user_id": "player_alice",
  "amount": 100000,
  "remark": "初始筹码分配"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| transaction_id | string | 是 | 全局唯一流水号，幂等校验 |
| user_id | string | 是 | 接收用户 ID |
| amount | integer | 是 | 铸币金额（筹码） |
| remark | string | 否 | 备注 |

---

### 2. 转账

#### POST /api/wallet/transfer

用户自由转账，扣 0.01% 手续费。

**请求体：**
```json
{
  "transaction_id": "trans_alice_bob_001",
  "from_user_id": "player_alice",
  "to_user_id": "player_bob",
  "amount": 10000,
  "remark": "转账"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| transaction_id | string | 是 | 全局唯一流水号 |
| from_user_id | string | 是 | 转出用户 |
| to_user_id | string | 是 | 转入用户 |
| amount | integer | 是 | 转账金额 |
| remark | string | 否 | 备注 |

**手续费计算：** `fee = floor(amount * 0.0001)`，手续费进入 `fee_pool`。

---

### 3. 下注

#### POST /api/wallet/bet

玩家下注，从玩家钱包扣款到牌桌虚拟钱包。

**请求体：**
```json
{
  "transaction_id": "bet_room888_p1_001",
  "room_id": "888",
  "user_id": "player_1",
  "amount": 5000
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| transaction_id | string | 是 | 全局唯一流水号 |
| room_id | string | 是 | 房间 ID |
| user_id | string | 是 | 下注玩家 |
| amount | integer | 是 | 下注金额 |

**牌桌虚拟钱包：** `user_id = "room_{room_id}"`，`user_type = "room"`，不存在则自动创建。

---

### 4. 退款

#### POST /api/wallet/refund

异常退款，从牌桌虚拟钱包退还给玩家。

**请求体：**
```json
{
  "transaction_id": "refund_room888_001",
  "room_id": "888",
  "refunds": [
    { "user_id": "player_1", "amount": 5000 },
    { "user_id": "player_2", "amount": 5000 }
  ]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| transaction_id | string | 是 | 全局唯一流水号 |
| room_id | string | 是 | 房间 ID |
| refunds | array | 是 | 退款明细列表 |

---

### 5. 游戏结算

#### POST /api/wallet/game_settle

游戏对局结算分账，从牌桌虚拟钱包扣款，分给赢家 + 平台 + 代理。

**请求体：**
```json
{
  "transaction_id": "settle_room888_001",
  "room_id": "888",
  "total_pot": 100000,
  "winner_ids": ["player_1"],
  "platform_fee_rate": 0.0300,
  "agent_commission_rate": 0.0300,
  "agent_ids": ["agt_room_03", "agt_sub_02", "agt_top_01"]
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| transaction_id | string | 是 | 全局唯一流水号 |
| room_id | string | 是 | 房间 ID |
| total_pot | integer | 是 | 总底池 |
| winner_ids | array | 是 | 赢家用户 ID 列表 |
| platform_fee_rate | decimal | 是 | 平台抽水比例 |
| agent_commission_rate | decimal | 是 | 代理返佣比例 |
| agent_ids | array | 是 | 代理链 ID 列表（从下到上） |

**分账公式：**
- 房费 = `total_pot * platform_fee_rate`
- 代理返佣池 = `total_pot * agent_commission_rate`
- 平台留存 = 房费 - 代理返佣池
- 赢家实得 = `total_pot - 房费`

---

### 6. 余额查询

#### GET /api/wallet/balance/{user_id}

查询用户钱包余额。

**路径参数：**

| 参数 | 类型 | 说明 |
|------|------|------|
| user_id | string | 用户 ID |

**响应示例：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "user_id": "player_alice",
    "wallet_id": "wallet_xxx",
    "user_type": "player",
    "balance": 100000,
    "frozen_balance": 0,
    "updated_at": 1789761921876
  }
}
```

---

### 7. 流水查询

#### GET /api/wallet/transactions/{user_id}

查询用户流水账本。

**查询参数：**

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| limit | integer | 50 | 每页条数（1-100） |
| offset | integer | 0 | 偏移量 |

---

### 8. 排行榜

#### GET /api/wallet/leaderboard

财富排行榜，按用户钱包余额降序排列。

**查询参数：**

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| limit | integer | 20 | 返回条数（1-100） |

---

### 9. 能量守恒审计

#### GET /api/wallet/audit

系统能量守恒对账。

**核心公式：** `sum_all_wallets + sum_fee_pool == total_minted`

**响应示例：**
```json
{
  "code": 0,
  "message": "Energy conserved: System in balance.",
  "data": {
    "total_minted": 500100,
    "sum_all_wallets": 500100,
    "sum_fee_pool": 0,
    "difference": 0,
    "check_passed": true,
    "breakdown": {
      "player_wallets": 500100,
      "room_wallets": 0,
      "agent_wallets": 0,
      "platform_wallet": 0,
      "fee_pool": 0
    }
  }
}
```

---

## 代理结算服务 API

> 端口：8000  
> 基础路径：`/api`  
> 内部服务，由 wallet-service 调用

### 1. 代理返佣结算

#### POST /api/settle

代理返佣结算，计算各级代理分账。

**请求体：**
```json
{
  "transaction_id": "settle_room888_001",
  "total_flow": 100000,
  "platform_fee_rate": 0.0300,
  "agent_commission_rate": 0.0300,
  "agent_ids": ["agt_room_03", "agt_sub_02", "agt_top_01"]
}
```

**响应示例：**
```json
{
  "code": 0,
  "message": "settlement calculated",
  "data": {
    "transaction_id": "settle_room888_001",
    "total_flow": 100000,
    "total_rake": 3000,
    "agent_pool": 3000,
    "platform_revenue": 0,
    "agent_shares": [
      {
        "agent_id": "agt_room_03",
        "level": 0,
        "commission_amount": 1500
      },
      {
        "agent_id": "agt_sub_02",
        "level": 1,
        "commission_amount": 900
      },
      {
        "agent_id": "agt_top_01",
        "level": 2,
        "commission_amount": 600
      }
    ]
  }
}
```

**分账公式：**
- `T = a × S`（总返佣池）
- `L₀ = T × (1 - r₁)`（开房代理）
- `Lᵢ = T × (∏ⱼ₌₁ⁱ rⱼ) × (1 - rᵢ₊₁)`（中间代理）
- `Lₙ = T × ∏ⱼ₌₁ⁿ rⱼ`（顶级代理）

---

### 2. 新增代理

#### POST /api/agent

新增代理。

**请求体：**
```json
{
  "agent_id": "agt_new_01",
  "parent_id": "agt_top_01",
  "level": 1,
  "r_ratio": 0.3000,
  "status": "active"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| agent_id | string | 是 | 代理 ID |
| parent_id | string | 否 | 上级代理 ID |
| level | integer | 是 | 层级（0=开房代理） |
| r_ratio | decimal | 是 | 该级抽成比例 |
| status | string | 是 | 状态：`active` / `frozen` |

---

### 3. 代理树查询

#### GET /api/agent/tree

查询代理树（扁平列表，前端自行组装树）。

**响应示例：**
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "agent_id": "agt_top_01",
      "parent_id": null,
      "level": 2,
      "r_ratio": 0.2000,
      "commission_balance": 0,
      "status": "active"
    },
    ...
  ]
}
```

---

## 游戏引擎 API

> 端口：8003  
> 基础路径：`/api/engine`  
> 内部服务，需要 `X-Internal-Auth-Key` 请求头鉴权

### 1. 健康检查

#### GET /health

获取游戏引擎状态，无需鉴权。

---

### 2. 创建游戏房间

#### POST /api/engine/room/create

在游戏引擎中创建房间（内存中）。

**请求头：**
```
X-Internal-Auth-Key: <internal_key>
```

**请求体：**
```json
{
  "room_id": "389236",
  "game_type": "texas_holdem",
  "mode": "cash",
  "base_score": 100
}
```

---

### 3. 获取所有房间

#### GET /api/engine/rooms

获取所有内存中的房间列表。

---

### 4. 获取房间状态

#### GET /api/engine/room/{id}

获取房间状态快照（含 turn_timer）。

---

### 5. 玩家动作

#### POST /api/engine/room/{id}/action

执行玩家动作（HTTP 入口，保留兼容）。

**请求体：**
```json
{
  "user_id": "player_alice",
  "action": {
    "type": "call",
    "amount": 1000
  }
}
```

**动作类型：**
- `fold` - 弃牌
- `check` - 过牌
- `call` - 跟注
- `raise` - 加注
- `all_in` - 全下
- `see_cards` - 看牌（炸金花）
- `compare` - 比牌（炸金花）

---

### 6. 结算当前牌局

#### POST /api/engine/room/{id}/settle

手动触发结算（通常由状态机自动触发）。

---

### 7. 获取对局回放

#### GET /api/engine/room/{id}/replay

获取对局事件日志，用于战绩回放。

---

### 8. 添加 AI 机器人

#### POST /api/engine/room/{id}/bots

向房间添加 AI 机器人。

---

## WebSocket 协议

> 地址：`wss://goodspage.cn/ws`  
> 用于实时游戏状态推送和玩家动作

### 连接建立

```javascript
const ws = new WebSocket("wss://goodspage.cn/ws");
```

### 客户端发送消息

#### 1. 加入房间

```json
{
  "type": "join_room",
  "room_id": "389236",
  "user_id": "player_alice",
  "token": "eyJhbGciOiJIUzI1NiIs..."
}
```

#### 2. 玩家动作

```json
{
  "type": "player_action",
  "req_id": "req_001",
  "room_id": "389236",
  "user_id": "player_alice",
  "action": {
    "type": "raise",
    "amount": 2000
  }
}
```

#### 3. 心跳

```json
{
  "type": "ping"
}
```

### 服务端推送消息

#### 1. 游戏状态（全量同步）

```json
{
  "type": "game_state",
  "room_id": "389236",
  "data": {
    "room": { ... },
    "round_state": { ... },
    "seats": [ ... ],
    "turn_timer": { ... }
  },
  "timestamp": 1789761921876
}
```

#### 2. 阶段变化

```json
{
  "type": "phase_changed",
  "room_id": "389236",
  "data": {
    "prev_phase": "preflop",
    "new_phase": "flop"
  }
}
```

#### 3. 动作广播

```json
{
  "type": "action_broadcast",
  "room_id": "389236",
  "data": {
    "action": { ... }
  }
}
```

#### 4. 回合计时器

```json
{
  "type": "turn_timer",
  "room_id": "389236",
  "data": {
    "event": "start",
    "seat_index": 0,
    "user_id": "player_alice",
    "deadline_ms": 1789761936876,
    "timeout_ms": 15000
  }
}
```

**事件类型：** `start` / `tick` / `cancel` / `expired`

#### 5. 玩家状态

```json
{
  "type": "player_status",
  "room_id": "389236",
  "data": {
    "user_id": "player_alice",
    "status": "disconnected"
  }
}
```

**状态：** `disconnected` / `reconnected`

#### 6. 自动弃牌

```json
{
  "type": "auto_fold",
  "room_id": "389236",
  "data": {
    "folded": ["player_bob"]
  }
}
```

#### 7. 一局结束

```json
{
  "type": "round_result",
  "room_id": "389236",
  "data": {
    "results": [ ... ],
    "event_log": [ ... ]
  }
}
```

#### 8. 动作确认

```json
{
  "type": "action_ack",
  "req_id": "req_001",
  "success": true,
  "message": "Action accepted"
}
```

---

## 错误码说明

| 错误码 | 说明 |
|--------|------|
| 0 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 / Token 无效 |
| 403 | 禁止访问 / 权限不足 |
| 404 | 资源不存在 |
| 409 | 资源冲突（如用户名已存在） |
| 429 | 请求过于频繁（速率限制） |
| 500 | 服务器内部错误 |
| 5001 | 能量守恒校验失败（严重） |

---

## 测试账号

| 角色 | 用户名 | 密码 | 筹码 |
|------|--------|------|------|
| 管理员 | admin_root | test | - |
| 代理 | agent_root | test | - |
| 客服 | support_01 | test | - |
| 玩家 | player_alice | test | 100,000 |
| 玩家 | player_bob | test | 100,000 |
| 玩家 | player_charlie | test | 100,000 |
| 玩家 | player_david | test | 100,000 |
| 玩家 | player_eve | test | 100,000 |

---

**文档结束**

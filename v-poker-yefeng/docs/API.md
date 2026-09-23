# V-POKER API 接口文档

> 四端接口完整说明 | BFF 层统一入口 `http://bff:4000/api`

---

## 通用约定

### 认证方式

所有接口（除登录/注册外）需在 Header 携带 JWT：
```
Authorization: Bearer <token>
```

### 统一响应格式

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

| code | 含义 |
|---|---|
| 0 | 成功 |
| 401 | 未认证/Token过期 |
| 403 | 无权限 |
| 500 | 服务器错误 |

### 角色枚举

| userType | 说明 |
|---|---|
| admin | 管理员 |
| support | 客服 |
| agent | 代理 |
| player | 玩家 |

---

## 一、认证接口（公开）

### POST /api/auth/login

**角色：** 所有端

**请求体：**
```json
{
  "username": "player_alice",
  "password": "******"
}
```

**响应：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "access_token": "eyJhbGciOi...",
    "user": {
      "user_id": "player_alice",
      "role": "player"
    }
  }
}
```

### POST /api/auth/register

**角色：** 玩家端注册

**请求体：**
```json
{
  "username": "player_bob",
  "password": "******",
  "nickname": "鲍勃"
}
```

---

## 二、玩家端接口（角色：player）

### 房间

#### GET /api/rooms/list

获取房间列表。

**查询参数：**
| 参数 | 类型 | 说明 |
|---|---|---|
| game_type | string | 可选，筛选游戏类型 |
| status | string | 可选，筛选状态 |

**响应 data：**
```json
[
  {
    "room_id": "123456",
    "room_name": "休闲局",
    "game_type": "texas_holdem",
    "mode": "fixed",
    "base_score": 100,
    "min_players": 2,
    "max_players": 6,
    "status": "waiting",
    "current_round": 0,
    "created_by": "agt_room_03",
    "created_at": 1727000000000
  }
]
```

#### POST /api/rooms/join

加入房间。

**请求体：**
```json
{
  "room_id": "123456",
  "password": ""
}
```

#### POST /api/rooms/create

创建房间（仅代理端调用，玩家端无入口）。

**请求体：**
```json
{
  "room_name": "VIP局",
  "game_type": "texas_holdem",
  "total_rounds": 10,
  "base_score": 100,
  "room_password": ""
}
```

---

### 钱包

#### GET /api/wallet/balance/:user_id

查询余额。

**响应 data：**
```json
{
  "wallet_id": "w_player_alice",
  "user_id": "player_alice",
  "balance": 50000,
  "frozen_balance": 0
}
```

#### GET /api/wallet/transactions/:user_id

查询流水。

**查询参数：**
| 参数 | 类型 | 说明 |
|---|---|---|
| limit | int | 默认 50 |
| offset | int | 默认 0 |

**响应 data：**
```json
{
  "items": [
    {
      "transaction_id": "tx_001",
      "from_wallet_id": "w_player_alice",
      "to_wallet_id": "w_room_123456",
      "amount": 100,
      "fee": 0,
      "type": "bet",
      "status": "success",
      "created_at": 1727000000000
    }
  ],
  "total": 100,
  "has_more": true
}
```

#### POST /api/wallet/transfer

自由转账（from_user_id 由 JWT 注入）。

**请求体：**
```json
{
  "to_user_id": "player_bob",
  "amount": 1000,
  "remark": "转赠筹码"
}
```

**响应 data：**
```json
{
  "transaction_id": "tx_002",
  "from_user_id": "player_alice",
  "to_user_id": "player_bob",
  "amount": 1000,
  "fee": 1,
  "net_amount": 999
}
```

> 手续费率由后端环境变量 `FEE_RATE` 控制，当前 0.1%。

---

### 个人战绩

#### GET /api/stats/:user_id

**响应 data：**
```json
{
  "user_id": "player_alice",
  "total_games": 50,
  "win_rate": 42.0,
  "total_profit": 15000,
  "best_pot": 5000,
  "best_hand": "同花顺",
  "max_streak": 5,
  "game_stats": [
    {
      "game_type": "texas_holdem",
      "total_games": 30,
      "win_rate": 45.0,
      "profit": 12000
    }
  ]
}
```

---

### 好友

#### GET /api/friends/:user_id

**响应 data：**
```json
[
  {
    "user_id": "player_bob",
    "name": "鲍勃",
    "online": true
  }
]
```

#### POST /api/friends/add

**请求体：**
```json
{
  "friend_id": "player_bob"
}
```

**响应 data：**
```json
{
  "user_id": "player_alice",
  "friend_id": "player_bob",
  "status": "pending"
}
```

---

### 排行榜

#### GET /api/rank

**查询参数：**
| 参数 | 类型 | 说明 |
|---|---|---|
| period | string | week / month / all，默认 week |

**响应 data：**
```json
[
  {
    "user_id": "player_charlie",
    "name": "查理",
    "score": 50000
  }
]
```

---

### 成就

#### GET /api/achievements/:user_id

**响应 data：**
```json
[
  {
    "id": "first_game",
    "name": "初出茅庐",
    "desc": "完成第一局对局",
    "icon": "♠",
    "unlocked": true,
    "unlocked_at": 1727000000000
  }
]
```

---

### 消息

#### GET /api/messages/:user_id

**查询参数：**
| 参数 | 类型 | 说明 |
|---|---|---|
| limit | int | 默认 20 |
| offset | int | 默认 0 |

**响应 data：**
```json
[
  {
    "message_id": "msg_001",
    "title": "系统通知",
    "content": "欢迎加入 V-POKER 金樽俱乐部",
    "created_at": 1727000000000
  }
]
```

---

## 三、代理端接口（角色：agent）

### GET /api/agent/dashboard

代理数据概览。

**响应 data：**
```json
{
  "total_commission": 125000,
  "children_count": 12,
  "total_flow": 5000000,
  "room_count": 5
}
```

### GET /api/agent/children

下级代理列表。

**响应 data：**
```json
[
  {
    "agent_id": "agt_sub_02",
    "parent_id": "agt_top_01",
    "level": 1,
    "commission_balance": 5000,
    "status": "active"
  }
]
```

### GET /api/agent/settlements

结算记录。

**响应 data：**
```json
[
  {
    "settlement_id": "st_001",
    "period": "2024-W38",
    "total_flow": 500000,
    "commission_amount": 15000,
    "status": "paid",
    "settled_at": 1727000000000
  }
]
```

### GET /api/agent/commission

佣金明细。

**响应 data：**
```json
{
  "records": [
    {
      "created_at": 1727000000000,
      "commission_amount": 1200,
      "level": 0
    }
  ]
}
```

---

## 四、客服端接口（角色：support）

### GET /api/support/dashboard

客服概览。

**响应 data：**
```json
{
  "open_tickets": 5,
  "resolved_today": 12,
  "total_players": 1000
}
```

### GET /api/support/tickets

工单列表。

**响应 data：**
```json
[
  {
    "ticket_id": "tk_001",
    "user_id": "player_alice",
    "category": "refund",
    "status": "open",
    "description": "对局异常",
    "created_at": 1727000000000,
    "messages": []
  }
]
```

### GET /api/support/tickets/:id

工单详情（含聊天记录）。

### PATCH /api/support/tickets/:id

处理工单。

**请求体：**
```json
{
  "status": "resolved",
  "reply": "已为您处理退款"
}
```

### GET /api/support/player_profile

玩家查询。

**查询参数：** `user_id`

**响应 data：**
```json
{
  "user_id": "player_alice",
  "wallet": { "balance": 50000 },
  "tickets_count": 2
}
```

### GET /api/support/balance

查询玩家余额。

**查询参数：** `user_id`

**响应 data：**
```json
{
  "user_id": "player_alice",
  "balance": 50000,
  "frozen_balance": 0
}
```

### GET /api/support/transactions

查询玩家交易流水。

**查询参数：** `user_id`, `limit=20`

### POST /api/support/refund

办理退款。

**请求体：**
```json
{
  "user_id": "player_alice",
  "amount": 1000,
  "reason": "工单 tk_001 退款"
}
```

---

## 五、管理端接口（角色：admin）

### GET /api/admin/overview

全局概览。

**响应 data：**
```json
{
  "total_users": 1000,
  "total_rooms": 50,
  "wallet_count": 1005,
  "transaction_count": 50000,
  "total_minted": 10000000
}
```

### POST /api/admin/mint

筹码增发（无手续费）。

**请求体：**
```json
{
  "user_id": "support_sarah",
  "amount": 100000,
  "reason": "月度配发"
}
```

### GET /api/admin/audit

资金审计（筹码守恒校验）。

**响应 data：**
```json
{
  "total_minted": 10000000,
  "sum_all_wallets": 9500000,
  "sum_fee_pool": 500000,
  "difference": 0
}
```

### GET /api/admin/agents

代理列表。

**响应 data：**
```json
{
  "agents": [
    {
      "agent_id": "agt_top_01",
      "parent_id": null,
      "level": 2,
      "commission_balance": 50000,
      "status": "active"
    }
  ]
}
```

### POST /api/admin/agents

新增代理。

**请求体：**
```json
{
  "username": "agent_new",
  "password": "******"
}
```

### GET /api/admin/transactions

全局交易流水。

### GET /api/admin/rooms

全部房间监控。

**响应 data：**
```json
{
  "rooms": [
    {
      "room_id": "123456",
      "game_type": "texas_holdem",
      "base_score": 100,
      "status": "playing",
      "created_by": "agt_room_03",
      "created_at": 1727000000000
    }
  ]
}
```

---

## 转账手续费规则

| 转账方向 | 手续费 | 说明 |
|---|---|---|
| 管理端 → 客服 | 0% | 铸币 mint，无手续费 |
| 客服 → 代理 | 0.1% | 转账 |
| 代理 → 玩家 | 0.1% | 转账 |
| 玩家 → 玩家 | 0.1% | 转赠 |
| 玩家 → 代理 | 0.1% | 转账 |

> 手续费率由后端环境变量 `FEE_RATE` 控制，默认 0.001（0.1%）。

# 全局契约字典 v2.0（数据字典 + API 规范）

> 平台定位：**封闭式虚拟经济系统**。筹码自由流通，无充提法币接口。管理员可铸币，用户间可互转（扣 0.01% 手续费），游戏结算时抽取房费并分给赢家和代理。
>
> **版本说明**：v2.0 在 v1.0 基础上新增房间管理模块、牌桌虚拟钱包模型、下注/退款/佣金流水类型。
>
> 变更标记：✅ v1 保留 | 🆕 v2 新增 | 🔧 v2 修改

---

## 1. 全局设计铁律与命名规范

| 规范项目 | 契约标准 | 说明与示例 |
| :--- | :--- | :--- |
| **字段命名** | 全部 `snake_case` | 所有数据库列、JSON 报文键统一小写+下划线，禁止 camelCase |
| **金额单位** | 整数 `integer` | 筹码最小不可分割单位（分/微筹），严禁浮点数运算，计算使用 `Decimal` |
| **手续费率/比例**| 小数 `decimal`，保留 4 位 | 字符串形式传递或 Decimal 存储，例如 `3% = 0.0300`, `0.01% = 0.0001` |
| **时间标准** | Unix 毫秒时间戳 `bigint` | 如 `1726531200000`，跨语言高精度标准 |
| **ID 格式** | 字符串 `string` | 推荐 UUIDv4 或业务前缀（如 `tx_`、`w_`、`agt_`），防 JS 64位浮点截断 |
| **API 统一响应** | `{ code, message, data }` | `code: 0` 表示成功，非 0 为具体错误码 |

---

## 2. 核心数据表结构

### 2.1 钱包表 `wallets` ✅ v1 保留 + 🔧 v2 扩展

存储所有系统角色（管理员、客服、代理、玩家、牌桌）的筹码账户。

| 字段名 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `wallet_id` | VARCHAR(64) | PRIMARY KEY | 钱包唯一标识（如 `w_player_1001`、`w_room_888888`） |
| `user_id` | VARCHAR(64) | UNIQUE, NOT NULL | 关联唯一用户ID（牌桌钱包为 `room_{room_id}`） |
| `user_type` | VARCHAR(20) | NOT NULL | 角色类型: `admin`, `support`, `agent`, `player` 🆕 `room`（牌桌虚拟钱包） |
| `balance` | BIGINT | NOT NULL, >= 0 | 可用筹码余额（整数），禁止为负数 |
| `frozen_balance` | BIGINT | NOT NULL, DEFAULT 0 | 冻结筹码（如牌桌在局押注或异常冻结） |
| `updated_at` | BIGINT | NOT NULL | 最后更新毫秒时间戳 |

**v2 扩展说明**：
- 新增 `user_type = room`：牌桌虚拟钱包，每个房间一个，`user_id = "room_{room_id}"`
- 牌桌钱包不参与转账、不参与 mint，只能通过 bet/settle/refund 操作

### 2.2 流水账本 `transactions` ✅ v1 保留 + 🔧 v2 扩展

系统唯一真实账本（Single Source of Truth），所有金额变动必须落地于此。

| 字段名 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `transaction_id` | VARCHAR(64) | PRIMARY KEY | 全局唯一交易流水号，幂等键 |
| `from_wallet_id` | VARCHAR(64) | NULLABLE | 支出方钱包ID（铸币/系统发奖时为空） |
| `to_wallet_id` | VARCHAR(64) | NOT NULL | 接收方钱包ID |
| `amount` | BIGINT | NOT NULL, > 0 | 交易实际到达接收方的净金额或转账基数 |
| `fee` | BIGINT | NOT NULL, DEFAULT 0 | 本笔交易产生的手续费 |
| `fee_recipient` | VARCHAR(64) | NOT NULL, DEFAULT 'platform_fee' | 手续费归集账户标识 |
| `type` | VARCHAR(32) | NOT NULL | 类型见下方说明 |
| `status` | VARCHAR(20) | NOT NULL | 状态: `pending`, `success`, `failed` |
| `remark` | TEXT | NULLABLE | 交易业务附言/审计说明 |
| `created_at` | BIGINT | NOT NULL | 交易创建毫秒时间戳 |

**v2 扩展 type 类型**：

| type 值 | 说明 | v1/v2 |
| :--- | :--- | :--- |
| `mint` | 管理员铸币（唯一资金来源） | ✅ v1 |
| `transfer` | 用户自由转账（扣 0.01% 手续费） | ✅ v1 |
| `game_settle` | 游戏结算（牌桌→赢家+平台） | ✅ v1 |
| `bet` | 下注（玩家→牌桌虚拟钱包） | 🆕 v2 |
| `refund` | 异常退款（牌桌→玩家） | 🆕 v2 |
| `commission` | 代理佣金到账（牌桌→代理） | 🆕 v2 |

### 2.3 手续费池 `fee_pool` ✅ v1 保留

沉淀系统内所有摩擦损耗（转账 0.01% 手续费及房费平台净留存）。

| 字段名 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `pool_id` | VARCHAR(32) | PRIMARY KEY | 固定为主键 `platform_fee` |
| `balance` | BIGINT | NOT NULL, DEFAULT 0 | 平台累计沉淀手续费总额 |
| `updated_at` | BIGINT | NOT NULL | 毫秒时间戳 |

### 2.4 代理分佣表 `agents` ✅ v1 保留

记录代理上下级层级树与抽成比例分配。

| 字段名 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `agent_id` | VARCHAR(64) | PRIMARY KEY | 代理唯一标识（如 `agt_8801`） |
| `parent_id` | VARCHAR(64) | NULLABLE, INDEX | 直属上级代理ID（NULL 为顶级公会/大代） |
| `level` | INT | NOT NULL, DEFAULT 0 | 层级（0 = 直接开房代理，1 = 上级，2 = 上上级） |
| `r_ratio` | DECIMAL(6,4)| NOT NULL | 该代理级在返佣池中的分配比例（如 0.4000 表示 40%） |
| `commission_balance` | BIGINT | NOT NULL, DEFAULT 0 | 代理累计未提佣金筹码 |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'active' | 状态: `active`, `frozen` |

### 2.5 游戏对局流水表 `game_records` ✅ v1 保留 + 🔧 v2 扩展

记录德州扑克或棋牌对局的原始流水数据。

| 字段名 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `transaction_id` | VARCHAR(64) | PRIMARY KEY | 关联结算主交易流水号 |
| `room_id` | VARCHAR(64) | NOT NULL, INDEX | 游戏桌号/房间号 |
| `round_no` | INT | NOT NULL, DEFAULT 1 | 🆕 v2：第几局（从 1 开始） |
| `total_flow` | BIGINT | NOT NULL, > 0 | 本局总底池 / 总流水 S |
| `player_count` | INT | NOT NULL | 参与本局玩家总数 |
| `settlement_status` | VARCHAR(20) | NOT NULL | `pending`, `settled`, `failed` |
| `created_at` | BIGINT | NOT NULL | 牌局结束毫秒时间戳 |

### 2.6 结算分账明细 `settlement_logs` ✅ v1 保留

记录单局游戏抽水后各级代理与平台的明细分账。

| 字段名 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `settlement_id` | VARCHAR(64) | PRIMARY KEY | 分账日志唯一键 |
| `transaction_id` | VARCHAR(64) | NOT NULL, INDEX | 关联游戏对局交易流水号 |
| `agent_id` | VARCHAR(64) | NOT NULL, INDEX | 获佣代理ID |
| `level` | INT | NOT NULL | 代理层级 |
| `commission_amount` | BIGINT | NOT NULL | 该代理获得的佣金筹码 |
| `platform_revenue` | BIGINT | NOT NULL | 本笔对局中平台最终留存净利润 |
| `created_at` | BIGINT | NOT NULL | 记录时间戳 |

### 2.7 房间表 `rooms` 🆕 v2 新增

持久化房间配置，6 位数字房号 + 可选密码。

| 字段名 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `room_id` | VARCHAR(16) | PRIMARY KEY, INDEX | 6 位数字房号（随机生成 + 查重） |
| `room_name` | VARCHAR(64) | NULLABLE | 房间名称（可选） |
| `room_password` | VARCHAR(8) | NULLABLE, DEFAULT '' | 0-4 位数字密码，空为公开房 |
| `game_type` | VARCHAR(32) | NOT NULL, INDEX | 游戏类型: `texas_holdem`, `zha_jin_hua`, `niu_niu`, `san_gong` |
| `mode` | VARCHAR(32) | NOT NULL, DEFAULT 'cash' | 游戏模式: `cash`, `sng`, `抢庄`, `通比` |
| `total_rounds` | INT | NOT NULL, DEFAULT 10 | 总局数（4-32，0 表示无限局） |
| `base_score` | BIGINT | NOT NULL, DEFAULT 100 | 底分（最小下注单位） |
| `platform_fee_rate` | DECIMAL(6,4) | NOT NULL, DEFAULT 0.0500 | 平台抽水率（如 5% = 0.0500） |
| `agent_commission_rate` | DECIMAL(6,4) | NOT NULL, DEFAULT 0.0300 | 代理返佣率（如 3% = 0.0300） |
| `min_players` | INT | NOT NULL, DEFAULT 2 | 最低开局人数 |
| `max_players` | INT | NOT NULL, DEFAULT 6 | 最大人数 |
| `big_blind` | BIGINT | NULLABLE | 大盲注（德州专用） |
| `rake_cap_multiplier` | INT | NOT NULL, DEFAULT 5 | 抽水上限倍数（如 5 倍大盲注） |
| `created_by` | VARCHAR(64) | NOT NULL, INDEX | 创建者 ID（代理/房主） |
| `room_type` | VARCHAR(16) | NOT NULL, DEFAULT 'public' | 房间类型: `public`, `private` |
| `status` | VARCHAR(16) | NOT NULL, DEFAULT 'waiting', INDEX | 房间状态: `waiting`, `playing`, `finished` |
| `current_round` | INT | NOT NULL, DEFAULT 0 | 当前第几局 |
| `created_at` | BIGINT | NOT NULL | 创建时间戳 |
| `updated_at` | BIGINT | NOT NULL | 更新时间戳 |

### 2.8 房间玩家关联表 `room_players` 🆕 v2.1 新增

持久化玩家与房间的关联关系，支持服务器重启后恢复和断线重连。

| 字段名 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `room_id` | VARCHAR(16) | PRIMARY KEY, INDEX | 房间号，联合主键 |
| `user_id` | VARCHAR(64) | PRIMARY KEY, INDEX | 用户 ID，联合主键 |
| `seat_no` | INT | NOT NULL | 座位号（0 ~ max_seats-1） |
| `is_ready` | BOOLEAN | NOT NULL, DEFAULT false | 是否准备 |
| `joined_at` | BIGINT | NOT NULL | 加入时间（Unix 毫秒） |
| `left_at` | BIGINT | NULLABLE | 离开时间（NULL 表示仍在房间） |
| `status` | VARCHAR(16) | NOT NULL, DEFAULT 'sitting' | 状态: `sitting`, `left`, `kicked` |

**设计说明**：
- 联合主键 `(room_id, user_id)`：一个玩家在一个房间只有一条记录
- 玩家离开时不删除记录，而是更新 `status = 'left'` 和 `left_at`
- 支持断线重连：查询时过滤 `status = 'sitting'`
- 服务器重启后可从该表恢复所有进行中的房间和玩家

---

## 3. 核心业务数学模型

### 3.1 自由转账模型（扣除 0.01% 手续费）✅ v1

- 输入金额 $A$
- 费率 $R = 0.0001$（万分之一）
- 手续费 $F = \lfloor A \times 0.0001 \rfloor$（向下取整，不足 1 筹码则为 0）
- 到账净额 $A_{net} = A - F$
- 扣除支出方 $A$，增加接收方 $A_{net}$，增加 `fee_pool` $F$
- **能量守恒：** 支出方扣减量 = 接收方增加量 + 手续费增加量

### 3.2 下注扣款模型 🆕 v2

- 玩家下注金额 $B$
- 玩家钱包：$-B$
- 牌桌虚拟钱包（`room_{room_id}`）：$+B$
- 流水类型：`bet`
- **能量守恒：** 玩家 - B = 牌桌 + B（资金只是转移，总量不变）

### 3.3 游戏对局结算分水模型 ✅ v1 + 🔧 v2 扩展

- 本局总底池为 $S$（牌桌钱包余额）
- 平台抽水比例 $p$（例如 $p = 0.0500$，即 5%）
- 总房费抽水 $T_{fee} = \lfloor S \times p \rfloor$
- 🆕 v2 抽水上限：如果设置了 `rake_cap_multiplier`，则 $T_{fee} = \min(T_{fee}, big\_blind \times rake\_cap\_multiplier)$
- 赢家瓜分实得 $W_{pot} = S - T_{fee}$
- 代理总返佣比例 $a$（例如 $a = 0.0300$，必须满足 $a \le p$）
- 代理佣金总池 $C_{pool} = \lfloor S \times a \rfloor$
  - 🆕 v2 抽水上限生效时，代理返佣按比例缩放
- 平台最终净留存 $P_{rev} = T_{fee} - C_{pool}$
- 多级代理分账：代理链层级比例为 $[r_0, r_1, \dots, r_k]$，满足 $\sum r_i \le 1.0$
  - 各级佣金 $C_i = \lfloor C_{pool} \times r_i \rfloor$
  - 未分尽碎片归入平台留存 $P_{rev}$

### 3.4 异常退款模型 🆕 v2

- 退款总额 $R$
- 牌桌虚拟钱包：$-R$
- 各退款玩家钱包：$+r_i$（$\sum r_i = R$）
- 流水类型：`refund`
- **能量守恒：** 牌桌 - R = 玩家们 + R

### 3.5 能量守恒定律（系统硬约束）✅ v1 + 🔧 v2 扩展

$$\sum_{i} \text{balance}(\text{wallets}_i) + \text{balance}(\text{fee\_pool}) \equiv \sum_{\text{type=mint}} \text{amount}$$

v2 扩展说明：
- 牌桌虚拟钱包余额也算在 `wallets_i` 内
- 所有写操作（bet/refund/settle/transfer）都必须保证守恒
- 每笔操作后强制校验，不通过则回滚事务

---

## 4. v1 → v2 变更清单

### 4.1 新增表

| 表名 | 说明 |
| :--- | :--- |
| `rooms` | 房间管理表（6 位房号 + 游戏配置 + 局数控制） |

### 4.2 修改表

| 表名 | 变更内容 |
| :--- | :--- |
| `wallets` | `user_type` 新增 `room` 类型（牌桌虚拟钱包） |
| `transactions` | `type` 新增 `bet`, `refund`, `commission` 三种类型 |
| `game_records` | 新增 `round_no` 字段（第几局） |

### 4.3 保留不变

| 表名 | 说明 |
| :--- | :--- |
| `fee_pool` | 完全保留 v1 结构 |
| `agents` | 完全保留 v1 结构 |
| `settlement_logs` | 完全保留 v1 结构 |

---

## 5. 钱包 ID 生成规则 🆕 v2

| 用户类型 | wallet_id 格式 | 示例 |
| :--- | :--- | :--- |
| 玩家 | `w_player_{user_id}` | `w_player_player_alice` |
| 代理 | `w_player_{agent_id}` | `w_player_agent_root`（统一用 player 类型钱包） |
| 管理员 | `w_player_{admin_id}` | `w_player_admin_root` |
| 客服 | `w_player_{support_id}` | `w_player_support_01` |
| 牌桌 | `w_room_{room_id}` | `w_room_room_888888` |

**说明**：代理钱包统一使用 `w_player_{agent_id}` 格式，避免同一个 user_id 有两个钱包。

---

## 6. 业务规则定义 🆕 v2.1

### 6.1 中途加入规则

| 场景 | 规则 |
|------|------|
| 房间等待中 | 玩家直接入座，状态为 `ready` |
| 当前局进行中 | 玩家可以入座，状态为 `waiting`，等下一局开始自动变为 `ready` |
| 局数已满（finished） | 不允许加入 |

### 6.2 中途退出规则

| 场景 | 规则 |
|------|------|
| 未下注筹码 | 直接退回玩家钱包 |
| 已下注筹码 | 留在底池，不退还 |
| 退出后状态 | 房间玩家表更新为 `left` |

### 6.3 断线超时规则

| 场景 | 规则 |
|------|------|
| 断线时间 | 记录 `disconnect_time` |
| 重连 | 5 分钟内重连，恢复座位和状态 |
| 超时弃牌 | 超过 5 分钟未重连，自动标记为 `folded` |
| 已下注筹码 | 超时弃牌后留在底池，不退还 |

### 6.4 房间解散规则

| 场景 | 规则 |
|------|------|
| 游戏进行中 | 调用 `refundOnAbort` 退还所有玩家已下注但未结算的筹码 |
| 房间解散后 | 清理 `room_players` 表中该房间所有记录 |
| 房间状态 | 更新为 `finished` |

---

*文档版本：v2.1 | 更新日期：2026-09-18*

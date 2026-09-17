# 全局契约字典（数据字典 + API 规范）

> 平台定位：**封闭式虚拟经济系统**。筹码自由流通，无充提法币接口。管理员可铸币，用户间可互转（扣 0.01% 手续费），游戏结算时抽取房费并分给赢家和代理。

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

### 2.1 钱包表 `wallets`
存储所有系统角色（管理员、客服、代理、玩家）的筹码账户。

| 字段名 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `wallet_id` | VARCHAR(64) | PRIMARY KEY | 钱包唯一标识（如 `w_player_1001`） |
| `user_id` | VARCHAR(64) | UNIQUE, NOT NULL | 关联唯一用户ID |
| `user_type` | VARCHAR(20) | NOT NULL | 角色类型: `admin`, `support`, `agent`, `player` |
| `balance` | BIGINT | NOT NULL, >= 0 | 可用筹码余额（整数），禁止为负数 |
| `frozen_balance` | BIGINT | NOT NULL, DEFAULT 0 | 冻结筹码（如牌桌在局押注或异常冻结） |
| `updated_at` | BIGINT | NOT NULL | 最后更新毫秒时间戳 |

### 2.2 流水账本 `transactions`
系统唯一真实账本（Single Source of Truth），所有金额变动必须落地于此。

| 字段名 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `transaction_id` | VARCHAR(64) | PRIMARY KEY | 全局唯一交易流水号，幂等键 |
| `from_wallet_id` | VARCHAR(64) | NULLABLE | 支出方钱包ID（铸币/系统发奖时为空） |
| `to_wallet_id` | VARCHAR(64) | NOT NULL | 接收方钱包ID |
| `amount` | BIGINT | NOT NULL, > 0 | 交易实际到达接收方的净金额或转账基数 |
| `fee` | BIGINT | NOT NULL, DEFAULT 0 | 本笔交易产生的手续费 |
| `fee_recipient` | VARCHAR(64) | NOT NULL, DEFAULT 'platform_fee' | 手续费归集账户标识 |
| `type` | VARCHAR(32) | NOT NULL | 类型: `mint`（铸币）, `transfer`（转账）, `game_settle`（游戏结算） |
| `status` | VARCHAR(20) | NOT NULL | 状态: `pending`, `success`, `failed` |
| `remark` | TEXT | NULLABLE | 交易业务附言/审计说明 |
| `created_at` | BIGINT | NOT NULL | 交易创建毫秒时间戳 |

### 2.3 手续费池 `fee_pool`
沉淀系统内所有摩擦损耗（转账 0.01% 手续费及房费平台净留存）。

| 字段名 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `pool_id` | VARCHAR(32) | PRIMARY KEY | 固定为主键 `platform_fee` |
| `balance` | BIGINT | NOT NULL, DEFAULT 0 | 平台累计沉淀手续费总额 |
| `updated_at` | BIGINT | NOT NULL | 毫秒时间戳 |

### 2.4 代理分佣表 `agents`
记录代理上下级层级树与抽成比例分配。

| 字段名 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `agent_id` | VARCHAR(64) | PRIMARY KEY | 代理唯一标识（如 `agt_8801`） |
| `parent_id` | VARCHAR(64) | NULLABLE | 直属上级代理ID（NULL 为顶级公会/大代） |
| `level` | INT | NOT NULL, DEFAULT 0 | 层级（0 = 直接开房代理，1 = 上级，2 = 上上级） |
| `r_ratio` | DECIMAL(6,4)| NOT NULL | 该代理级在返佣池中的分配比例（如 0.4000 表示 40%） |
| `commission_balance` | BIGINT | NOT NULL, DEFAULT 0 | 代理累计未提佣金筹码 |
| `status` | VARCHAR(20) | NOT NULL, DEFAULT 'active' | 状态: `active`, `frozen` |

### 2.5 游戏对局流水表 `game_records`
记录德州扑克或棋牌对局的原始流水数据。

| 字段名 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `transaction_id` | VARCHAR(64) | PRIMARY KEY | 关联结算主交易流水号 |
| `room_id` | VARCHAR(64) | NOT NULL | 游戏桌号/房间号 |
| `total_flow` | BIGINT | NOT NULL, > 0 | 本局总底池 / 总流水 S |
| `player_count` | INT | NOT NULL | 参与本局玩家总数 |
| `settlement_status` | VARCHAR(20) | NOT NULL | `pending`, `settled`, `failed` |
| `created_at` | BIGINT | NOT NULL | 牌局结束毫秒时间戳 |

### 2.6 结算分账明细 `settlement_logs`
记录单局游戏抽水后各级代理与平台的明细分账。

| 字段名 | 类型 | 约束 | 说明 |
| :--- | :--- | :--- | :--- |
| `settlement_id` | VARCHAR(64) | PRIMARY KEY | 分账日志唯一键 |
| `transaction_id` | VARCHAR(64) | NOT NULL, INDEX | 关联游戏对局交易流水号 |
| `agent_id` | VARCHAR(64) | NOT NULL | 获佣代理ID |
| `level` | INT | NOT NULL | 代理层级 |
| `commission_amount` | BIGINT | NOT NULL | 该代理获得的佣金筹码 |
| `platform_revenue` | BIGINT | NOT NULL | 本笔对局中平台最终留存净利润 |
| `created_at` | BIGINT | NOT NULL | 记录时间戳 |

---

## 3. 核心业务数学模型

### 3.1 自由转账模型（扣除 0.01% 手续费）
- 输入金额 $A$
- 费率 $R = 0.0001$（万分之一）
- 手续费 $F = \lfloor A \times 0.0001 \rfloor$（向下取整，不足 1 筹码则为 0）
- 到账净额 $A_{net} = A - F$
- 扣除支出方 $A$，增加接收方 $A_{net}$，增加 `fee_pool` $F$
- **能量守恒：** 支出方扣减量 = 接收方增加量 + 手续费增加量

### 3.2 游戏对局结算分水模型
- 本局总底池为 $S$
- 平台抽水比例 $p$（例如 $p = 0.0500$，即 5%）
- 总房费抽水 $T_{fee} = \lfloor S \times p \rfloor$
- 赢家瓜分实得 $W_{pot} = S - T_{fee}$
- 代理总返佣比例 $a$（例如 $a = 0.0300$，必须满足 $a \le p$）
- 代理佣金总池 $C_{pool} = \lfloor S \times a \rfloor$
- 平台最终净留存 $P_{rev} = T_{fee} - C_{pool}$
- 多级代理分账：代理链层级比例为 $[r_0, r_1, \dots, r_k]$，满足 $\sum r_i \le 1.0$
  - 各级佣金 $C_i = \lfloor C_{pool} \times r_i \rfloor$
  - 未分尽碎片归入平台留存 $P_{rev}$

### 3.3 能量守恒定律（系统硬约束）
$$\sum_{i} \text{balance}(\text{wallets}_i) + \text{balance}(\text{fee\_pool}) \equiv \sum_{\text{type=mint}} \text{amount}$$
任何转账、游戏结算、代理分润均不得产生或消灭哪怕 1 枚微筹。任何微小差额即刻触发系统熔断与报警！

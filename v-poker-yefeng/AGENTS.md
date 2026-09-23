# v-poker-yefeng 项目开发规范

## 项目概述
封闭式虚拟经济棋牌微服务平台。筹码自由流通，无充提法币接口。
资金闭环：铸币 → 下注 → 结算分账 → 异常退款，全程能量守恒。

---

## 项目架构

### 微服务端口
| 服务 | 端口 | 技术栈 |
|---|---|---|
| wallet_service | 8001 | Python FastAPI + Async SQLAlchemy |
| commission_service | 8000 | Python FastAPI + Async SQLAlchemy |
| game-engine | 8003 | Node.js Hono.js + WebSocket |
| bff | 4000 | Node.js Hono.js |
| admin-dashboard | 8088 | 管理端 |
| Metabase | 3030 | 数据看板 |

### 目录结构
```
v-poker-yefeng/
├── wallet_service/          # 钱包微服务
│   ├── app/
│   │   ├── main.py          # 入口
│   │   ├── config.py       # 配置
│   │   ├── database.py      # 数据库连接
│   │   ├── models.py        # SQLAlchemy 模型
│   │   ├── schemas.py       # Pydantic 请求/响应
│   │   ├── crud.py          # 数据库操作
│   │   ├── wallet_engine.py # 核心业务逻辑
│   │   └── routers/         # API 路由
│   └── tests/
├── commission_service/       # 代理返佣微服务
├── game-engine/             # 游戏引擎
│   └── src/
│       ├── core/           # 核心框架（状态机/房间管理/动作路由）
│       ├── bridge/         # 下游服务桥接
│       ├── games/          # 游戏插件
│       └── shared/          # 共享类型
├── bff/                     # BFF 聚合层
│   └── src/
│       ├── auth/            # 认证
│       ├── admin/          # 管理端路由
│       ├── agent/           # 代理端路由
│       └── support/         # 客服端路由
├── agent-dashboard/         # 代理端后台
├── support-dashboard/       # 客服端后台
└── database/               # 数据库初始化 SQL
```

---

## 全局契约字典（铁律）

### 命名规范
- 字段命名：snake_case（小写+下划线）
- 金额单位：整数（筹码最小单位），禁止浮点
- 比例：小数，保留 4 位（如 3% = 0.0300）
- 时间：Unix 毫秒时间戳（bigint）
- ID：字符串（string），避免 JS 精度丢失
- API 响应：统一 `{ code, message, data }`

### 核心数据表
- `wallets`: 钱包表（player/agent/room/admin/support）
- `transactions`: 流水账本（mint/transfer/bet/refund/game_settle）
- `fee_pool`: 手续费池
- `agents`: 代理表（层级返佣）
- `game_records`: 游戏流水
- `settlement_logs`: 结算分账明细

### 资金流模型
- 牌桌虚拟钱包：`user_id = room_{room_id}`, `user_type = "room"`
- 下注：玩家钱包 → 牌桌钱包
- 结算：牌桌钱包 → 赢家 + fee_pool + 代理钱包
- 退款：牌桌钱包 → 玩家钱包
- 守恒公式：`sum_all_wallets + sum_fee_pool == total_minted`

---

## 代码规范

### Python (FastAPI)
- 所有路由使用 APIRouter，挂载到 `app/main.py`
- 数据模型：SQLAlchemy 2.0 声明式模型，放在 `app/models.py`
- 请求/响应：Pydantic v2，放在 `app/schemas.py`
- 业务逻辑：放在 `app/*_engine.py`，路由只做参数校验和调用
- 数据库操作：全部 async，使用 AsyncSession
- 金额：全程 Decimal，禁止浮点
- 幂等：所有写操作必须校验 transaction_id 唯一性
- 错误：统一返回 `{ code, message, data }`，用 HTTPException 包装
- 注释：中文，每个函数说明用途、输入、输出

### TypeScript (Hono / game-engine)
- 路由：Hono 的 `app.route()`，按模块拆分到 `src/*/index.ts`
- 类型：严格模式，所有接口有明确类型定义
- 桥接：调用下游微服务统一走 `bridge/*Client.ts`
- 游戏插件：实现 GamePlugin 接口，放在 `games/{game_type}/`
- 中间件：认证、日志、CORS 统一在入口配置

### 测试规范
- Python：pytest，放在 `tests/` 目录
- TypeScript：vitest，放在 `src/tests/` 目录
- 测试必须覆盖：正常流程、异常分支、幂等校验、边界条件

---

## 禁止事项
- ❌ 禁止生成法币充值/提现接口
- ❌ 禁止在前端直接连接底层微服务，必须走 BFF
- ❌ 禁止用 mock 数据替代真实服务调用
- ❌ 禁止省略代码（不要写"此处省略"）
- ❌ 禁止用浮点计算金额
- ❌ 禁止在转账/结算时不做能量守恒校验

---

## 开发流程
1. 需求解析：明确目标、输入、边界
2. 方案规划：输出技术方案和文件规划
3. 分步实施：按 STEP 协议，每步标注工具
4. 编码输出：完整可运行代码，含异常捕获和参数校验
5. 验证环节：单元测试 + 集成测试
6. 交付输出：完整交付物清单 + 部署步骤

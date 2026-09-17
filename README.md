# 封闭式虚拟经济系统棋牌平台微服务架构

基于 Python FastAPI、SQLAlchemy 异步 ORM、Node.js Hono BFF 与开源德州扑克引擎 (`lhz960904/texas-holdem`) 深度集成的全套微服务系统。

---

## 🏛️ 系统架构全景

```text
poker-platform/
├── docker-compose.yml                  # 容器编排 (一键启动所有微服务与后台)
├── README.md                           # 架构设计、部署启动与端到端测试指南
├── docs/
│   └── schema.md                       # 全局契约字典 (数据字典 + API 规范)
│
├── wallet_service/                     # ★ 钱包微服务 (Python FastAPI + Async SQLAlchemy)
│   ├── app/
│   │   ├── config.py                   # 环境变量与费率配置
│   │   ├── database.py                 # SQLite 异步连接池与会话
│   │   ├── models.py                   # wallets, transactions, fee_pool, agents...
│   │   ├── schemas.py                  # Pydantic 严格校验模型
│   │   ├── crud.py                     # 原子化 CRUD 操作
│   │   ├── wallet_engine.py            # 铸币/转账(0.01%)/对局结算/能量守恒
│   │   ├── routers/
│   │   │   ├── wallet.py               # /api/wallet/mint, transfer, game_settle, balance...
│   │   │   └── audit.py                # /api/wallet/audit (能量守恒对账)
│   │   └── main.py                     # FastAPI 启动入口 (Port 8001)
│   ├── tests/
│   │   └── test_wallet.py              # 完整 pytest-asyncio 测试用例
│   ├── requirements.txt
│   └── Dockerfile
│
├── commission_service/                 # 结算微服务 (Python FastAPI)
│   ├── app/
│   │   ├── models.py                   # 代理树与返佣明细
│   │   ├── schemas.py
│   │   ├── crud.py
│   │   ├── settlement_engine.py        # 层级返佣级联分账计算
│   │   ├── routers/ (settle.py, agent.py)
│   │   └── main.py                     # FastAPI 启动入口 (Port 8000)
│   ├── requirements.txt
│   └── Dockerfile
│
├── bff/                                # BFF 聚合层 (Node.js + Hono)
│   ├── src/
│   │   ├── index.ts                    # Hono 服务入口 (Port 4000)
│   │   ├── auth/                       # 角色中间件
│   │   ├── agent/                      # /api/agent/* -> 代理后台专用 API
│   │   ├── support/                    # /api/support/* -> 客服全息检索 API
│   │   └── admin/                      # /api/admin/* -> 总控指标与铸币 API
│   ├── package.json
│   └── Dockerfile
│
├── packages/                           # 德州扑克开源引擎集成
│   └── server/
│       └── bridge/
│           ├── settlementClient.ts     # 桥接客户端 (自动幂等重试、调用 /game_settle)
│           └── gameStateMachineExample.ts # 德扑一局结算节点调用示范
│
├── agent-dashboard/                    # 代理后台 (Refine React)
├── support-dashboard/                  # 客服后台 (UVdesk 配置)
├── admin-dashboard/                    # 管理后台 (FastAPI-Admin)
├── database/
│   └── init.sql                        # 全量 DDL 建表与初始种子数据
└── dashboard/
    └── metabase-setup.md               # Metabase BI 看板 SQL 与守恒报警配置
```

---

## ⚡ 核心业务规则与能量守恒

1. **绝对封闭式经济体**：无任何法币充值与提现接口，筹码只能通过管理员审计铸造 (`POST /api/wallet/mint`)。
2. **万分之一自由转账**：用户间转账 `POST /api/wallet/transfer` 扣除 `0.01%` 手续费（向下取整）：
   $$\text{fee} = \lfloor \text{amount} \times 0.0001 \rfloor$$
   手续费自动沉淀进 `fee_pool`，确保转出方扣减额等于接收方增加额与手续费之和。
3. **牌桌房费抽水与返佣**：
   - 房费抽水：$\text{total\_rake} = \lfloor S \times p \rfloor$
   - 赢家实得：$\text{payout} = S - \text{total\_rake}$
   - 代理返佣池：$\text{agent\_pool} = \lfloor S \times a \rfloor$
   - 平台留存：$\text{platform\_revenue} = \text{total\_rake} - \text{agent\_pool}$
   - 代理层级分摊：$c_i = \lfloor \text{agent\_pool} \times r_i \rfloor$
4. **能量守恒公理 (Energy Conservation)**：
   $$\sum \text{wallets.balance} + \text{fee\_pool.balance} \equiv \sum \text{minted\_amount}$$

---

## 🚀 启动与测试指南

### 1. 一键启动所有服务 (Docker Compose)
```bash
docker-compose up --build -d
```
启动后服务端口：
- 钱包微服务：`http://localhost:8001` (Swagger 文档位于 `/docs`)
- 结算微服务：`http://localhost:8000` (Swagger 文档位于 `/docs`)
- BFF 聚合层：`http://localhost:4000`
- 管理员后台：`http://localhost:8088`
- Metabase BI 监控：`http://localhost:3030`

### 2. 运行端到端单元与集成测试 (Pytest)
```bash
cd wallet_service
pip install -r requirements.txt
pytest tests/test_wallet.py -v
```

测试覆盖：
-  **用例 1**：管理员铸币 1,000,000 筹码到 Alice 账户。
-  **用例 2**：Alice 向 Bob 自由转账 200,000 筹码，精确扣减 20 筹码 (0.01%) 手续费入池。
-  **用例 3**：德扑牌桌游戏结算 (100,000 底池，5% 平台抽水，3% 代理池，分账给三级代理树)。
-  **用例 4**：严格幂等拦截 (相同 `transaction_id` 重复提交拦截)。
-  **用例 5**：全局资产能量守恒对账 (`GET /api/wallet/audit` 返回 `difference == 0`)。

---

## 📡 关键 API 契约调用示例

### 1. 管理员铸币
```bash
curl -X POST http://localhost:8001/api/wallet/mint \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "tx_mint_001",
    "admin_user_id": "u_admin_root",
    "target_user_id": "p_alice",
    "amount": 1000000,
    "remark": "Initial test bankroll"
  }'
```

### 2. 用户自由转账
```bash
curl -X POST http://localhost:8001/api/wallet/transfer \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "tx_tf_001",
    "from_user_id": "p_alice",
    "to_user_id": "p_bob",
    "amount": 200000,
    "remark": "Chip loan"
  }'
```

### 3. 游戏结算分账
```bash
curl -X POST http://localhost:8001/api/wallet/game_settle \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "tx_settle_table01_h1",
    "room_id": "room_888",
    "total_pot": 100000,
    "player_count": 6,
    "winners": [{"user_id": "p_charlie", "weight": 1}],
    "platform_fee_rate": "0.0500",
    "agent_commission_rate": "0.0300",
    "room_agent_id": "agt_room_03"
  }'
```

### 4. 能量守恒对账审计
```bash
curl http://localhost:8001/api/wallet/audit
```
响应：
```json
{
  "code": 0,
  "message": "Energy conserved: System in balance.",
  "data": {
    "total_minted": 1000000,
    "wallets_balance_sum": 999980,
    "fee_pool_balance": 20,
    "total_system_assets": 1000000,
    "difference": 0,
    "is_conserved": true,
    "wallets_count": 2,
    "audit_time": 1726531200000
  }
}
```

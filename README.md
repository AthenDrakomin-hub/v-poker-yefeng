# 封闭式虚拟经济系统棋牌平台微服务架构

基于 Python FastAPI、SQLAlchemy 异步 ORM、Node.js Hono BFF 与自研多游戏引擎（德州扑克/炸金花/牛牛/三公）的全套微服务系统。

---

## 系统架构

```text
poker-platform/
├── docker-compose.yml                  # 容器编排 (一键启动所有微服务与后台)
├── README.md
├── docs/
│   └── schema.md                       # 全局契约字典 (数据字典 + API 规范)
│
├── wallet_service/                     # ★ 钱包微服务 (Python FastAPI + Async SQLAlchemy)
│   ├── app/
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── models.py                   # wallets, transactions, fee_pool, agents, game_records, settlement_logs
│   │   ├── schemas.py                  # Pydantic 严格校验模型
│   │   ├── crud.py
│   │   ├── wallet_engine.py            # 铸币/转账(0.01%)/对局结算/能量守恒
│   │   ├── routers/
│   │   │   ├── wallet.py              # /api/wallet/mint, transfer, game_settle, balance, transactions
│   │   │   └── audit.py               # /api/wallet/audit (能量守恒对账)
│   │   └── main.py                     # FastAPI 启动入口 (Port 8001)
│   ├── tests/
│   │   └── test_wallet.py
│   ├── requirements.txt
│   └── Dockerfile
│
├── commission_service/                  # 结算微服务 (Python FastAPI)
│   ├── app/
│   │   ├── models.py                  # agents, settlement_logs
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
│   │   ├── agent/                      # /api/agent/* -> 代理后台 API
│   │   ├── support/                    # /api/support/* -> 客服检索 API
│   │   ├── admin/                      # /api/admin/* -> 总控指标与铸币 API
│   │   └── debug/                      # /__debug/* -> 开发调试与真反向代理
│   ├── package.json
│   └── Dockerfile
│
├── game-engine/                        # ★ 多游戏引擎 (Node.js + Hono)
│   ├── src/
│   │   ├── index.ts                    # Hono 入口 (Port 8003)
│   │   ├── core/                       # roomManager, actionRouter, stateMachine, seatManager, eventBus
│   │   ├── games/                      # texas_holdem, zha_jin_hua, niu_niu, san_gong
│   │   ├── bridge/                     # walletClient.ts (桥接 wallet-service)
│   │   └── shared/types.ts
│   ├── package.json
│   └── Dockerfile
│
├── packages/server/bridge/             # 开源引擎桥接示例
│   ├── settlementClient.ts
│   └── gameStateMachineExample.ts
│
├── agent-dashboard/                    # 代理后台 (Refine React)
├── support-dashboard/                  # 客服后台 (UVdesk 配置)
├── admin-dashboard/                    # 管理后台 (FastAPI-Admin)
├── database/
│   └── init.sql                        # 全量 DDL 建表与初始种子数据
└── dashboard/
    └── metabase-setup.md               # Metabase BI 看板配置
```

---

## 核心业务规则与能量守恒

1. **绝对封闭式经济体**：无法币充值与提现接口，筹码只能通过管理员铸币 (`POST /api/wallet/mint`)。
2. **万分之一自由转账**：用户间转账扣除 `0.01%` 手续费（向下取整），手续费沉淀进 `fee_pool`。
3. **牌桌房费抽水与返佣**：
   - 房费抽水：`total_rake = floor(S * p)`
   - 赢家实得：`winners_payout = S - total_rake`
   - 代理返佣池：`agent_pool = floor(S * a)`
   - 平台留存：`platform_revenue = total_rake - agent_pool`
4. **能量守恒公理**：`sum(wallets.balance) + fee_pool.balance == sum(minted_amount)`

---

## 启动与测试

### 一键启动所有服务

```bash
docker-compose up --build -d
```

启动后服务端口：
- 钱包微服务：`http://localhost:8001` (Swagger `/docs`)
- 结算微服务：`http://localhost:8000` (Swagger `/docs`)
- BFF 聚合层：`http://localhost:4000`
- 游戏引擎：`http://localhost:8003`
- 管理后台：`http://localhost:8088`
- Metabase BI：`http://localhost:3030`

### 运行测试

```bash
cd wallet_service
pip install -r requirements.txt
pytest tests/test_wallet.py -v
```

---

## 关键 API 契约

### 管理员铸币

```bash
curl -X POST http://localhost:8001/api/wallet/mint \
  -H "Content-Type: application/json" \
  -H "X-Internal-Auth-Key: change-me-in-prod" \
  -d '{
    "transaction_id": "tx_mint_001",
    "admin_user_id": "u_admin_root",
    "target_user_id": "p_alice",
    "amount": 1000000,
    "remark": "Initial bankroll"
  }'
```

### 用户自由转账

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

### 游戏结算分账

```bash
curl -X POST http://localhost:8001/api/wallet/game_settle \
  -H "Content-Type: application/json" \
  -d '{
    "transaction_id": "tx_settle_table01_h1",
    "room_id": "room_888",
    "total_pot": 100000,
    "winner_ids": ["p_charlie"],
    "platform_fee_rate": "0.0500",
    "agent_commission_rate": "0.0300",
    "agent_ids": ["agt_room_03", "agt_sub_02", "agt_top_01"]
  }'
```

### 能量守恒对账

```bash
curl http://localhost:8001/api/wallet/audit
```

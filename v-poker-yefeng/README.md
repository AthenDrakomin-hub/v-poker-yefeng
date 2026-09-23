# V-POKER —— 金樽俱乐部

> 一手牌·一世界

封闭式虚拟经济系统扑克俱乐部平台，四端架构（玩家/代理/客服/管理），筹码唯一货币，无法币接口。

---

## 系统架构

```text
┌─────────────┬─────────────┬─────────────┬─────────────┐
│  玩家端      │  代理端      │  客服端      │  管理端      │
│  uni-app-x   │  React 19   │  React 19   │  React 19   │
│  (Android)   │  Vite       │  Vite       │  Vite       │
└──────┬───────┴──────┬──────┴──────┬──────┴──────┬──────┘
       │              │             │             │
       └──────────────┴─────────────┴─────────────┘
                           │
                    ┌──────▼──────┐
                    │   BFF 层    │  Node.js + Hono :4000
                    │  (API聚合)  │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼────┐ ┌───▼─────┐
        │wallet-service│ │game-  │ │commiss- │
        │FastAPI :8001│ │engine  │ │ion svc  │
        │              │ │:8003   │ │:8000    │
        └─────┬─────┘ └───┬────┘ └─────────┘
              │            │
        ┌─────▼────────────▼─────┐
        │    PostgreSQL 16       │
        └─────────────────────────┘
```

---

## 四端业务流程

### 一、玩家端（v-poker / uni-app-x / Android）

**品牌定位：** V-POKER 金樽俱乐部高端玩家客户端

```
启动页 → 登录/注册 → 大厅
  ├─ 房间列表 → 选房加入 → 牌桌(德州/炸金花/牛牛/三公)
  ├─ 我的房间 → 进行中/已结束
  ├─ 钱包 → 余额 + 转赠筹码(0.1%手续费) + 流水
  ├─ 个人中心
  │   ├─ 个人战绩 (总对局/胜率/盈利/最佳牌型/连胜)
  │   ├─ 好友 (列表/添加/邀请)
  │   ├─ 排行榜 (周/月/总榜)
  │   ├─ 成就墙 (8种成就解锁状态)
  │   ├─ 玩法规则
  │   └─ 消息中心
  └─ 设置
```

**24 个页面：**
splash / login / register / hall / room-list / create-room / my-rooms / wallet / profile / setting / stats / friend / rank / achievement / rules / message / table-texas / table-zhajinhua / table-niuniu / table-sangong / agent / error / dev / flow

---

### 二、代理端（agent-dashboard / React 19 + Vite）

**定位：** 代理分销管理后台

```
登录(角色校验agent) → 侧边栏导航
  ├─ 仪表盘 → 累计佣金/下级数/总流水/房间数
  ├─ 我的房间 → 房间列表 + 创建房间弹窗(4种游戏)
  ├─ 筹码转账 → 代理→玩家(收0.1%手续费)
  ├─ 佣金明细 → 佣金记录表
  ├─ 结算记录 → 结算周期表
  └─ 下级代理 → 代理列表
```

---

### 三、客服端（support-dashboard / React 19 + Vite）

**定位：** 客服工单与玩家服务后台

```
登录(角色校验support) → 侧边栏导航
  ├─ 仪表盘 → 工单统计
  ├─ 筹码转账 → 客服→代理(收0.1%手续费)
  ├─ 工单列表 → 工单详情
  │   ├─ 聊天记录查看
  │   ├─ 回复输入框(发送)
  │   ├─ 标记已解决
  │   └─ 办理退款
  └─ 玩家查询 → 输入ID搜索
      ├─ 玩家档案(ID/余额/工单数)
      ├─ 余额(独立API查询)
      └─ 交易流水(最近20条)
```

---

### 四、管理端（admin-dashboard / React 19 + Vite）

**定位：** 全局运营管理后台

```
登录(角色校验admin) → 侧边栏导航
  ├─ 数据概览 → 总用户/总房间/总钱包/总交易
  ├─ 筹码增发 → 输入玩家ID+金额+备注 → 确认增发(无手续费)
  ├─ 房间管理 → 全部房间监控表
  ├─ 资金审计 → 铸币量/钱包余额和/手续费池/差额
  ├─ 代理管理 → 代理列表 + 新增代理(用户名+密码)
  └─ 交易流水 → 全局交易记录表
```

---

## 筹码流转模型

```
管理端 mint（铸币·无手续费）
  ↓
客服端 余额
  ├─ 转账 → 代理（收0.1%手续费）
  ↓
代理端 余额
  ├─ 转账 → 玩家（收0.1%手续费）
  ↓
玩家端 余额
  ├─ 转账 → 玩家（收0.1%手续费）
  └─ 转账 → 代理（收0.1%手续费）
```

**筹码守恒公式（系统硬约束）：**
```
SUM(wallets.balance) + SUM(fee_pool.balance) = SUM(transactions.amount WHERE type='mint')
```

**手续费规则：**
- 管理端 mint 铸币：无手续费
- 所有转账（客服→代理、代理→玩家、玩家→玩家、玩家→代理）：统一 0.1%，由后端环境变量控制
- 手续费归入 `fee_pool` 平台手续费池

---

## 技术栈

| 层 | 技术 |
|---|---|
| 玩家端 | uni-app-x (Vue 3 + UTS) / 目标 Android |
| 代理/客服/管理端 | React 19 + Vite + Tailwind CSS |
| BFF 聚合层 | Node.js + Hono / Port 4000 |
| 钱包服务 | Python FastAPI + Async SQLAlchemy / Port 8001 |
| 游戏引擎 | Python FastAPI / Port 8003 |
| 结算服务 | Python FastAPI / Port 8000 |
| 数据库 | PostgreSQL 16 |

---

## 快速启动

```bash
# 1. 数据库初始化
psql -U postgres -f database/init.sql

# 2. 启动微服务
docker-compose up -d

# 3. BFF 开发
cd bff && npm install && npm run dev

# 4. 玩家端开发（HBuilder X 打开 v-poker/）

# 5. Dashboard 开发
cd agent-dashboard && npm install --legacy-peer-deps && npm run dev
cd support-dashboard && npm install --legacy-peer-deps && npm run dev
cd admin-dashboard && npm install --legacy-peer-deps && npm run dev
```

---

## API 文档

详见 [docs/API.md](docs/API.md)

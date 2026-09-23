# 棋牌平台 → uni-app x 蒸汽模式(vapor) 迁移计划

> 依据：`方案.txt`（通信层设计）、`v-poker-yefeng/docs/FRONTEND_CONTRACT.md`（后端契约）、官方 `uniapptox.md`（uni-app→uni-app x 12 步指南）、`app-vapor.md`（蒸汽模式约束）。
> 落点工程：`C:/Users/88903/Desktop/v-poker/v-poker`（已是蒸汽模式，`manifest.json → uni-app-x.vapor: true`）。

---

## 一、目标与已确认决策

| 项 | 决策 |
|---|---|
| 源工程 | `棋牌平台`（uni-app Vue3 VDOM H5，26 页 / 9 组件 / 手写单例 store / mock 数据 / 无 WS） |
| 落点 | 复用现有 `v-poker` 蒸汽工程（保留 UTS 德州引擎、7 个 `vp-*` 组件、设计 token） |
| 后端 | `v-poker-yefeng`：BFF HTTP `http://localhost:4000` + game-engine WS `ws://localhost:8003/ws`（生产 `https://goodspage.cn` / `wss://goodspage.cn/ws`） |
| 通信层 | 删除现有 uniCloud 云对象 + 1.5s 轮询，改为 UTS 版 HTTP(BFF) + WebSocket(game-engine) |
| 玩法 | 对齐后端 4 种：`texas_holdem` / `zha_jin_hua` / `niu_niu` / `san_gong`；删除「通比牛牛」「通比三公」 |
| 无契约页面 | **全删**：`pay`、`withdraw`（契约与 AGENTS.md 禁止法币充提）、`messages`、`invite`、`gift`、`service`、`records` |
| 屏幕方向 | **全部横屏**，`globalStyle.pageOrientation: "landscape"`（与源工程一致；uni-app x 支持 Android 4.13+/iOS 4.25+） |
| 范围 | 全部保留页面一次性迁移 |

**不可违反的契约**：字段 `snake_case`；金额整数（禁浮点）；时间 Unix 毫秒；ID 字符串；响应 `{code,message,data}` 且 `code===0` 成功；HTTP 全走 BFF、WS 直连 game-engine；资金零前端计算。

---

## 二、蒸汽模式硬约束（编码红线）

1. 仅组合式 API，**不支持选项式 / mixin**。
2. CSS 仅支持**简单 class 选择器 + 分组选择器**；不支持后代/子代/兄弟/ID/属性/伪类/伪元素（App 端）。App 蒸汽模式支持 `page` 选择器。SCSS 可编译期使用，但产物仍需满足该约束。
3. **样式隔离策略 2.0**：组件默认 `isolated`（不能引用全局/页面 class），页面默认 `app`（可引用全局）。源工程样式全为全局非 scoped → 组件必须自持样式或 `defineOptions({ styleIsolation })` / `externalClasses`。
4. 单位只用 `px / rpx / %`（`line-height` 可用 `em`）；App 不支持 `calc()`、`filter`、`backdrop-filter`。
5. 文本必须包在 `<text>`，样式不从父继承。
6. 布局仅 flex（源工程 7 处 CSS Grid 需改 flex）。
7. 拍平(flatten)元素不支持事件 / `z-index` / `animation` / `inset` box-shadow → 交互元素禁用 flatten。
8. UTS：无 `undefined`、无 `interface`（用 `type`）、无 utility types；动态 JSON 用 `UTSJSONObject`。
9. Android 蒸汽模式业务逻辑跑 **V8 且禁用 ICU**：`Intl.*`、`toLocaleString()` 等不可用（沿用现有 `utils/format.uts` 手写格式化）。

---

## 三、目标目录结构

标注：`[保留]` 现有资产 / `[改写]` 现有需改 / `[新建]` / `[迁移]` 来自源工程 / `[删除]`

```
v-poker/
├─ App.uvue                                [改写] 去 uniIdPagesInit；全局 class + 设计 token
├─ main.uts                                [保留] createSSRApp + createPinia
├─ manifest.json                           [改写] 补 uni-app-x.vapor/styleIsolationVersion、横屏、超时
├─ pages.json                              [改写] 18 页路由 + globalStyle.pageOrientation: landscape
├─ uni.scss                                [改写] @import "@/styles/tokens/index.scss"
├─ config/env.uts                          [新建] ← 源 config/index.js（条件编译改写）
├─ utils/
│  ├─ http/client.uts                      [新建] ← 方案.txt utils/http/client.ts
│  ├─ http/types.uts                       [新建] ← 方案.txt types.ts（type 化）
│  ├─ http/api/{auth,room,wallet,agent,admin,support}.uts   [新建]
│  ├─ ws/client.uts                        [新建] ← 方案.txt utils/ws/client.ts
│  ├─ ws/protocol.uts                      [新建] ← 方案.txt protocol.ts
│  ├─ storage.uts                          [新建] token/userId/role 读写
│  ├─ format.uts / ids.uts / audio.uts     [保留]
│  ├─ request.uts                          [删除] 云对象响应类型
│  └─ realtime.uts                         [删除] 轮询器
├─ store/
│  ├─ index.uts                            [新建] Pinia 实例
│  ├─ auth.uts                             [新建] ← 源 stores/user.js
│  ├─ lobby.uts                            [新建] 房间列表/创建/加入
│  ├─ wallet.uts                           [改写] 去云对象，走 HTTP
│  ├─ room.uts                             [改写] 轮询 → WS（核心）
│  ├─ agent.uts                            [新建] 代理仪表盘
│  └─ user.uts                             [删除] uniCloud 版
├─ game/{types,deck,evaluator,engine,pot,index}.uts   [保留] 本地 UTS 引擎（调试/校验用）
├─ styles/tokens/*.scss                    [迁移] _color/_typography/_spacing/_shape/index（_responsive 改写去 calc）
├─ components/                             （见第五节）
├─ pages/                                  （见第四节）
├─ static/                                 [保留] + 迁移 棋牌平台/assets/generated/*.png
├─ test/golden-vectors.uts                 [保留]
├─ uniCloud-aliyun/                        [删除] 不再需要
└─ uni_modules/uni-id-pages-x 等           [停用] 阶段 0 清除引用后再决定是否删目录
```

---

## 四、页面映射表（源 26 页 → 目标 18 页）

| 目标 .uvue | 来源 | 后端接口 / WS 消息 | 处理要点 |
|---|---|---|---|
| `pages/splash/splash.uvue` | splash | 无 | 移除 `api.health` 探测，改本地计时；按 token 落地 |
| `pages/login/login.uvue` | login（改写现有页） | `POST /api/auth/login` | 去 uni-id，改 `authStore.login`；429 限流提示；测试账号 `player_alice/test` |
| `pages/register/register.uvue` | register | `POST /api/auth/register` | 源含邀请码/安全码，后端仅 `username/password/role` → 精简表单 |
| `pages/hall/hall.uvue` | hall | `GET /api/rooms/list` + `GET /api/wallet/balance/:uid` | 6 游戏入口收敛为 4；代理入口按 role 显示；Grid→flex |
| `pages/room-list/room-list.uvue` | room-list | `GET /api/rooms/list?game_type&status` | 玩法枚举 4 种；Grid→flex；加入房间弹窗走 `POST /api/rooms/join` |
| `pages/create-room/create-room.uvue` | create-room | `POST /api/rooms/create` | 字段对齐契约（`platform_fee_rate`/`agent_commission_rate`/`big_blind`/`rake_cap_multiplier`）；**不传 `created_by`**；Grid→flex |
| `pages/my-rooms/my-rooms.uvue` | my-rooms | `GET /api/rooms/list` | 无专用端点 → 全量拉取后本地按 `created_by == self` 过滤 |
| `pages/table-texas/table-texas.uvue` | table-texas | WS `join_room`/`player_action` + `game_state`/`action_ack`/`turn_timer`/`phase_changed`/`player_status`/`auto_fold`/`round_result` | 复用 `store/room.uts`；椭圆桌 + 公共牌 + 座位 |
| `pages/table-zhajinhua/table-zhajinhua.uvue` | table-zhajinhua | 同上 + 动作 `view_cards` / `compare`（带 `target_user_id`） | 看牌/闷牌/比牌按钮集 |
| `pages/table-niuniu/table-niuniu.uvue` | table-niuniu | 同上 + 庄家/倍率字段（`is_banker`/`banker_multiplier`/`bet_multiplier`） | 抢庄 + 下注倍率；源「幸运区域 Grid」→ flex |
| `pages/table-sangong/table-sangong.uvue` | table-sangong | 同上 | 上庄/下注/倒计时 |
| `pages/spectate/spectate.uvue` | spectate | WS `join_room{as_spectator:true}` | 复用牌桌只读模式；他人底牌为空数组 |
| `pages/profile/profile.uvue` | profile | 无 `/api/user/me` → JWT claim + wallet balance | 菜单裁剪到有契约的入口（钱包/流水/代理/设置/退出） |
| `pages/wallet/wallet.uvue` | wallet（改写现有页） | `GET /api/wallet/balance/:uid`、`GET /api/wallet/transactions/:uid`、`POST /api/wallet/transfer` | 去云对象；原「领取测试筹码」改 dev-only（`POST /api/admin/mint` 需 admin，放到 `dev/engine-test`） |
| `pages/flow/flow.uvue` | flow | `GET /api/wallet/transactions/:uid` | 源 `creditLog` → transactions；`offset` 分页 |
| `pages/agent/agent.uvue` | agent | `GET /api/agent/{dashboard,children,settlements,commission}` | 4 接口聚合；role 守卫；Grid→flex |
| `pages/setting/setting.uvue` | setting | 无 | 纯本地（音效开关、退出登录） |
| `pages/error/error.uvue` | error | 无 | 纯本地 |
| `pages/dev/engine-test.uvue` | 现有 | 无 | 保留；可加 dev mint 入口 |

**删除（9 页）**：`pay`、`withdraw`（法币充提被禁止）、`messages`、`invite`、`gift`、`service`、`records`（无契约端点）、`table-tbniuniu`、`table-tbsangong`（后端无通比玩法）。

**牌桌策略**：4 张牌桌**各自独立成页**（UI 差异大），但共享 `store/room.uts` + `vp-poker-table`/`vp-seat`/`vp-action-bar`/`vp-countdown` 组件；仅动作按钮集与桌面装饰按玩法分支。

---

## 五、组件映射表（源 9 个 → 目标）

| 目标路径 | 来源 | vapor 不兼容点处理 |
|---|---|---|
| `components/vp-chip-stack/vp-chip-stack.uvue` | ChipStack | `radial-gradient`→纯色/`linear-gradient`；嵌套 `&__chip--x .inner` 是**后代选择器**→拆平为独立 class |
| `components/vp-avatar/vp-avatar.uvue` | PkAvatar | VIP/在线角标绝对定位保留；无裸文本；无阻塞项 |
| `components/vp-button/vp-button.uvue` | PkButton | `:active`→`hover-class`；`filter:brightness()` 删除；`@keyframes`+`animation` loading → 改内置 `<loading>`；`pointer-events`→条件判断 |
| `components/vp-card/vp-card.uvue` | PkCard | 与现有 `vp-card` 合并（容器卡 + header/extra 插槽）；暴露 `externalClasses: ['custom-class']` |
| `components/vp-dialog/vp-dialog.uvue` | PkDialog | `inset:0`→`top/right/bottom/left:0`；`@click.self` 不支持→遮罩独立 view 判断；z-index 需非 flatten |
| `components/vp-empty/vp-empty.uvue` | PkEmpty | 纯 class；`@click`→ setup emit |
| `components/vp-input/vp-input.uvue` | PkInput | `:focus` 伪类→`@focus/@blur` 状态 class；`placeholder-style` 可用 |
| `components/vp-tab/vp-tab.uvue` | PkTab | 后代选择器 `.item--active .text`→拆成 `text--active` 独立 class |
| `components/vp-poker-card/vp-poker-card.uvue` | PokerCard | `repeating-linear-gradient` 牌背→纯色/静态图；组合选择器 `&--black .value`→扁平 class；花色 `♠♥♦♣` 用 unicode 直显 |
| `components/vp-action-bar`、`vp-countdown`、`vp-poker-table`、`vp-raise-slider`、`vp-seat`、`vp-toast` | 现有 | 保留；按 4 玩法补充动作类型与座位字段 |

**通用规则**：所有 `&__x` 嵌套仅允许编译为**单一 class**；凡产生后代/组合选择器的一律拆平。

---

## 六、通信层设计（UTS）

### 6.1 `config/env.uts`
```uts
// #ifdef H5
export const BFF_BASE_URL: string = 'http://localhost:4000'
export const WS_URL: string = 'ws://localhost:8003/ws'
// #endif
// #ifdef APP-ANDROID || APP-IOS || APP-HARMONY
export const BFF_BASE_URL: string = 'http://192.168.1.10:4000'   // 真机联调改本机局域网 IP
export const WS_URL: string = 'ws://192.168.1.10:8003/ws'
// #endif
export const REQUEST_TIMEOUT_MS: number = 15000
export const HEARTBEAT_INTERVAL_MS: number = 30000
export const PONG_TIMEOUT_MS: number = 60000
export const ACK_TIMEOUT_MS: number = 5000
export const JOIN_TIMEOUT_MS: number = 5000
export const MAX_RECONNECT: number = 5
export const RECONNECT_BASE_MS: number = 1000
export const RECONNECT_MAX_MS: number = 30000
export const TOKEN_KEY: string = 'poker_jwt_token'
```

### 6.2 `utils/http/client.uts`
- `request(method, path, options: RequestOptions): Promise<UTSJSONObject>`，基于 `uni.request`。
- header 注入 `Content-Type: application/json` + `Authorization: Bearer <token>`（`auth=false` 时不带，用于 login/register）。
- `statusCode == 401` 或 `body.code == 401` → `clearAuth()` + `uni.reLaunch('/pages/login/login')` + reject。
- `body.code == 0` → resolve `body.data`（null 时 resolve 空 `UTSJSONObject`）；其余 code → reject `Error(body.message)`，`showError` 时 `uni.showToast({icon:'none'})`。
- 便捷方法：`httpGet / httpPost / httpPatch / httpPostAuth`。
- 常量 `ERR_AUDIT_FAILED = 5001`（守恒校验失败，严重告警）。
- `RequestOptions`：`{ data: UTSJSONObject|null, params: UTSJSONObject|null, auth: boolean, showError: boolean }`（UTS 无 `undefined`/`Partial`）。

### 6.3 `utils/http/api/*.uts`
`auth.uts`（login/register）、`room.uts`（list/create/join/detail/addBots/handHistory）、`wallet.uts`（getBalance/listTransactions/transfer）、`agent.uts`、`admin.uts`（mint/audit，dev 用）、`support.uts`（预留）。返回 `Promise<UTSJSONObject | UTSJSONArray>`。

### 6.4 `utils/ws/client.uts`
模块级状态（避免 UTS class 差异）：`socket`、`connected`、`heartbeatTimer`、`pongTimer`、`reconnectAttempts`、`handlers: MessageHandler[]`、`ackWaiters: Map<string, AckWaiter>`。

对外 API：
```uts
wsConnect(): Promise<void>
wsDisconnect(): void
wsIsConnected(): boolean
wsSend(msg: UTSJSONObject): void
wsJoinRoom(roomId: string, userId: string, token: string, asSpectator: boolean): Promise<void>
wsSendAction(action: UTSJSONObject, timeoutMs: number): Promise<UTSJSONObject>
wsLeaveRoom(): void
wsOnMessage(handler: MessageHandler): () => void
wsSetActiveRoom(roomId: string, userId: string, asSpectator: boolean): void   // 重连后自动 rejoin
```
核心逻辑（对应 `方案.txt` 三章）：
1. `uni.connectSocket({url: WS_URL})` → `onOpen`（置 connected、退避归零、`startHeartbeat`、若 `activeRoomId` 非空自动 `join_room`）→ `onMessage`（`JSON.parse` → 先 `pong` 清超时 → 再 `action_ack` 匹配 `req_id` → 最后广播 handlers）→ `onClose`（`stopHeartbeat` + `scheduleReconnect`）→ `onError`。
2. 心跳 30s 发 `ping`，同时设 60s `pongTimer`，超时主动 `socket.close()`。
3. 重连：`delay = min(1000 * 2^attempts, 30000)`，最多 5 次。
4. ACK：`req_id = act_{ts}_{seq}`，存 `ackWaiters`，5s 超时 reject（禁止省略超时处理）。
5. `wsJoinRoom`：临时注册 handler 等 `joined && room_id == rid`，5s 超时 reject。
6. `join_room` 仍携带 `token` 字段（契约已知后端暂未校验，为将来做准备）。

参考实现：`v-poker-yefeng/client/src/ws/gameSocket.ts`、`client/src/api/client.ts`（可 1:1 翻译为 UTS）。

---

## 七、Pinia Store 设计

### `store/auth.uts`（替换 `store/user.uts`）
- state：`token: string|null`、`userId`、`role`、`nickname`、`loading`
- computed：`isLoggedIn`、`isAgent`、`isAdmin`
- action：`restore()`（启动从 storage 恢复）、`login(u,p)`、`register(u,p)`、`logout()`（`clearAuth()` + `wsDisconnect()` + reLaunch）
- 接口：`POST /api/auth/login`、`/register`

### `store/lobby.uts`（新建）
- state：`rooms: RoomDto[]`、`filterGameType`、`filterStatus`、`loading`、`errorMessage`
- action：`fetchRooms()`、`createRoom(payload)`、`joinRoom(roomId, password)`、`addBots(roomId, count)`
- 接口：`GET /api/rooms/list`、`POST /api/rooms/create`、`POST /api/rooms/join`、`POST /api/rooms/:id/bots`

### `store/room.uts`（核心，轮询 → WS）
- state：`roomId`、`room`、`roundState`、`seats: SeatView[]`、`mySeatIndex`、`turnTimer`、`isSpectator`、`lastResult`、`eventLog`、`connected`、`errorMessage`
- computed：`mySeat`、`isMyTurn`、`myCards`、`totalPot`、`phase`、`canCheck`、`callAmount`、`minRaise`、`maxRaise`、`readyCount`（复用现有归一化 `readSeat`/`applyState` 逻辑）
- action：`enterRoom(roomId, asSpectator)`（`wsConnect` → `wsSetActiveRoom` → `wsJoinRoom`）、`leaveRoom()`、`initMessageHandler()`、`applyGameState/applyTurnTimer/applyPlayerStatus/applyAutoFold/applyRoundResult`、`sendAction(actionType, amount)`、`fold/check/call/raise/allIn/ready`
- **删除**：`poller`/`syncOnce`/`startPolling`/`stopPolling`/`syncNow`/`version`
- 结构差异：`game_state.data` 含嵌套 `room`/`round_state`/`seats`/`turn_timer`；`phase` 在 `round_state.phase`；`turn_timer` 另有独立消息（`start/tick/cancel/expired`）
- 结算后联动：`applyRoundResult` → `walletStore.refreshBalance()`

### `store/wallet.uts`（改写）
- state：`balance`、`frozen`、`walletId`、`transactions`、`total`、`loading`、`finished`、`errorMessage`
- action：`refreshBalance()`、`loadTransactions(reset)`、`transfer(toUid, amount, remark)`（`genTxId()` 生成全局唯一 `transaction_id`）
- 接口：`GET /api/wallet/balance/:uid`、`GET /api/wallet/transactions/:uid`、`POST /api/wallet/transfer`

### `store/agent.uts`（新建）
- state：`dashboard`、`children`、`settlements`、`commission`、`loading`
- action：`loadDashboard/loadChildren/loadSettlements/loadCommission`

---

## 八、CSS 迁移策略

1. **token 体系**：`styles/tokens/*.scss` 原样迁入，`uni.scss` 编译期 `@import`（SCSS 不受运行时选择器约束）。`_responsive.scss` 的 `calc(...+env(safe-area-inset-*))` 删除，改 `onLoad` 用 `uni.getWindowInfo().safeAreaInsets` 计算后动态 `:style`。
2. **全局 class 只放 `App.uvue`**（页面可引用，组件默认不能）：现有 `.vp-page/.vp-row/.vp-col/.vp-text/.vp-title/.vp-card` + 补 `.vp-gap-8/16/24`、`.vp-center`、`.vp-flex-1`。
3. **组件自持样式**：8 个基础组件全部自带 style；容器型 `vp-card` 用 `externalClasses: ['custom-class']` 开放定制。
4. **Grid → flex（7 处）**：`pages/agent`、`pages/create-room`、`pages/hall`、`pages/my-rooms`、`pages/room-list`、`pages/table-niuniu`（pay 页已删）。改法：外层 `flex-direction: row; flex-wrap: wrap`，子项 `width: 25%/33.33%/16.66%`。
5. **不兼容写法替代**：

| 源写法 | 替代 |
|---|---|
| `:active` / `:focus` / `:last-child` | `hover-class` / `@focus|@blur` 状态 class / 数据层 `isLast` |
| `filter: brightness()` | 删除，改背景色 |
| `@keyframes` + `animation`（loading） | 内置 `<loading>` 或静态文案 |
| `backdrop-filter: blur()` | `rgba()` 半透明纯色 |
| `box-shadow: inset`（桌布） | 内层 view border + 普通 box-shadow |
| `radial-gradient` / `repeating-linear-gradient` | 纯色 / `linear-gradient` / 静态图 |
| `calc()` | JS 计算后动态 `:style` |
| 裸文本 | 逐页包 `<text>`（源已基本合规，抽查补漏） |
| `toLocaleString()` / `Intl.*` | `utils/format.uts` 手写千分位 |

---

## 九、分阶段实施（每阶段独立会话 + 交接 md）

> 遵循 `uniapptox.md` 建议：每步新起会话，产物写入 `v-poker/.hbuilderx/uni-agent/plans/` 供下阶段读取。

| 阶段 | 内容 | 关键文件 | 验收 |
|---|---|---|---|
| **0 · 通信层替换（去 uniCloud）** | 删 `store/user.uts`/`utils/request.uts`/`utils/realtime.uts`；`App.uvue` 去 `uniIdPagesInit`；`pages.json` 去 uni-id 路由；新增 `config/env.uts`、`utils/storage.uts`、`utils/http/*`、`utils/ws/*`、`store/{auth,lobby,agent,index}.uts`；改写 `store/{wallet,room}.uts` | 见第三节 | App(Android) + H5 可编译；login 页能拿到 token |
| **1 · flex 布局改造** | 7 处 Grid→flex；页面骨架 view 化 | 第四节各页 | H5 无 `display:grid` 残留，布局与源稿一致 |
| **2 · 文字与 CSS 收敛** | 裸文本包 `<text>`；复杂选择器拆平；去 calc/伪类/filter/keyframes/backdrop/inset-shadow；单位统一 | `pages/**`、`components/**`、`styles/**` | 编译控制台无「不支持的 css」告警 |
| **3 · 组件迁移** | 9 源组件 → 目标组件；校验样式隔离 2.0 | `components/**` | 组件在 H5 + Android 蒸汽模式正常，无样式泄漏 |
| **4 · 认证与大厅** | login/register/hall/room-list/create-room/my-rooms | 对应页面 + auth/lobby store | 登录→大厅→列表→创建/加入房间闭环 |
| **5 · 牌桌 + 旁观** | 4 张牌桌 + spectate；WS 全链路 | `pages/table-*`、`pages/spectate`、`store/room.uts` | 4 玩法均可 join + 渲染 `game_state`；`player_action`→`action_ack`→`game_state` 闭环；旁观屏蔽底牌 |
| **6 · 钱包/流水/代理/资料** | wallet/flow/agent/profile | 对应页面 + wallet/agent store | 余额、流水、转账、代理仪表盘正常 |
| **7 · 本地页** | splash/setting/error | 对应页面 | 纯本地渲染，无死链 |
| **8 · 多端验证 + 加固** | Android/iOS/鸿蒙真机；横屏、安全区、无 Intl 崩溃、断线重连、弱网退避 | 全量 | 见第十节 |

---

## 十、端到端验证

### 10.1 启动后端
```powershell
cd C:\Users\88903\Desktop\v-poker\v-poker-yefeng
Copy-Item .env.development .env
docker-compose up -d wallet-service commission-service bff game-engine
docker-compose ps   # 确认 4000 / 8001 / 8000 / 8003 全部 Up
```

### 10.2 HTTP 冒烟
```powershell
# 登录（player_alice/test）
curl.exe -s -X POST http://localhost:4000/api/auth/login -H "Content-Type: application/json" -d '{\"username\":\"player_alice\",\"password\":\"test\"}'
# 房间列表
curl.exe -s "http://localhost:4000/api/rooms/list?game_type=texas_holdem&status=waiting" -H "Authorization: Bearer <token>"
# 余额 / 流水
curl.exe -s http://localhost:4000/api/wallet/balance/player_alice -H "Authorization: Bearer <token>"
curl.exe -s "http://localhost:4000/api/wallet/transactions/player_alice?limit=20&offset=0" -H "Authorization: Bearer <token>"
```
断言 `code===0`；测试账号 `player_alice/test`、`player_bob/test`、`agent_root/test`、`admin_root/test`。

### 10.3 WS 全链路
用 `wscat -c ws://localhost:8003/ws`：
1. `{"type":"join_room","room_id":"<id>","user_id":"player_alice","as_spectator":false}` → 收 `joined` + `game_state`
2. `{"type":"player_action","req_id":"act_1","user_id":"player_alice","action":{"action_type":"ready","user_id":"player_alice"}}` → 收 `action_ack{code:0}` + `action_broadcast` + `game_state`
3. `{"type":"ping"}` → 收 `pong`
4. 断网观察指数退避重连 1→2→4→8→16→30（≤5 次），恢复后自动 rejoin

### 10.4 4 种玩法验证
对 `texas_holdem` / `zha_jin_hua` / `niu_niu` / `san_gong` 各建房间 + 加机器人，核对前端动作按钮集与后端 `GamePlugin` 一致：
```powershell
curl.exe -s -X POST http://localhost:4000/api/rooms/create -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{\"room_name\":\"测试房\",\"game_type\":\"texas_holdem\",\"mode\":\"cash\",\"total_rounds\":10,\"base_score\":100,\"platform_fee_rate\":0.03,\"agent_commission_rate\":0.03,\"min_players\":2,\"max_players\":6,\"big_blind\":100,\"rake_cap_multiplier\":5}'
curl.exe -s -X POST http://localhost:4000/api/rooms/<id>/bots -H "Authorization: Bearer <token>" -d '{\"count\":3,\"strategy\":\"loose\",\"chips\":5000}'
```

### 10.5 结算与守恒
一局结束 → 前端收 `round_result` → `wallet.refreshBalance()`；`GET /api/admin/audit` 断言 `check_passed===true`（`code===5001` 立即告警）。

### 10.6 静态检查（可自动化）
```powershell
rg "display:\s*grid|:active|:hover|:focus|:last-child|backdrop-filter|filter:|@keyframes|calc\(|inset |toLocaleString|Intl\." pages components styles
```
应无命中（除注释）。

---

## 十一、风险与阻塞点

| # | 风险 | 缓解 |
|---|---|---|
| 1 | 源 `api/index.js` 缺失、`mock/` 未跟踪 | `api/index.js` 用 `git show HEAD:api/index.js` 恢复参考；mock 不使用（后端真实可用） |
| 2 | 后端需本地 docker-compose | 阶段 0 前先起 4 个服务；`client` 容器(:3000) 可作对照前端 |
| 3 | 4 玩法动作语义差异（看牌/比牌/抢庄/倍率） | 对照 `game-engine/src/games/*/index.ts` 的 `GamePlugin` 动作集，逐玩法核对按钮与字段 |
| 4 | 横屏适配 | 保留 `pageOrientation: landscape`（HBuilderX 5.26 满足 Android 4.13+/iOS 4.25+）；iPad 需 Info.plist 限定方向 |
| 5 | Android V8 无 Intl | 全局禁用 `toLocaleString`/`Intl.*`，沿用 `format.uts` |
| 6 | UTS 类型限制 | 统一 `T \| null` + `type`；动态 JSON 用 `UTSJSONObject`；禁用 `Partial/Record/interface` |
| 7 | 样式隔离 2.0 导致全局样式在组件内失效 | 组件自持样式；仅页面用全局 class；必要时 `externalClasses` |
| 8 | 18 页一次性迁移的工作量/上下文风险 | 严格按第九节分阶段，每阶段独立会话 + 交接 md |
| 9 | `uni-id-pages-x` 残留依赖致编译失败 | 阶段 0 一次性清引用；目录先留、编译通过后再删 |
| 10 | 契约无 `/api/user/me` | profile 用 JWT claim（前端 base64 解析 payload）+ wallet balance |
| 11 | WS `join_room` 暂未校验 token（契约已知） | 前端仍传 token，待后端补校验 |
| 12 | 金额语义（源「元」→ 后端整数筹码） | 全程整数运算，仅展示层 `formatAmount`；禁止前端分账 |

---

## 十二、关键参考文件

- 后端契约：`v-poker-yefeng/docs/FRONTEND_CONTRACT.md`
- 通信层设计原型：`方案.txt`
- 后端参考实现：`v-poker-yefeng/client/src/ws/gameSocket.ts`、`client/src/api/client.ts`、`client/src/store/gameStore.ts`
- 官方指南：`{knowledges_base_dir}/uni-app-x/docs/uniapptox.md`、`.../app-vapor.md`、`.../css/common/selector.md`、`.../css/common/style-isolation.md`
- 现有工程迁移计划（起点）：`v-poker/.hbuilderx/uni-agent/plans/v-poker-uniappx-port.md`

---

## 十三、实施进度

### ✅ 阶段 0 · 通信层替换（去 uniCloud）— 已完成

**新增文件**
| 文件 | 说明 |
|---|---|
| `v-poker/config/env.uts` | BFF/WS 地址（条件编译）+ 心跳/退避/超时/存储 key 常量 |
| `v-poker/utils/storage.uts` | token / userId / role / name 读写与 `clearAuth()` |
| `v-poker/utils/http/types.uts` | `RoomDto`/`WalletBalanceDto`/`TransactionDto`/`RequestOptions`、`defaultRequestOptions()`、`ERR_AUDIT_FAILED` |
| `v-poker/utils/http/client.uts` | `sendEnvelope` / `requestObject` / `requestList` / `httpGet` / `httpGetList` / `httpPost` / `httpPatch` / `httpPostPublic`；401 统一跳登录；统一解包 `{code,message,data}` |
| `v-poker/utils/http/api/auth.uts` | `login` / `register` |
| `v-poker/utils/http/api/room.uts` | `listRooms` / `createRoom` / `joinRoom` / `roomDetail` / `addBots` / `handHistory` |
| `v-poker/utils/http/api/wallet.uts` | `getBalance` / `listTransactions` / `transfer` |
| `v-poker/utils/http/api/agent.uts` | `dashboard` / `children` / `settlements` / `commission` |
| `v-poker/utils/http/api/admin.uts` | `overview` / `audit` / `mint`（dev） |
| `v-poker/utils/http/api/support.uts` | `tickets` / `dashboard` / `playerProfile` |
| `v-poker/utils/ws/protocol.uts` | 客户端消息构造 + 服务端消息安全读取 + `MessageHandler`/`AckWaiter` 类型 |
| `v-poker/utils/ws/client.uts` | `wsConnect`/`wsDisconnect`/`wsJoinRoom`/`wsSendAction`/`wsLeaveRoom`/`wsOnMessage`/`wsSetActiveRoom`/`wsIsConnected`；30s 心跳 + 60s pong 超时；指数退避 1→2→4→8→16→30s（≤5 次）；ACK req_id 5s 超时；重连自动 rejoin |
| `v-poker/store/auth.uts` | 登录态 + JWT（`restore`/`login`/`register`/`logout`） |
| `v-poker/store/lobby.uts` | 房间列表（归一化 `RoomItem`）/ 创建 / 加入 / 加机器人 |
| `v-poker/store/agent.uts` | 代理仪表盘/下级/结算/佣金 |
| `v-poker/pages/register/register.uvue` | 注册页（对接 `POST /api/auth/register`） |

**改写文件**
| 文件 | 改动 |
|---|---|
| `v-poker/store/room.uts` | 轮询 → WS：删除 `poller`/`syncOnce`/`startPolling`/`stopPolling`/`syncNow`/`version`；新增 `enterRoom`/`leaveRoom`/`initMessageHandler`/`applyGameState`/`applyTurnTimer`/`applyPlayerStatus`/`applyAutoFold`/`applyRoundResult`/`sendAction`/`fold`/`check`/`call`/`raise`/`allIn`/`ready`/`viewCards`/`compare`；座位归一化含 `is_banker`/`banker_multiplier`/`bet_multiplier`；`holeCardCount` 按玩法推断牌背 |
| `v-poker/store/wallet.uts` | 去云对象 → HTTP；新增归一化 `TxItem`；新增 `transfer` |
| `v-poker/pages/login/login.uvue` | 去 uni-id → `authStore.login`；429 等错误由 HTTP 客户端统一提示 |
| `v-poker/pages/lobby/lobby.uvue` | 去云对象 → `lobbyStore`；创建房间 payload 对齐契约（`platform_fee_rate` 等，不传 `created_by`） |
| `v-poker/pages/wallet/wallet.uvue` | 去云对象 → `walletStore`；移除 uniCloud 铸币按钮；`TxItem` 渲染 |
| `v-poker/pages/room/room.uvue` | 去轮询 → WS；`is_self` 改按数组下标；他人底牌按玩法显示牌背；准备改单动作 |
| `v-poker/App.uvue` | 移除 `uni-id-pages-x` 初始化 |
| `v-poker/pages.json` | 移除 uni-id-pages-x 路由；新增 `pages/register/register`；`globalStyle.pageOrientation: "landscape"` |

**删除文件**：`store/user.uts`、`utils/request.uts`、`utils/realtime.uts`

**遗留**：`uni_modules/uni-id-pages-x` 等目录暂留（已无源码引用），待全量编译通过后可删；`pages.json` 目前只注册 6 页（login/register/lobby/room/wallet/dev），其余页面按阶段 1-7 逐个迁移后追加注册。

**验证方式**：CLI 无法在无界面下识别本工程为 uni-app x（`cli compile` 报「项目类型为Web」），需用 HBuilderX 5.26 GUI「运行到 Android」编译；HTTP/WS 契约已用 `curl`/`wscat` 冒烟脚本（第十节）覆盖。

### ✅ 阶段 1-3 · CSS 收敛 + 组件迁移 — 已完成

- 全量扫描 `pages/`、`components/`、`App.uvue`：无 `display:grid`、无伪类选择器、无 `filter/backdrop-filter/@keyframes/calc()/inset`、无 `inline-flex/pointer-events/user-select/100vh`、无后代选择器（唯一命中为注释与 `hover-class` 绑定）
- 新增组件（7 个）：`vp-button`（`:active`→`hover-class`、去 `filter`、loading 去旋转动画）、`vp-dialog`（`inset:0` 拆解、遮罩独立 view 替代 `@click.self`）、`vp-input`（`:focus`→状态 class）、`vp-empty`、`vp-tab`（后代选择器拆平）、`vp-avatar`、`vp-chip-stack`（`radial-gradient`→纯色）
- 复用既有：`vp-card` 即源 `PokerCard`（扑克牌）；源 `PkCard` 容器改用全局 `.vp-card` 类（页面可引用全局 class，无需组件）

### ✅ 阶段 4-7 · 业务页面迁移 — 已完成

新增页面（15）：`splash`、`register`、`hall`、`room-list`、`create-room`、`my-rooms`、`table-texas`、`table-zhajinhua`、`table-niuniu`、`table-sangong`、`flow`、`agent`、`profile`、`setting`、`error`；`pages/dev/engine-test` 保留。

- 新增 `components/vp-table-shell`（共享桌台：WS 接入 + 座位环绕坐标 JS 计算 + 倒计时 + 行动栏 + 加注滑块 + Toast），4 张牌桌页均为薄壳（仅传 `game_type`/`room_id`/`as_spectator`）
- 新增 `utils/games.uts`（玩法枚举 → 名称/图标/路由映射、房间状态文案）
- 旁观：由 4 张牌桌页的 `as_spectator=true` 参数承载，无需独立 `spectate` 页（已在 `my-rooms` 接入）
- **删除**：`pages/lobby/lobby.uvue`、`pages/room/room.uvue`（被 `hall`+`room-list`+`vp-table-shell` 取代）
- `pages.json` 注册 18 页，首页为 `splash`，全局横屏

### ✅ 阶段 8 前置：风险预检 / 占位资源 / 冒烟脚本 / 收尾 — 已完成

**UTS 编译风险预检（对照官方文档核实）**
- `parseInt`（`docs/uts/buildin-object-api/global.md`）、`Map.forEach((value,key,map))`（`map.md`）、`withDefaults`+`defineProps<Type>`（官方 `hello-uni-app-x` 大量样例）、组件内 `onMounted/onUnmounted` 均确认支持
- `utils/http/client.uts` 改为 `uni.request({ success: (res: RequestSuccess<any>) })` + `typeof/instanceof` 兜底解析，兼容服务端非 JSON 响应（原 `uni.request<UTSJSONObject>` 泛型保留风险已消除）
- `vp-table-shell` 移除未使用 `step`；`utils/ids.uts` 移除 uniCloud 遗留 `walletIdForPlayer/Room/Agent`；`utils/http/types.uts` 移除被 store 归一化类型取代的 `RoomDto/TransactionDto/WalletBalanceDto`

**占位资源**
- `static/audio/{click,chip_bet,deal_card,win,lose,flip_card}.mp3`（单帧静音 MP3，417B）——避免音效静默；牌面/背景当前为纯 CSS 绘制，未引用图片资源

**后端冒烟脚本**
- `tools/smoke-test.mjs`（Node 22 原生 `fetch` + `WebSocket`）：登录 → 房间列表 → 余额 → 流水 → WS(connect/ping/pong/join_room/joined/game_state)；`node tools/smoke-test.mjs` 一键跑，退出码 0/1

**遗留功能**
- `zha_jin_hua` 比牌：`vp-table-shell` 新增「选择比牌对象」弹窗（列出非自己、非弃牌玩家，选中后发 `compare` + `target_user_id`）
- `my-rooms` 关闭房间：契约无端点，未提供按钮

**仍待人工（阶段 8 本体）**
- HBuilderX GUI「运行到 H5/Android」过编译；Android/iOS/鸿蒙真机横屏/安全区/弱网加固

### ✅ 目录清理 — 已完成

**工程内（`v-poker/`）删除死目录/文件**（源码已确认零引用）：
- `uniCloud-aliyun/`（23 个 schema，后端已切 yefeng）
- `uni_modules/`（`uni-id-pages-x`、`uni-captcha`、`uni-cloud-s2s`、`uni-config-center`、`uni-id-common`、`uni-open-bridge-common`、`uni-popup`、`uni-scss`、`uni-transition`）
- `_tree.json`（源仓库 tree 快照）、`unpackage/`（旧构建产物）

清理后工程根：`App.uvue / main.uts / manifest.json / pages.json / uni.scss / index.html / platformConfig.json` + `pages(18) / components(15) / store(5) / utils(15) / config / game(6) / test / tools / static`。

**工作区根（`Desktop/v-poker/`）**：
- 删除源工程 `棋牌平台/`（521MB，迁移已完成，用户确认直接删除）
- 保留 `v-poker/`（目标工程）、`v-poker-yefeng/`（后端）、`方案.txt`（方案文档）、`.hbuilderx/`（本计划）

### ✅ 设计优化（HTML 设计稿 → uvue 回填）— 已完成

**HTML 设计稿**：`.hbuilderx/uni-agent/design/v-poker-ui/`（`hall.html` / `room-list.html` / `poker-table.html` / `wallet.html` + `assets/design.css` + manifest + validation），Lane = free-design。

**uvue 回填**：
| 文件 | 改动 |
|---|---|
| `uni.scss` | 新增 `$vp-surface-3` / `$vp-border-strong` / `$vp-faint`（深色明度阶梯） |
| `components/vp-poker-table` | 绒布椭圆 + 金色外圈 + 底池标签/数值 + 公共牌槽位 |
| `components/vp-seat` | 座位铭牌（深色半透明 + 变体扁平 class：自己金色底 / 行动中金边 / 空位 / 断线置灰）+ 下注胶囊 |
| `components/vp-countdown` | 44px 金环倒计时（危险态转红） |
| `components/vp-action-bar` | 弃牌/过牌/跟注/加注/全下 + 副标题（跟注额、全下额）+ 语义色 |
| `components/vp-raise-slider` | 加注面板：标题+金额、滑块（金色轨道）、最小/半池/全下快捷（选中态）、确认/取消 |
| `components/vp-table-shell` | 顶栏（离开 + 玩法·房号·阶段 + 我的手牌 + 余额）、舞台、行动栏（含行动提示）、比牌弹窗 |
| `pages/hall` | 横屏三栏：品牌/公告/用户顶栏 + 左侧导航 rail + 玩法 4 卡（花色/底分/人数/状态）+ 房间管理 + 右侧快速加入（≥1100px 显示） |
| `pages/wallet` | 余额面板 + 自由转账面板 + 流水行（类型/时间/正负金额） |
| `pages/room-list` | 沿用结构，token 化房间卡与状态徽标 |

**设计→vapor 的落地取舍（HTML 有、uvue 不可用）**：
- `conic-gradient` 进度环 → 纯色金环 + 数字（App 不支持 conic）
- `radial-gradient` 绒布 → 纯色 `$vp-felt` + 深色粗边（渐变支持有限，保持安全）
- CSS `min()/calc()/aspect-ratio` → 由 `uni.getWindowInfo()` 在 JS 计算 px 后绑定
- 内联 SVG 图标 → 文字标签 / 花色字符（uvue 无 `<svg>`）
- CSS `:hover/:active` → `hover-class`
- CSS 媒体查询 → JS `windowWidth >= 1100` 决定是否显示右栏与每行卡片数

**次级页面统一（全部 18 页已对齐新设计）**：
- 统一 `topbar` 模式：`← 返回` + 标题/副标题（`flex-end` 基线对齐）+ 右侧动作（刷新/余额胶囊）
- `create-room`：玩法选择（花色 + 选中金边）+ 底分快捷 + 总局数/人数上限/密码 + 提交
- `my-rooms`：筛选 tab + 房间卡（房名/状态徽标/玩法/局数/人数）+ 空态（含创建入口）
- `profile`：用户卡 + 菜单行（分隔线，退出为危险色）
- `flow`：面板内流水行（类型/时间/正负双色）+ 空态
- `agent`：三张统计卡（余额/累计佣金/下级代理数）
- `setting`：音效开关（金色胶囊）+ 退出登录
- `error`：居中卡片 + 感叹号徽标 + 双按钮
- `login` / `register`：横屏左右分栏（左品牌区 + 右表单卡）
- `splash`：品牌 + 金色进度条

**校验**：`components/` + `pages/` 全量 vapor CSS 合规扫描无违规；全部 `.uvue` 的 `template/script/style` 标签配平。

### ✅ 本地开发/测试后端（按 yefeng 真实实现复刻的 mock）— 已完成

本机未安装 Docker，且 `cli compile` 无法在命令行编译 uni-app x 工程，因此按 **v-poker-yefeng 真实源码**复刻了一套零依赖 mock 后端：

| 文件 | 说明 |
|---|---|
| `tools/mock-server.mjs` | 单进程扮演 BFF + wallet + commission + game-engine；`HTTP :4000` + `WS :8003/ws`，零依赖（WS 帧手写编解码） |
| `tools/start-mock.bat` | 双击启动 |
| `tools/smoke-test.mjs` | **客户端完整冒烟**（57 项，含错误分支） |
| `tools/mock-handtest.mjs` | **四玩法完整对局**（38 项） |
| `tools/uts-syntax-check.mjs` | UTS/uvue 语法检查 |

**忠实复刻的真实行为**：5 个种子账号（密码 `test`）、未知用户 401、登录限流 60s/5 次→429、JWT HS256(sub/role/iat/exp,7d)、`wallet_id=w_{type}_{id}`、转账 `fee=floor(amount*0.0001)`、房号 6 位随机、无密码强制 public、`created_by`/`user_id` 由 JWT 注入、list 仅 public+status 倒序 limit50、牌 rank 1..13（1=A）、WS 广播顶层 `{type,data,room_id,timestamp}`、`auto_fold.folded[]` camelCase、`round_result.data.event_log` 为对象、阶段 WAITING→DEALING→BETTING(×4)→SHOWDOWN→SETTLING→FINISHED、30s 回合倒计时、`/audit` 失败 body code=5001 但 HTTP=200、**普通玩家快照不隐藏他人底牌**（真实如此）。

**为让客户端跑通的 3 处补全（真实后端缺失，已在代码注释标注）**：
1. **BFF 挂载 `/api/wallet/*`** —— 契约文档声称有，但 BFF 代码里根本没挂载（真实环境下客户端取余额会 404）
2. **引擎在足够玩家 ready 时自动开局** —— 真实引擎没有任何 `startRound` 入口（`ready` 只改座位状态，牌局永远停在 WAITING）
3. **引擎房间在首次 join_room / bots 时惰性创建** —— 否则 `/bots` 会 404

**发现的真实后端缺口（建议反馈后端）**：
- BFF 未挂载 `/api/wallet/*`（与 `FRONTEND_CONTRACT.md` 第 3.3 节矛盾）
- 引擎无开局触发入口，`ready` 动作不启动牌局
- 普通玩家快照不下发脱敏，`game_state` 明文含 `deck` 与他人底牌
- BFF 转发 game-engine / wallet mint 时不带 `X-Internal-Auth-Key`，真实环境会被下游 401

**验证结果**：
```
smoke-test       通过 57 / 失败 0   （认证13 + 房间16 + 钱包11 + 代理管理8 + WS6 + 铸币3）
mock-handtest    通过 38 / 失败 0   （4 玩法各 9-10 项，均跑到 round_result 且余额正确变更）
uts-syntax-check 扫描 63 文件 / 失败 0
```

**注意**：mock 与 yefeng 契约一致但**不是同一实现**，仅用于前端开发联调；正式联调仍需 `v-poker-yefeng`。切换只改 `config/env.uts` 的地址。

### ✅ 后端缺陷修复（v-poker-yefeng）— 已完成并验证

按 mock 阶段发现的问题逐条修复后端源码，并用真实后端跑通了客户端契约冒烟。

| # | 问题 | 修复位置 |
|---|---|---|
| 1 | **BFF 未挂载 `/api/wallet/*`**（契约 3.3 声称有）→ 前端取余额 404 | 新增 `bff/src/wallet/index.ts`，`bff/src/index.ts` 挂载 |
| 2 | **BFF 转发不带 `X-Internal-Auth-Key`** → 下游 game-engine/mint 返回 401 | 新增 `bff/src/internal.ts`；`rooms`/`admin`/`wallet` 全部改用 `internalHeaders()` |
| 3 | **普通玩家快照不脱敏**（明文含 deck 与他人底牌） | `game-engine/src/index.ts`：`maskHoleCards` 改为按 viewer 脱敏并剥离 `deck`；`broadcastRoomState`/join 按订阅者身份下发 |
| 4 | **引擎无开局入口**（`ready` 只改座位，永远 WAITING） | 新增 `GameStateMachine.maybeStartRound()`；WS 与 HTTP `action` 在 `ready` 成功后触发 |
| 5 | **BFF 从不调用引擎建房** → `/bots` 404 | `bff/src/rooms/index.ts` 新增 `ensureEngineRoom()`（含 wallet mode → 引擎插件 mode 映射） |
| 6 | **引擎无「人类玩家入座」入口** → `ready` 报 "Player not seated." | 引擎新增 `POST /api/engine/room/:id/seat`；BFF 新增 `ensureEngineSeat()`（初始筹码取钱包余额） |
| 7 | **`/api/admin/mint` 字段名不匹配**（契约 `user_id` vs wallet `target_user_id`+`admin_user_id`） | `bff/src/admin/index.ts` 做字段映射并从 JWT 注入 `admin_user_id` |
| 8 | **带密码房间被标成 `public`** | `wallet_service/app/routers/room.py`：有密码即 `room_type="private"` |
| 9 | **wallet_service 无法用 SQLite 启动**（PG 连接池参数传给 SQLite） | `wallet_service/app/database.py`：按类型构造引擎参数 |
| 10 | **德州 `fold` 不推进回合** → 弃牌后死锁 | `games/texas_holdem/index.ts`：fold 分支补 `rotateTurn` |
| 11 | **zjh/牛牛/三公 从不设置 `current_turn_seat_index`** → 无回合调度 | `core/stateMachine.ts` 新增核心层兜底 `ensureTurnSeat()`，并把 `maybeStartTurnTimer` 扩展到 `ACTION`/`QIANG_ZHUANG` |

**验证证据**：
- `bff` 与 `game-engine` `tsc --noEmit` **0 error**
- 引擎自带单元测试 **28/28 通过**（无回归）
- 用**真实后端**（uvicorn wallet + tsx bff + tsx engine，SQLite）跑客户端契约冒烟：**57/57 通过**（此前 32/57）
- 四玩法对局：已能建房 → 入座 → 发牌 → 机器人/人类交替行动（修复前完全卡死）

**仍未完成（后端更深层问题）**：四玩法跑满一局到 `round_result` 仍会在 90s 内超时——非德州插件的回合/轮次模型不完整（`isPhaseComplete` 依赖全员 `has_acted`，但缺少每轮的行动者序列），且全员弃牌时的结算路径需要单独处理。这属于引擎玩法层的重构，建议单独立项。

### ✅ 引擎玩法层重构（四玩法全通）— 已完成并验证

针对上述遗留问题做了引擎玩法层重构，**四种玩法现在都能完整跑完一局到 `round_result`**。

**核心设计：回合推进下沉到核心层**
- `plugin.interface.ts` 新增 `getActionSeats(state): Seat[]`：插件只声明「本阶段应行动的座位」，核心引擎据此推进 `current_turn_seat_index` 并调度倒计时/机器人。
- `stateMachine.ts` 用 `syncTurnSeat()` 统一驱动回合（替代此前只有德州才有的 `rotateTurn`），`maybeStartTurnTimer()` 扩展到 `QIANG_ZHUANG`/`ACTION` 阶段。

**逐项修复**

| # | 问题 | 修复 |
|---|---|---|
| 12 | zjh/牛牛/三公 从不设置回合座位 → 无回合调度 | 三插件实现 `getActionSeats()`；核心 `syncTurnSeat()` 统一推进 |
| 13 | **服务端无人调用 `/settle`** → `round_result` 永不推送 | `handleAction` 进入 `SETTLING` 后自动 `settleRound()`（`autoSettle()`，失败也强制 `finishSettlement` 收口） |
| 14 | 全员弃牌/无赢家时 `settleRound` 抛错 → 卡在 SETTLING | 无赢家则跳过钱包结算、记录日志后直接收口 |
| 15 | 牛牛/三公 抢庄后未定庄，下注阶段无人待行动 | `getNextPhase` 离开 `QIANG_ZHUANG` 时 `selectBanker()` 并重置闲家 `has_acted`；进入 `ACTION` 重置全员 `has_acted` |
| 16 | **机器人动作集不区分玩法/阶段** → 在抢庄/看牌阶段发出非法动作 | `botManager.executeBotAction` 按 `game_type`+`phase` 分派：抢庄→`qiang_zhuang`、看牌→`view_cards`、牛牛/三公下注→`bet`、炸金花→`call/raise/fold`（无 check）、德州→原策略 |
| 11 | 德州 `fold` 不推进回合 | 补 `rotateTurn` |

**验证证据（全部对真实后端）**：
```
bff / game-engine  tsc --noEmit   → 0 error
引擎自带 vitest                     → 28/28 通过（无回归）
客户端契约冒烟                       → 57/57 通过
四玩法完整对局                       → 38/38 通过
  德州扑克  round_result 4人  +5500 (一对)
  炸金花    round_result 4人  -400  (对子)
  牛牛      round_result 4人  +400  (牛三)
  三公      round_result 4人  +300  (6点)
  每局余额均正确变更
```

**改动文件**（`v-poker-yefeng`，共 13 个 + 2 个新增）：
```
bff/src/{index,rooms/index,admin/index}.ts           bff/src/{internal.ts,wallet/index.ts} (新增)
game-engine/src/index.ts                             game-engine/src/core/{stateMachine,botManager}.ts
game-engine/src/games/plugin.interface.ts            game-engine/src/games/texas_holdem/index.ts
game-engine/src/games/{zha_jin_hua,niu_niu,san_gong}/index.ts
wallet_service/app/{database.py,routers/room.py}
```











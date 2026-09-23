# SnapDeploy 部署方案

> PaaS 从 GitHub 仓库自动部署，每容器 512MB。本方案把现有 docker-compose 架构拆成独立服务，
> 修正"compose 内部 DNS"假设，并给出生产化改造点。

---

## 一、服务清单与容器分配

| # | 服务 | 目录 | 运行时 | 容器内存 | 是否需要改 |
|---|------|------|--------|----------|-----------|
| 1 | client 玩家端 | `client/` | Nginx 静态 | ~40MB | nginx 反代地址改环境变量 |
| 2 | admin 管理端 | `admin-dashboard/` | Nginx 静态 | ~40MB | 同上 |
| 3 | agent 代理端 | `agent-dashboard/` | Nginx 静态 | ~40MB | 同上 |
| 4 | support 客服端 | `support-dashboard/` | Nginx 静态 | ~40MB | 同上 |
| 5 | BFF 聚合层 | `bff/` | Node Hono | ~150MB | **Dockerfile 改生产启动** |
| 6 | 游戏引擎(WS) | `game-engine/` | Node Hono+WS | ~150MB | **Dockerfile 改生产启动** |
| 7 | 钱包服务 | `wallet_service/` | Python FastAPI | ~130MB | 加 `--workers 2` |
| 8 | 结算服务 | `commission_service/` | Python FastAPI | ~130MB | 加 `--workers 2` |
| 9 | PostgreSQL | 托管 DB add-on | — | 不占业务容器 | 用 SnapDeploy 托管库 |

> Metabase 为 JVM，单容器需 ~700MB，**512MB 跑不动，本期不上**。

---

## 二、必须改的代码（推到 main 后 SnapDeploy 自动构建）

### 1. bff/Dockerfile —— 生产启动（现在是 `npm run dev`，tsx watch，不能上生产）
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 4000
CMD ["npm", "start"]
```

### 2. game-engine/Dockerfile —— 同上（现在是 `npx tsx`，未编译）
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npm run build
EXPOSE 8003
CMD ["npm", "start"]
```

### 3. Python 两个服务 —— uvicorn 加 worker
```dockerfile
# wallet_service / commission_service 的 CMD 改为：
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]
```
（内存紧张时 workers 保持 2，不要加更多）

### 4. nginx.conf 反代地址改成可注入（关键！现在写死 `http://bff:4000`）
SnapDeploy 上没有 compose 的 `bff` DNS，必须用部署后的公网/内网地址。
client/nginx.conf 改成 envsubst 模板：

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;
    location / { try_files $uri $uri/ /index.html; }
    location /api/ {
        proxy_pass ${BFF_URL}/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
    location /ws/ {
        proxy_pass ${GAME_ENGINE_URL}/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```
对应 client 的 Dockerfile 末尾用 envsubst 在启动时替换：
```dockerfile
CMD ["/bin/sh","-c","envsubst '${BFF_URL} ${GAME_ENGINE_URL}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
```
（admin/agent/support 三个后台的 nginx.conf 如果也反代 BFF，同样处理；纯静态页则不需要。）

---

## 三、环境变量（在 SnapDeploy 各服务里配置）

部署后每个服务会得到一个 URL，假设：
- BFF → `https://bff-xxxx.snapdeploy.app`
- game-engine → `https://engine-xxxx.snapdeploy.app`
- wallet-service → `https://wallet-xxxx.snapdeploy.app`
- commission-service → `https://commission-xxxx.snapdeploy.app`
- Postgres 托管库 → 连接串由 SnapDeploy 注入

| 服务 | 必配环境变量 |
|------|-------------|
| wallet-service | `DATABASE_URL=<托管库异步串>`, `COMMISSION_SERVICE_URL=https://commission-xxxx`, `WALLET_INTERNAL_KEY=...`, `PLATFORM_FEE_RATE=0.03`, `DEBUG=false` |
| commission-service | `DATABASE_URL=<托管库异步串>`, `DEBUG=false` |
| bff | `WALLET_SERVICE_URL=https://wallet-xxxx`, `COMMISSION_SERVICE_URL=https://commission-xxxx`, `GAME_ENGINE_URL=https://engine-xxxx`, `JWT_SECRET=...`, `CORS_ALLOWED_ORIGINS=<client公网URL>,<三个后台URL>`, `DEBUG=false` |
| game-engine | `WALLET_SERVICE_URL=https://wallet-xxxx`, `DATABASE_URL_SYNC=<托管库同步串>`, `DISCONNECT_TIMEOUT_MS=300000`, `DEBUG=false` |
| client | `BFF_URL=https://bff-xxxx`, `GAME_ENGINE_URL=https://engine-xxxx` |
| 三个后台 | 若走 BFF：`BFF_URL=https://bff-xxxx` |

---

## 四、部署步骤

1. SnapDeploy 控制台 → Connect GitHub 仓库 `AthenDrakomin-hub/v-poker-yefeng`（main 分支）。
2. 依次新建 8 个 Service，各自 Build path 选对应子目录（Dockerfile 已在目录里）：
   - `client`、`admin-dashboard`、`agent-dashboard`、`support-dashboard`（前端）
   - `bff`、`game-engine`、`wallet_service`、`commission_service`（后端）
3. 创建 SnapDeploy 托管 PostgreSQL，拿到连接串填入上面 `DATABASE_URL`。
4. 按上表填环境变量；端口自动识别（80 / 4000 / 8003 / 8001 / 8000）。
5. 部署顺序：**先 Postgres → 两个 Python → bff + engine → 四个前端**。
6. 全部起来后，把 client 公网 URL 回填到 bff 的 `CORS_ALLOWED_ORIGINS`，重启 bff。
7. 推送任意 main 提交即自动重新部署。

---

## 五、内存预算（每容器 512MB）

- 前端 4 个 Nginx：合计 < 200MB，单容器远低于上限。
- Node 两个（bff/engine）：建议加 `NODE_OPTIONS=--max-old-space-size=256`，防 OOM。
- Python 两个：uvicorn `--workers 2`，单容器约 130MB，安全。
- Postgres 走托管，不占业务容器配额。
- 如某档只给 4 个容器：可把 4 个前端合并成 1 个 Nginx 容器（按路径 `/admin/ /agent/ /support/` 分发），省下 3 个。

---

## 六、已确认结论

- **私网**：SnapDeploy Add-on（PostgreSQL/Redis）走私网、自动注入连接串；自建的 8 个容器之间无私网，互调走各服务分配的公网 URL（HTTPS/TLS，安全够用）。不另建 MySQL 容器，直接用 Add-on Postgres。
- **建表**：无需 alembic、无需手动跑 `database/init.sql`。`wallet_service` / `commission_service` 的 FastAPI `lifespan` 启动时执行 `Base.metadata.create_all` 并写 FeePool/Agent 种子。对着 Add-on Postgres 直接起服务即自动建表。
  - 注意：因种子在 lifespan 里跑，Python 服务**暂保持单 worker**，避免多 worker 并发写种子触发主键冲突；后续接入迁移脚本后再扩 worker。

## 七、风险

- **WebSocket 长连接**：确认 SnapDeploy 网关支持 WS 升级、不掐 `proxy_read_timeout`（nginx 模板已设 3600s）。
- **JWT_SECRET / DB 密码**：SnapDeploy 环境变量里配，不提交进 `.env.production`。
- **create_all 只建不alter**：全新 Add-on 库没问题；后续改表结构需补迁移。

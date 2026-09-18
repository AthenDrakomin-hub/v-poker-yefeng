# V-POKER 环境配置说明

## 环境切换方法

### 生产环境
```bash
cp .env.production .env
docker-compose up -d
```

**特点：**
- 使用 PostgreSQL 生产数据库 `poker_platform`
- 端口：8000/8001/4000/8003
- CORS 只允许 `https://goodspage.cn`
- 调试模式关闭
- 数据持久化

---

### 测试环境
```bash
cp .env.test .env
docker-compose up -d
```

**特点：**
- 使用独立测试数据库 `poker_platform_test`
- 端口：8010/8011/4010/8013
- CORS 只允许 `https://test.goodspage.cn`
- 调试模式开启
- 不影响生产数据

---

### 开发环境
```bash
cp .env.development .env
# 本地运行（无需 Docker）
```

**特点：**
- 使用 SQLite 数据库（无需 PostgreSQL）
- 端口：8000/8001/4000/8003
- CORS 允许 `http://localhost:3000`
- 调试模式开启
- 热重载

---

## 环境变量说明

### 核心配置
| 变量 | 说明 | 生产 | 测试 | 开发 |
|------|------|------|------|------|
| `ENV` | 环境标识 | production | test | development |
| `DATABASE_URL` | 数据库连接 | poker_platform | poker_platform_test | dev.db |
| `JWT_SECRET` | JWT 密钥 | 生产密钥 | 测试密钥 | 开发密钥 |

### 端口配置
| 变量 | 服务 | 生产 | 测试 |
|------|------|------|------|
| `WALLET_SERVICE_PORT` | 钱包服务 | 8001 | 8011 |
| `COMMISSION_SERVICE_PORT` | 结算服务 | 8000 | 8010 |
| `BFF_PORT` | BFF 聚合层 | 4000 | 4010 |
| `GAME_ENGINE_PORT` | 游戏引擎 | 8003 | 8013 |

### 游戏配置
| 变量 | 说明 | 默认值 |
|------|------|--------|
| `PLATFORM_FEE_RATE` | 平台抽成比例 | 0.0300 |
| `AGENT_COMMISSION_RATE` | 代理返佣比例 | 0.0300 |
| `DISCONNECT_TIMEOUT_MS` | 断线超时时间 | 300000 |

---

## 数据库切换步骤

### 1. 创建测试数据库
```sql
CREATE DATABASE poker_platform_test;
```

### 2. 初始化测试表结构
```bash
# 使用生产表结构初始化测试库
docker exec poker-postgres pg_dump -U poker_admin --schema-only poker_platform | \
  docker exec -i poker-postgres psql -U poker_admin -d poker_platform_test
```

### 3. 切换到测试环境
```bash
cp .env.test .env
docker-compose down
docker-compose up -d
```

### 4. 切换回生产环境
```bash
cp .env.production .env
docker-compose down
docker-compose up -d
```

---

## 安全建议

1. **不要把 `.env` 提交到 Git**
   - `.env` 包含真实密钥，已在 `.gitignore` 中
   - `.env.production` 可以提交，但密钥要换成占位符

2. **生产环境密钥**
   - 生产环境部署后，务必修改 `JWT_SECRET`
   - 使用强随机字符串作为密钥

3. **数据库密码**
   - 生产环境务必修改 `POSTGRES_PASSWORD`
   - 不要使用默认密码

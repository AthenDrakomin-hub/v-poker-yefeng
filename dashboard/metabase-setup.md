# Metabase BI 数据看板配置指南

本指南指导运维团队基于 Metabase 快速连接 SQLite/PostgreSQL 数据库，搭建虚拟经济系统监控大屏。

---

## 1. 核心看板指标与 SQL 查询模版

### 1.1 能量守恒总控仪表盘 (卡片 1 - 红色最高警报)
> 规则：当 `difference != 0` 时，系统触发钉钉/企业微信/PagerDuty 实时告警，并自动熔断转账。

```sql
SELECT
    (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'mint' AND status = 'success') AS total_minted,
    (SELECT COALESCE(SUM(balance + frozen_balance), 0) FROM wallets) AS total_wallets_balance,
    (SELECT balance FROM fee_pool WHERE pool_id = 'platform_fee') AS fee_pool_balance,
    (
        (SELECT COALESCE(SUM(balance + frozen_balance), 0) FROM wallets) +
        (SELECT balance FROM fee_pool WHERE pool_id = 'platform_fee') -
        (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'mint' AND status = 'success')
    ) AS difference,
    CASE 
        WHEN (
            (SELECT COALESCE(SUM(balance + frozen_balance), 0) FROM wallets) +
            (SELECT balance FROM fee_pool WHERE pool_id = 'platform_fee') -
            (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'mint' AND status = 'success')
        ) = 0 THEN 'CONSERVED (正常)'
        ELSE 'VIOLATION (严重资产泄漏/虚增!)'
    END AS conservation_status;
```

---

### 1.2 每日平台手续费收入趋势 (卡片 2 - 面积折线图)

```sql
SELECT 
    DATE(datetime(created_at / 1000, 'unixepoch')) AS settle_date,
    SUM(fee) AS daily_collected_fee,
    COUNT(transaction_id) AS tx_volume
FROM transactions
WHERE status = 'success'
GROUP BY settle_date
ORDER BY settle_date DESC
LIMIT 30;
```

---

### 1.3 代理返佣排行榜 (卡片 3 - 条形图)

```sql
SELECT 
    sl.agent_id,
    a.level,
    a.r_ratio,
    SUM(sl.commission_amount) AS total_commission_earned,
    COUNT(DISTINCT sl.transaction_id) AS settled_games_count
FROM settlement_logs sl
JOIN agents a ON sl.agent_id = a.agent_id
GROUP BY sl.agent_id, a.level, a.r_ratio
ORDER BY total_commission_earned DESC
LIMIT 20;
```

---

### 1.4 对局桌均流水分布 (卡片 4 - 直方图)

```sql
SELECT 
    room_id,
    SUM(total_flow) AS room_total_flow,
    COUNT(transaction_id) AS hands_played,
    AVG(total_flow) AS avg_pot_size
FROM game_records
GROUP BY room_id
ORDER BY room_total_flow DESC;
```

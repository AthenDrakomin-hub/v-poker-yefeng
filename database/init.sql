-- ====================================================================
-- 棋牌微服务虚拟经济平台 - 数据库初始化脚本 (SQLite / PostgreSQL 兼容)
-- ====================================================================

-- 1. 钱包表 wallets
CREATE TABLE IF NOT EXISTS wallets (
    wallet_id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) UNIQUE NOT NULL,
    user_type VARCHAR(20) NOT NULL, -- admin, support, agent, player
    balance BIGINT NOT NULL DEFAULT 0,
    frozen_balance BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wallets_user ON wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_wallets_type ON wallets(user_type);

-- 2. 流水账本 transactions
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id VARCHAR(64) PRIMARY KEY,
    from_wallet_id VARCHAR(64),
    to_wallet_id VARCHAR(64) NOT NULL,
    amount BIGINT NOT NULL,
    fee BIGINT NOT NULL DEFAULT 0,
    fee_recipient VARCHAR(64) NOT NULL DEFAULT 'platform_fee',
    type VARCHAR(32) NOT NULL, -- mint, transfer, game_settle
    status VARCHAR(20) NOT NULL, -- pending, success, failed
    remark TEXT,
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_from ON transactions(from_wallet_id);
CREATE INDEX IF NOT EXISTS idx_tx_to ON transactions(to_wallet_id);
CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_tx_created ON transactions(created_at);

-- 3. 手续费池 fee_pool
CREATE TABLE IF NOT EXISTS fee_pool (
    pool_id VARCHAR(32) PRIMARY KEY,
    balance BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL
);

-- 初始化固定手续费池账户
INSERT OR IGNORE INTO fee_pool (pool_id, balance, updated_at) 
VALUES ('platform_fee', 0, 1726531200000);

-- 4. 代理表 agents
CREATE TABLE IF NOT EXISTS agents (
    agent_id VARCHAR(64) PRIMARY KEY,
    parent_id VARCHAR(64),
    level INT NOT NULL DEFAULT 0,
    r_ratio DECIMAL(6,4) NOT NULL, -- 如 0.4000
    commission_balance BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_id);

-- 5. 游戏流水 game_records
CREATE TABLE IF NOT EXISTS game_records (
    transaction_id VARCHAR(64) PRIMARY KEY,
    room_id VARCHAR(64) NOT NULL,
    total_flow BIGINT NOT NULL,
    player_count INT NOT NULL,
    created_at BIGINT NOT NULL,
    settlement_status VARCHAR(20) NOT NULL DEFAULT 'settled'
);

CREATE INDEX IF NOT EXISTS idx_game_room ON game_records(room_id);

-- 6. 结算分账 settlement_logs
CREATE TABLE IF NOT EXISTS settlement_logs (
    settlement_id VARCHAR(64) PRIMARY KEY,
    transaction_id VARCHAR(64) NOT NULL,
    agent_id VARCHAR(64) NOT NULL,
    level INT NOT NULL,
    commission_amount BIGINT NOT NULL,
    platform_revenue BIGINT NOT NULL,
    created_at BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_settle_tx ON settlement_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_settle_agent ON settlement_logs(agent_id);

-- 7. 预置种子数据 (系统初始管理员与基础代理树)
INSERT OR IGNORE INTO wallets (wallet_id, user_id, user_type, balance, frozen_balance, updated_at)
VALUES 
('w_admin_root', 'u_admin_001', 'admin', 0, 0, 1726531200000),
('w_support_01', 'u_support_001', 'support', 0, 0, 1726531200000),
('w_agent_top', 'agt_top_01', 'agent', 0, 0, 1726531200000),
('w_agent_sub', 'agt_sub_02', 'agent', 0, 0, 1726531200000),
('w_agent_room', 'agt_room_03', 'agent', 0, 0, 1726531200000),
('w_player_alice', 'p_alice', 'player', 0, 0, 1726531200000),
('w_player_bob', 'p_bob', 'player', 0, 0, 1726531200000),
('w_player_charlie', 'p_charlie', 'player', 0, 0, 1726531200000);

-- 三级代理测试树: agt_top_01 (总代 level 2, r=0.20) -> agt_sub_02 (二级代 level 1, r=0.30) -> agt_room_03 (开房代理 level 0, r=0.50)
INSERT OR IGNORE INTO agents (agent_id, parent_id, level, r_ratio, commission_balance, status)
VALUES 
('agt_top_01', NULL, 2, 0.2000, 0, 'active'),
('agt_sub_02', 'agt_top_01', 1, 0.3000, 0, 'active'),
('agt_room_03', 'agt_sub_02', 0, 0.5000, 0, 'active');

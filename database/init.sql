-- ============================================================
-- 棋牌平台数据库初始化脚本 v2.0
-- 数据库：PostgreSQL 16
-- 说明：封闭式虚拟经济系统，筹码唯一货币，无法币接口
-- ============================================================

-- 1. 钱包表 wallets
CREATE TABLE IF NOT EXISTS wallets (
    wallet_id      VARCHAR(64) PRIMARY KEY,
    user_id        VARCHAR(64) NOT NULL UNIQUE,
    user_type      VARCHAR(20) NOT NULL,
    balance        BIGINT NOT NULL DEFAULT 0,
    frozen_balance BIGINT NOT NULL DEFAULT 0,
    updated_at     BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_wallets_user_id ON wallets(user_id);
CREATE INDEX IF NOT EXISTS ix_wallets_wallet_id ON wallets(wallet_id);

-- 2. 流水账本 transactions
CREATE TABLE IF NOT EXISTS transactions (
    transaction_id VARCHAR(64) PRIMARY KEY,
    from_wallet_id VARCHAR(64),
    to_wallet_id   VARCHAR(64) NOT NULL,
    amount         BIGINT NOT NULL,
    fee            BIGINT NOT NULL DEFAULT 0,
    fee_recipient  VARCHAR(64) NOT NULL DEFAULT 'platform_fee',
    type           VARCHAR(32) NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'success',
    remark         TEXT,
    created_at     BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_transactions_transaction_id ON transactions(transaction_id);
CREATE INDEX IF NOT EXISTS ix_transactions_from_wallet_id ON transactions(from_wallet_id);
CREATE INDEX IF NOT EXISTS ix_transactions_to_wallet_id ON transactions(to_wallet_id);
CREATE INDEX IF NOT EXISTS ix_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS ix_transactions_created_at ON transactions(created_at);

-- 3. 手续费池 fee_pool
CREATE TABLE IF NOT EXISTS fee_pool (
    pool_id    VARCHAR(32) PRIMARY KEY,
    balance    BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL
);

-- 4. 代理分佣表 agents
CREATE TABLE IF NOT EXISTS agents (
    agent_id           VARCHAR(64) PRIMARY KEY,
    parent_id          VARCHAR(64),
    level              INT NOT NULL DEFAULT 0,
    r_ratio            NUMERIC(6,4) NOT NULL,
    commission_balance BIGINT NOT NULL DEFAULT 0,
    status             VARCHAR(20) NOT NULL DEFAULT 'active'
);

CREATE INDEX IF NOT EXISTS ix_agents_agent_id ON agents(agent_id);
CREATE INDEX IF NOT EXISTS ix_agents_parent_id ON agents(parent_id);

-- 5. 游戏对局流水表 game_records
CREATE TABLE IF NOT EXISTS game_records (
    transaction_id    VARCHAR(64) PRIMARY KEY,
    room_id           VARCHAR(64) NOT NULL,
    round_no          INT NOT NULL DEFAULT 1,
    total_flow        BIGINT NOT NULL,
    player_count      INT NOT NULL,
    settlement_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at        BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_game_records_transaction_id ON game_records(transaction_id);
CREATE INDEX IF NOT EXISTS ix_game_records_room_id ON game_records(room_id);

-- 6. 结算分账明细 settlement_logs
CREATE TABLE IF NOT EXISTS settlement_logs (
    settlement_id     VARCHAR(64) PRIMARY KEY,
    transaction_id    VARCHAR(64) NOT NULL,
    agent_id          VARCHAR(64) NOT NULL,
    level             INT NOT NULL,
    commission_amount BIGINT NOT NULL,
    platform_revenue  BIGINT NOT NULL,
    created_at        BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_settlement_logs_settlement_id ON settlement_logs(settlement_id);
CREATE INDEX IF NOT EXISTS ix_settlement_logs_transaction_id ON settlement_logs(transaction_id);
CREATE INDEX IF NOT EXISTS ix_settlement_logs_agent_id ON settlement_logs(agent_id);

-- 7. 房间表 rooms 🆕 v2 新增
CREATE TABLE IF NOT EXISTS rooms (
    room_id               VARCHAR(16) PRIMARY KEY,
    room_name             VARCHAR(64),
    room_password         VARCHAR(8) DEFAULT '',
    game_type             VARCHAR(32) NOT NULL,
    mode                  VARCHAR(32) NOT NULL DEFAULT 'cash',
    total_rounds          INT NOT NULL DEFAULT 10,
    base_score            BIGINT NOT NULL DEFAULT 100,
    platform_fee_rate     NUMERIC(6,4) NOT NULL DEFAULT 0.0500,
    agent_commission_rate NUMERIC(6,4) NOT NULL DEFAULT 0.0300,
    min_players           INT NOT NULL DEFAULT 2,
    max_players           INT NOT NULL DEFAULT 6,
    big_blind             BIGINT,
    rake_cap_multiplier   INT NOT NULL DEFAULT 5,
    created_by            VARCHAR(64) NOT NULL,
    room_type             VARCHAR(16) NOT NULL DEFAULT 'public',
    status                VARCHAR(16) NOT NULL DEFAULT 'waiting',
    current_round         INT NOT NULL DEFAULT 0,
    created_at            BIGINT NOT NULL,
    updated_at            BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_rooms_room_id ON rooms(room_id);
CREATE INDEX IF NOT EXISTS ix_rooms_created_by ON rooms(created_by);
CREATE INDEX IF NOT EXISTS ix_rooms_game_type ON rooms(game_type);
CREATE INDEX IF NOT EXISTS ix_rooms_status ON rooms(status);

-- 8. 房间玩家关联表 room_players 🆕 v2.1 新增
CREATE TABLE IF NOT EXISTS room_players (
    room_id    VARCHAR(16) NOT NULL,
    user_id    VARCHAR(64) NOT NULL,
    seat_no    INT NOT NULL,
    is_ready   BOOLEAN NOT NULL DEFAULT FALSE,
    joined_at  BIGINT NOT NULL,
    left_at    BIGINT,
    status     VARCHAR(16) NOT NULL DEFAULT 'sitting',
    PRIMARY KEY (room_id, user_id)
);

CREATE INDEX IF NOT EXISTS ix_room_players_room_id ON room_players(room_id);
CREATE INDEX IF NOT EXISTS ix_room_players_user_id ON room_players(user_id);

-- 9. 房间聊天消息表 room_chat_messages 🆕 v2.2 新增
CREATE TABLE IF NOT EXISTS room_chat_messages (
    message_id  VARCHAR(64) PRIMARY KEY,
    room_id     VARCHAR(16) NOT NULL,
    user_id     VARCHAR(64) NOT NULL,
    username    VARCHAR(64) NOT NULL,
    message_type VARCHAR(16) NOT NULL DEFAULT 'text', -- text/emoji/system
    content     TEXT NOT NULL,
    created_at  BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_room_chat_messages_room_id ON room_chat_messages(room_id);
CREATE INDEX IF NOT EXISTS ix_room_chat_messages_created_at ON room_chat_messages(created_at);

-- 10. 好友关系表 friends 🆕 v2.2 新增
CREATE TABLE IF NOT EXISTS friends (
    id          SERIAL PRIMARY KEY,
    user_id     VARCHAR(64) NOT NULL,
    friend_id   VARCHAR(64) NOT NULL,
    friend_note VARCHAR(64),
    status      VARCHAR(16) NOT NULL DEFAULT 'active', -- active/blocked
    created_at  BIGINT NOT NULL,
    UNIQUE(user_id, friend_id)
);

CREATE INDEX IF NOT EXISTS ix_friends_user_id ON friends(user_id);
CREATE INDEX IF NOT EXISTS ix_friends_friend_id ON friends(friend_id);

-- 11. 游戏回放表 game_replays 🆕 v2.2 新增
CREATE TABLE IF NOT EXISTS game_replays (
    replay_id      VARCHAR(64) PRIMARY KEY,
    room_id        VARCHAR(16) NOT NULL,
    game_type      VARCHAR(32) NOT NULL,
    round_no       INT NOT NULL,
    players        JSONB NOT NULL, -- 玩家列表和座位
    actions        JSONB NOT NULL, -- 所有操作记录
    result         JSONB NOT NULL, -- 结算结果
    duration_sec   INT,
    created_at     BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_game_replays_room_id ON game_replays(room_id);
CREATE INDEX IF NOT EXISTS ix_game_replays_created_at ON game_replays(created_at);

-- 8. Bot 使用统计表 bot_usage
CREATE TABLE IF NOT EXISTS bot_usage (
    id             SERIAL PRIMARY KEY,
    room_id        VARCHAR(64) NOT NULL,
    bot_count      INT NOT NULL,
    strategy       VARCHAR(20) NOT NULL DEFAULT 'loose',
    total_rake     BIGINT NOT NULL DEFAULT 0,
    created_at     BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_bot_usage_room_id ON bot_usage(room_id);

-- 9. 用户统计表 user_stats
CREATE TABLE IF NOT EXISTS user_stats (
    user_id        VARCHAR(64) PRIMARY KEY,
    total_hands    INT NOT NULL DEFAULT 0,
    total_wins     INT NOT NULL DEFAULT 0,
    total_pot      BIGINT NOT NULL DEFAULT 0,
    biggest_pot    BIGINT NOT NULL DEFAULT 0,
    win_rate       NUMERIC(5,2) NOT NULL DEFAULT 0,
    updated_at     BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS ix_user_stats_win_rate ON user_stats(win_rate DESC);
CREATE INDEX IF NOT EXISTS ix_user_stats_total_pot ON user_stats(total_pot DESC);

-- ============================================================
-- 初始数据插入
-- ============================================================

-- 手续费池
INSERT INTO fee_pool (pool_id, balance, updated_at)
VALUES ('platform_fee', 0, EXTRACT(EPOCH FROM NOW()) * 1000)
ON CONFLICT (pool_id) DO NOTHING;

-- 平台钱包（虚拟）
INSERT INTO wallets (wallet_id, user_id, user_type, balance, frozen_balance, updated_at)
VALUES ('w_player_platform', 'platform', 'admin', 0, 0, EXTRACT(EPOCH FROM NOW()) * 1000)
ON CONFLICT (wallet_id) DO NOTHING;

-- 三级代理测试树: agt_top_01 (总代 level 2, r=0.20) -> agt_sub_02 (二级代 level 1, r=0.30) -> agt_room_03 (开房代理 level 0, r=0.50)
INSERT INTO agents (agent_id, parent_id, level, r_ratio, commission_balance, status)
VALUES
('agt_top_01', NULL, 2, 0.2000, 0, 'active'),
('agt_sub_02', 'agt_top_01', 1, 0.3000, 0, 'active'),
('agt_room_03', 'agt_sub_02', 0, 0.5000, 0, 'active')
ON CONFLICT (agent_id) DO NOTHING;

-- ============================================================
-- 数据字典说明
-- ============================================================

-- wallets.user_type 枚举值：
--   admin    管理员
--   support  客服
--   agent    代理
--   player   玩家
--   room     牌桌虚拟钱包（v2 新增）

-- transactions.type 枚举值：
--   mint         管理员铸币（唯一资金来源）
--   transfer     用户自由转账（扣 0.01% 手续费）
--   game_settle  游戏结算（牌桌→赢家+平台）
--   bet          下注（玩家→牌桌虚拟钱包）（v2 新增）
--   refund       异常退款（牌桌→玩家）（v2 新增）
--   commission   代理佣金到账（牌桌→代理）（v2 新增）

-- rooms.status 枚举值：
--   waiting   等待开局
--   playing   游戏中
--   finished  已结束

-- rooms.game_type 枚举值：
--   texas_holdem  德州扑克
--   zha_jin_hua   炸金花
--   niu_niu       牛牛
--   san_gong      三公

-- agents.status 枚举值：
--   active    正常
--   frozen    冻结

-- transactions.status 枚举值：
--   pending   处理中
--   success   成功
--   failed    失败

-- game_records.settlement_status 枚举值：
--   pending    待结算
--   settled    已结算
--   failed     结算失败

-- ============================================================
-- 能量守恒公式（系统硬约束）：
--   SUM(wallets.balance) + SUM(fee_pool.balance) = SUM(transactions.amount WHERE type='mint')
-- ============================================================

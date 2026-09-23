"""
数据库模型定义 (遵循全局契约字典)
"""
from sqlalchemy import Column, String, BigInteger, Integer, Numeric, Text, Boolean
from app.database import Base


class Wallet(Base):
    """
    钱包表 wallets: 存储各角色用户筹码与冻结余额
    """
    __tablename__ = "wallets"

    wallet_id = Column(String(64), primary_key=True, index=True)
    user_id = Column(String(64), unique=True, nullable=False, index=True)
    user_type = Column(String(20), nullable=False)  # admin / support / agent / player
    balance = Column(BigInteger, nullable=False, default=0)
    frozen_balance = Column(BigInteger, nullable=False, default=0)
    updated_at = Column(BigInteger, nullable=False)


class Transaction(Base):
    """
    流水账本 transactions: 全局唯一流水，支持幂等校验
    """
    __tablename__ = "transactions"

    transaction_id = Column(String(64), primary_key=True, index=True)
    from_wallet_id = Column(String(64), nullable=True, index=True)
    to_wallet_id = Column(String(64), nullable=False, index=True)
    amount = Column(BigInteger, nullable=False)
    fee = Column(BigInteger, nullable=False, default=0)
    fee_recipient = Column(String(64), nullable=False, default="platform_fee")
    type = Column(String(32), nullable=False, index=True)  # mint / transfer / bet / refund / game_settle
    status = Column(String(20), nullable=False, default="success")  # pending / success / failed
    remark = Column(Text, nullable=True)
    created_at = Column(BigInteger, nullable=False, index=True)


class FeePool(Base):
    """
    手续费池 fee_pool: 平台固定手续费归集池
    """
    __tablename__ = "fee_pool"

    pool_id = Column(String(32), primary_key=True, default="platform_fee")
    balance = Column(BigInteger, nullable=False, default=0)
    updated_at = Column(BigInteger, nullable=False)


class Agent(Base):
    """
    代理表 agents: 层级分销与抽佣比例模型
    """
    __tablename__ = "agents"

    agent_id = Column(String(64), primary_key=True, index=True)
    parent_id = Column(String(64), nullable=True, index=True)
    level = Column(Integer, nullable=False, default=0)  # 0=开房代理, 1=二级代理, 2=总代
    r_ratio = Column(Numeric(6, 4), nullable=False)  # 该级抽成比例 r_i，如 0.4000
    commission_balance = Column(BigInteger, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="active")  # active / frozen


class GameRecord(Base):
    """
    游戏流水表 game_records: 记录德扑每局总流水及房间信息
    """
    __tablename__ = "game_records"

    transaction_id = Column(String(64), primary_key=True, index=True)
    room_id = Column(String(64), nullable=False, index=True)
    round_no = Column(Integer, nullable=False, default=1)  # 第几局
    total_flow = Column(BigInteger, nullable=False)  # 总流水 S
    player_count = Column(Integer, nullable=False)
    created_at = Column(BigInteger, nullable=False)
    settlement_status = Column(String(20), nullable=False, default="settled")  # pending / settled / failed


class SettlementLog(Base):
    """
    结算分账 settlement_logs: 记录代理返佣明细
    """
    __tablename__ = "settlement_logs"

    settlement_id = Column(String(64), primary_key=True, index=True)
    transaction_id = Column(String(64), nullable=False, index=True)
    agent_id = Column(String(64), nullable=False, index=True)
    level = Column(Integer, nullable=False)
    commission_amount = Column(BigInteger, nullable=False)
    platform_revenue = Column(BigInteger, nullable=False)
    created_at = Column(BigInteger, nullable=False)


class Room(Base):
    """
    房间表 rooms: 持久化房间配置
    对齐全局契约：6 位房号 + 可选密码 + 游戏参数
    """
    __tablename__ = "rooms"

    room_id = Column(String(16), primary_key=True, index=True)  # 6 位数字房号
    room_name = Column(String(64), nullable=True)  # 房间名称
    room_password = Column(String(8), nullable=True, default="")  # 0-4 位数字密码，空为公开房
    game_type = Column(String(32), nullable=False, index=True)  # texas_holdem / zha_jin_hua / niu_niu / san_gong
    mode = Column(String(32), nullable=False, default="cash")  # cash / sng /抢庄/通比
    total_rounds = Column(Integer, nullable=False, default=10)  # 总局数
    base_score = Column(BigInteger, nullable=False, default=100)  # 底分
    platform_fee_rate = Column(Numeric(6, 4), nullable=False, default=0.0500)  # 平台抽水率
    agent_commission_rate = Column(Numeric(6, 4), nullable=False, default=0.0300)  # 代理返佣率
    min_players = Column(Integer, nullable=False, default=2)  # 最低开局人数
    max_players = Column(Integer, nullable=False, default=6)  # 最大人数
    big_blind = Column(BigInteger, nullable=True)  # 大盲注（德州专用）
    rake_cap_multiplier = Column(Integer, nullable=False, default=5)  # 抽水上限倍数
    created_by = Column(String(64), nullable=False, index=True)  # 创建者 ID（代理/房主）
    room_type = Column(String(16), nullable=False, default="public")  # public / private
    status = Column(String(16), nullable=False, default="waiting", index=True)  # waiting / playing / finished
    current_round = Column(Integer, nullable=False, default=0)  # 当前第几局
    created_at = Column(BigInteger, nullable=False)
    updated_at = Column(BigInteger, nullable=False)


class UserStats(Base):
    """玩家统计表 user_stats"""
    __tablename__ = "user_stats"
    user_id = Column(String(64), primary_key=True)
    total_hands = Column(Integer, nullable=False, default=0)
    total_wins = Column(Integer, nullable=False, default=0)
    total_pot = Column(BigInteger, nullable=False, default=0)
    biggest_pot = Column(BigInteger, nullable=False, default=0)
    win_rate = Column(Numeric(5, 2), nullable=False, default=0)
    updated_at = Column(BigInteger, nullable=False)


class Friend(Base):
    """好友关系表 friends"""
    __tablename__ = "friends"
    id = Column(String(64), primary_key=True)
    user_id = Column(String(64), nullable=False, index=True)
    friend_id = Column(String(64), nullable=False, index=True)
    friend_note = Column(String(64), nullable=True)
    status = Column(String(16), nullable=False, default="active")
    created_at = Column(BigInteger, nullable=False)


class Achievement(Base):
    """成就定义表 achievements"""
    __tablename__ = "achievements"
    id = Column(String(64), primary_key=True)
    name = Column(String(64), nullable=False)
    description = Column(String(256), nullable=False)
    icon = Column(String(8), nullable=False, default="♠")
    condition_type = Column(String(32), nullable=False)
    condition_value = Column(Integer, nullable=False, default=1)
    created_at = Column(BigInteger, nullable=False)


class UserAchievement(Base):
    """玩家成就解锁表 user_achievements"""
    __tablename__ = "user_achievements"
    id = Column(String(64), primary_key=True)
    user_id = Column(String(64), nullable=False, index=True)
    achievement_id = Column(String(64), nullable=False)
    unlocked = Column(Boolean, nullable=False, default=False)
    unlocked_at = Column(BigInteger, nullable=True)


class Message(Base):
    """系统消息表 messages"""
    __tablename__ = "messages"
    message_id = Column(String(64), primary_key=True)
    user_id = Column(String(64), nullable=False, index=True)
    title = Column(String(128), nullable=False)
    content = Column(Text, nullable=False)
    is_read = Column(Boolean, nullable=False, default=False)
    created_at = Column(BigInteger, nullable=False)

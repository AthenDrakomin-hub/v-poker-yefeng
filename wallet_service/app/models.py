"""
数据库模型定义 (遵循全局契约字典)
"""
from sqlalchemy import Column, String, BigInteger, Integer, Numeric, Text
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
    type = Column(String(32), nullable=False, index=True)  # mint / transfer / game_settle
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

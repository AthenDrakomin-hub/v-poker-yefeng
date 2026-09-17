"""
结算微服务数据模型 (代理树与返佣日志)
"""
from sqlalchemy import Column, String, BigInteger, Integer, Numeric
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class Agent(Base):
    """
    代理表：管理代理上下级关系与分成比例
    """
    __tablename__ = "agents"

    agent_id = Column(String(64), primary_key=True, index=True)
    parent_id = Column(String(64), nullable=True, index=True)
    level = Column(Integer, nullable=False, default=0)
    r_ratio = Column(Numeric(6, 4), nullable=False)
    commission_balance = Column(BigInteger, nullable=False, default=0)
    status = Column(String(20), nullable=False, default="active")


class SettlementLog(Base):
    """
    结算分账记录
    """
    __tablename__ = "settlement_logs"

    settlement_id = Column(String(64), primary_key=True, index=True)
    transaction_id = Column(String(64), nullable=False, index=True)
    agent_id = Column(String(64), nullable=False, index=True)
    level = Column(Integer, nullable=False)
    commission_amount = Column(BigInteger, nullable=False)
    platform_revenue = Column(BigInteger, nullable=False)
    created_at = Column(BigInteger, nullable=False)

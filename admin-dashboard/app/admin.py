"""
FastAPI-Admin 管理端后台核心配置与资源挂载
包含：
1. 能量守恒全景大盘 (Dashboard Alert)
2. 铸币管理操作台 (Minting Resource)
3. 钱包资产与手续费池监控 (Wallets & Fee Pool Resource)
4. 代理树与返佣比例配置 (Agent Resource)
"""
from fastapi import FastAPI
from fastapi_admin.app import app as admin_app
from fastapi_admin.resources import Link, Model, Dropdown
from fastapi_admin.widgets import displays, inputs


class WalletResource(Model):
    label = "钱包账户管理"
    model = "Wallet"
    fields = [
        "wallet_id",
        "user_id",
        "user_type",
        "balance",
        "frozen_balance",
        "updated_at",
    ]


class TransactionResource(Model):
    label = "全局流水账本"
    model = "Transaction"
    fields = [
        "transaction_id",
        "from_wallet_id",
        "to_wallet_id",
        "amount",
        "fee",
        "type",
        "status",
        "created_at",
    ]


class FeePoolResource(Model):
    label = "平台手续费池"
    model = "FeePool"
    fields = ["pool_id", "balance", "updated_at"]


class AgentResource(Model):
    label = "代理层级树"
    model = "Agent"
    fields = ["agent_id", "parent_id", "level", "r_ratio", "commission_balance", "status"]

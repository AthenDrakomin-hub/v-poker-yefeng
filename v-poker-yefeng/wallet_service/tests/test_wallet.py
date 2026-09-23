"""
钱包服务端到端核心业务集成测试
覆盖：
1. 管理员铸币 1,000,000 筹码到 Alice
2. Alice 下注 5 万到牌桌，Bob 下注 5 万到牌桌（牌桌钱包 10 万）
3. 结算：赢家 Alice 拿走 9.7 万，房费 3000，代理返佣 2000，平台留存 1000
4. 审计：确认能量守恒
5. 异常退款：退款给 Alice 和 Bob，审计确认守恒
6. 幂等性拦截
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import engine, Base


@pytest_asyncio.fixture(autouse=True)
async def prepare_database():
    """每个测试执行前重置数据库表结构并初始化 seed 数据"""
    from app.database import AsyncSessionLocal
    from app.models import Agent

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    # seed 三级代理测试数据
    async with AsyncSessionLocal() as session:
        session.add_all([
            Agent(agent_id="agt_top_01", parent_id=None, level=2, r_ratio=0.2000, commission_balance=0, status="active"),
            Agent(agent_id="agt_sub_02", parent_id="agt_top_01", level=1, r_ratio=0.3000, commission_balance=0, status="active"),
            Agent(agent_id="agt_room_03", parent_id="agt_sub_02", level=0, r_ratio=0.5000, commission_balance=0, status="active")
        ])
        await session.commit()
    yield


@pytest.mark.asyncio
async def test_full_economy_loop_with_bet_and_settle():
    """
    完整资金闭环测试：铸币 → 下注 → 结算 → 守恒 → 退款 → 守恒
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:

        # ========== 1. 铸币 100 万给 Alice，再铸 10 万给 Bob ==========
        res = await client.post("/api/wallet/mint", json={
            "transaction_id": "tx_mint_alice_001",
            "admin_user_id": "u_admin_root",
            "target_user_id": "p_alice",
            "amount": 1000000,
            "remark": "Alice initial bankroll"
        })
        assert res.status_code == 200
        assert res.json()["data"]["balance"] == 1000000

        res = await client.post("/api/wallet/mint", json={
            "transaction_id": "tx_mint_bob_001",
            "admin_user_id": "u_admin_root",
            "target_user_id": "p_bob",
            "amount": 100000,
            "remark": "Bob initial bankroll"
        })
        assert res.status_code == 200
        assert res.json()["data"]["balance"] == 100000

        # ========== 2. Alice 下注 5 万到牌桌 ==========
        res = await client.post("/api/wallet/bet", json={
            "transaction_id": "tx_bet_alice_001",
            "room_id": "888",
            "user_id": "p_alice",
            "amount": 50000,
            "remark": "Alice bet 50k"
        })
        assert res.status_code == 200
        bet_data = res.json()["data"]
        assert bet_data["player_balance"] == 950000
        assert bet_data["room_balance"] == 50000

        # ========== 3. Bob 下注 5 万到牌桌 ==========
        res = await client.post("/api/wallet/bet", json={
            "transaction_id": "tx_bet_bob_001",
            "room_id": "888",
            "user_id": "p_bob",
            "amount": 50000,
            "remark": "Bob bet 50k"
        })
        assert res.status_code == 200
        bet_data = res.json()["data"]
        assert bet_data["player_balance"] == 50000
        assert bet_data["room_balance"] == 100000

        # ========== 4. 结算：p=0.03, a=0.02 ==========
        # rake = floor(100000 * 0.03) = 3000
        # agent_pool = floor(100000 * 0.02) = 2000
        # winners_payout = 100000 - 3000 = 97000
        # platform_revenue = 3000 - 2000 = 1000
        res = await client.post("/api/wallet/game_settle", json={
            "transaction_id": "tx_settle_888_001",
            "room_id": "888",
            "total_pot": 100000,
            "winner_ids": ["p_alice"],
            "platform_fee_rate": "0.0300",
            "agent_commission_rate": "0.0200",
            "agent_ids": ["agt_room_03", "agt_sub_02", "agt_top_01"]
        })
        assert res.status_code == 200
        settle = res.json()["data"]
        assert settle["total_pot"] == 100000
        assert settle["total_rake"] == 3000
        assert settle["agent_pool"] == 2000
        assert settle["winners_payout"] == 97000
        assert settle["platform_revenue"] == 1000

        # 验证 Alice 余额：950000（下注后） + 97000（赢） = 1047000
        res = await client.get("/api/wallet/balance/p_alice")
        assert res.json()["data"]["balance"] == 1047000

        # 验证 Bob 余额：50000（下注后） = 50000
        res = await client.get("/api/wallet/balance/p_bob")
        assert res.json()["data"]["balance"] == 50000

        # 验证牌桌钱包余额：100000 - 100000 = 0
        res = await client.get("/api/wallet/balance/room_888")
        assert res.json()["data"]["balance"] == 0

        # ========== 5. 守恒校验：difference 必须为 0 ==========
        res = await client.get("/api/wallet/audit")
        audit = res.json()["data"]
        assert audit["difference"] == 0, f"Conservation violated: difference={audit['difference']}"
        assert audit["check_passed"] is True

        # ========== 6. 异常退款测试 ==========
        # 先下注到 room_999
        await client.post("/api/wallet/bet", json={
            "transaction_id": "tx_bet_alice_002",
            "room_id": "999",
            "user_id": "p_alice",
            "amount": 30000
        })
        await client.post("/api/wallet/bet", json={
            "transaction_id": "tx_bet_bob_002",
            "room_id": "999",
            "user_id": "p_bob",
            "amount": 20000
        })

        # 退款
        res = await client.post("/api/wallet/refund", json={
            "transaction_id": "tx_refund_999_001",
            "room_id": "999",
            "refunds": [
                {"user_id": "p_alice", "amount": 30000},
                {"user_id": "p_bob", "amount": 20000}
            ],
            "remark": "Abnormal refund"
        })
        assert res.status_code == 200
        refund = res.json()["data"]
        assert refund["total_refund"] == 50000
        assert refund["room_balance_after"] == 0

        # ========== 7. 退款后再次守恒校验 ==========
        res = await client.get("/api/wallet/audit")
        audit = res.json()["data"]
        assert audit["difference"] == 0, f"Conservation violated after refund: difference={audit['difference']}"
        assert audit["check_passed"] is True


@pytest.mark.asyncio
async def test_transfer_fee_calculation():
    """转账 0.01% 手续费计算校验"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/wallet/mint", json={
            "transaction_id": "tx_mint_001",
            "admin_user_id": "admin",
            "target_user_id": "alice",
            "amount": 1000000
        })

        res = await client.post("/api/wallet/transfer", json={
            "transaction_id": "tx_tf_001",
            "from_user_id": "alice",
            "to_user_id": "bob",
            "amount": 200000
        })
        tf = res.json()["data"]
        assert tf["fee"] == 20  # 200000 * 0.0001 = 20
        assert tf["net_amount"] == 199980


@pytest.mark.asyncio
async def test_idempotency_interception():
    """幂等性拦截：重复 transaction_id 必须被拒绝"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "transaction_id": "tx_dup_001",
            "admin_user_id": "admin",
            "target_user_id": "alice",
            "amount": 1000
        }
        res1 = await client.post("/api/wallet/mint", json=payload)
        assert res1.status_code == 200

        res2 = await client.post("/api/wallet/mint", json=payload)
        assert res2.status_code != 200 or res2.json()["code"] != 0


@pytest.mark.asyncio
async def test_insufficient_bet_balance():
    """下注余额不足必须被拒绝"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/wallet/mint", json={
            "transaction_id": "tx_mint_001",
            "admin_user_id": "admin",
            "target_user_id": "alice",
            "amount": 100
        })

        res = await client.post("/api/wallet/bet", json={
            "transaction_id": "tx_bet_001",
            "room_id": "1",
            "user_id": "alice",
            "amount": 500
        })
        assert res.status_code != 200 or res.json()["code"] != 0


@pytest.mark.asyncio
async def test_agent_rate_exceeds_fee():
    """代理返佣率 > 平台抽水率 必须被拦截"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/wallet/game_settle", json={
            "transaction_id": "tx_settle_bad",
            "room_id": "1",
            "total_pot": 10000,
            "winner_ids": ["p_eve"],
            "platform_fee_rate": "0.0300",
            "agent_commission_rate": "0.0500",
            "agent_ids": []
        })
        assert res.status_code != 200 or res.json()["code"] != 0

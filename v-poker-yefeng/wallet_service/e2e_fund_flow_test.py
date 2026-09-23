#!/usr/bin/env python3
"""
端到端资金闭环测试：模拟完整德州扑克游戏流程
验证：铸币 → 下注 → 结算 → 守恒 → 退款 → 守恒

运行前提：wallet-service 已在 http://127.0.0.1:8001 启动
运行方式：python3 e2e_fund_flow_test.py
"""

import asyncio
import httpx
import json
import sys
from decimal import Decimal

WALLET_URL = "http://127.0.0.1:8001"
ROOM_ID = "e2e_room_001"
ROOM_ID_ABORT = "e2e_room_abort"

# 颜色输出
class Colors:
    GREEN = "\033[92m"
    RED = "\033[91m"
    YELLOW = "\033[93m"
    BLUE = "\033[94m"
    BOLD = "\033[1m"
    END = "\033[0m"

def log_step(step: str):
    print(f"\n{Colors.BOLD}{Colors.BLUE}═══ {step} ═══{Colors.END}")

def log_ok(msg: str):
    print(f"{Colors.GREEN}✅ {msg}{Colors.END}")

def log_fail(msg: str):
    print(f"{Colors.RED}❌ {msg}{Colors.END}")

def log_info(msg: str):
    print(f"  {msg}")

# ============================================================
# HTTP 工具函数
# ============================================================

async def wallet_post(client: httpx.AsyncClient, path: str, body: dict) -> dict:
    log_info(f"POST {path}")
    log_info(f"  请求: {json.dumps(body, ensure_ascii=False)}")
    res = await client.post(f"{WALLET_URL}{path}", json=body)
    data = res.json()
    log_info(f"  响应: code={data.get('code')}, message={data.get('message')}")
    if data.get("data"):
        log_info(f"  数据: {json.dumps(data['data'], ensure_ascii=False)}")
    return data

async def wallet_get(client: httpx.AsyncClient, path: str) -> dict:
    log_info(f"GET {path}")
    res = await client.get(f"{WALLET_URL}{path}")
    data = res.json()
    if data.get("data"):
        log_info(f"  数据: {json.dumps(data['data'], ensure_ascii=False)}")
    return data

async def get_balance(client: httpx.AsyncClient, user_id: str) -> int:
    res = await wallet_get(client, f"/api/wallet/balance/{user_id}")
    return res["data"]["balance"]

# ============================================================
# 主测试流程
# ============================================================

async def run_e2e_test():
    print(f"{Colors.BOLD}{'='*60}")
    print(f"🎮 端到端资金闭环测试 - 德州扑克完整对局")
    print(f"{'='*60}{Colors.END}")

    async with httpx.AsyncClient(timeout=10.0) as client:
        # 健康检查
        try:
            await wallet_get(client, "/api/wallet/audit")
            log_ok("wallet-service 连接成功")
        except Exception as e:
            log_fail(f"wallet-service 连接失败: {e}")
            sys.exit(1)

        # 记录初始余额
        initial_balances = {}
        final_balances = {}

        # ============================================================
        # 场景一：完整对局
        # ============================================================

        log_step("场景一：完整对局 - 铸币")

        # 1. 铸币给 Alice、Bob、Charlie 各 100 万
        players = ["alice", "bob", "charlie"]
        for i, p in enumerate(players):
            res = await wallet_post(client, "/api/wallet/mint", {
                "transaction_id": f"e2e_mint_{p}_{asyncio.get_event_loop().time()}",
                "admin_user_id": "admin_root",
                "target_user_id": p,
                "amount": 1000000,
                "remark": "E2E test mint"
            })
            initial_balances[p] = res["data"]["balance"]
            log_info(f"  {p} 初始余额: {initial_balances[p]}")

        log_step("场景一：完整对局 - 下注")

        # 2. Alice 下注 5000
        await wallet_post(client, "/api/wallet/bet", {
            "transaction_id": f"e2e_bet_alice_1_{asyncio.get_event_loop().time()}",
            "room_id": ROOM_ID,
            "user_id": "alice",
            "amount": 5000,
            "remark": "Alice first bet"
        })

        # 3. Bob 跟注 5000
        await wallet_post(client, "/api/wallet/bet", {
            "transaction_id": f"e2e_bet_bob_1_{asyncio.get_event_loop().time()}",
            "room_id": ROOM_ID,
            "user_id": "bob",
            "amount": 5000,
            "remark": "Bob call"
        })

        # 4. Charlie 加注到 10000（下注 10000）
        await wallet_post(client, "/api/wallet/bet", {
            "transaction_id": f"e2e_bet_charlie_1_{asyncio.get_event_loop().time()}",
            "room_id": ROOM_ID,
            "user_id": "charlie",
            "amount": 10000,
            "remark": "Charlie raise to 10000"
        })

        # 5. Alice 跟注到 10000（再下注 5000）
        await wallet_post(client, "/api/wallet/bet", {
            "transaction_id": f"e2e_bet_alice_2_{asyncio.get_event_loop().time()}",
            "room_id": ROOM_ID,
            "user_id": "alice",
            "amount": 5000,
            "remark": "Alice call to 10000"
        })

        # 6. Bob 跟注到 10000（再下注 5000）
        await wallet_post(client, "/api/wallet/bet", {
            "transaction_id": f"e2e_bet_bob_2_{asyncio.get_event_loop().time()}",
            "room_id": ROOM_ID,
            "user_id": "bob",
            "amount": 5000,
            "remark": "Bob call to 10000"
        })

        # 验证牌桌余额
        room_bet_balance = await get_balance(client, f"room_{ROOM_ID}")
        expected_pot = 10000 + 10000 + 10000  # 每人各 10000
        if room_bet_balance == expected_pot:
            log_ok(f"牌桌余额正确: {room_bet_balance}")
        else:
            log_fail(f"牌桌余额错误: 期望 {expected_pot}, 实际 {room_bet_balance}")

        log_step("场景一：完整对局 - 结算")

        # 7. 结算：Charlie 赢
        # S=30000, p=0.03, a=0.02
        # rake = floor(30000 * 0.03) = 900
        # agent_pool = floor(30000 * 0.02) = 600
        # winners_payout = 30000 - 900 = 29100
        # platform_revenue = 900 - 600 = 300
        settle_res = await wallet_post(client, "/api/wallet/game_settle", {
            "transaction_id": f"e2e_settle_{ROOM_ID}_{asyncio.get_event_loop().time()}",
            "room_id": ROOM_ID,
            "total_pot": expected_pot,
            "winner_ids": ["charlie"],
            "platform_fee_rate": "0.0300",
            "agent_commission_rate": "0.0200",
            "agent_ids": ["agt_room_03", "agt_sub_02", "agt_top_01"]
        })

        settle_data = settle_res["data"]
        log_ok(f"结算完成: 总池={settle_data['total_pot']}, 房费={settle_data['total_rake']}, "
               f"代理={settle_data['agent_pool']}, 赢家={settle_data['winners_payout']}, "
               f"平台={settle_data['platform_revenue']}")

        # 8. 验证结算后余额
        log_step("场景一：验证结算结果")

        for p in players:
            bal = await get_balance(client, p)
            final_balances[p] = bal
            net = bal - initial_balances[p]
            log_info(f"  {p}: 初始={initial_balances[p]}, 最终={bal}, 净输赢={net:+d}")

        room_final = await get_balance(client, f"room_{ROOM_ID}")
        if room_final == 0:
            log_ok(f"牌桌钱包已清零: {room_final}")
        else:
            log_fail(f"牌桌钱包未清零: {room_final}")

        # 9. 守恒审计
        audit_res = await wallet_get(client, "/api/wallet/audit")
        audit = audit_res["data"]
        if audit["difference"] == 0:
            log_ok(f"能量守恒校验通过: difference=0")
        else:
            log_fail(f"能量守恒校验失败: difference={audit['difference']}")

        # ============================================================
        # 场景二：异常中断退款
        # ============================================================

        log_step("场景二：异常中断退款")

        # 记录退款前余额
        before_abort = {}
        for p in players:
            before_abort[p] = await get_balance(client, p)

        # Alice 下注 5000
        await wallet_post(client, "/api/wallet/bet", {
            "transaction_id": f"e2e_bet_abort_alice_{asyncio.get_event_loop().time()}",
            "room_id": ROOM_ID_ABORT,
            "user_id": "alice",
            "amount": 5000,
            "remark": "Abort scenario - Alice"
        })

        # Bob 下注 5000
        await wallet_post(client, "/api/wallet/bet", {
            "transaction_id": f"e2e_bet_abort_bob_{asyncio.get_event_loop().time()}",
            "room_id": ROOM_ID_ABORT,
            "user_id": "bob",
            "amount": 5000,
            "remark": "Abort scenario - Bob"
        })

        abort_room_balance = await get_balance(client, f"room_{ROOM_ID_ABORT}")
        log_ok(f"异常房间牌桌余额: {abort_room_balance}")

        # Charlie 掉线，触发退款
        refund_res = await wallet_post(client, "/api/wallet/refund", {
            "transaction_id": f"e2e_refund_{ROOM_ID_ABORT}_{asyncio.get_event_loop().time()}",
            "room_id": ROOM_ID_ABORT,
            "refunds": [
                {"user_id": "alice", "amount": 5000},
                {"user_id": "bob", "amount": 5000}
            ],
            "remark": "Charlie disconnected, refund all bets"
        })

        # 验证退款后余额恢复
        log_step("场景二：验证退款结果")

        for p in ["alice", "bob"]:
            after_refund = await get_balance(client, p)
            if after_refund == before_abort[p]:
                log_ok(f"{p} 余额已恢复: {after_refund}")
            else:
                log_fail(f"{p} 余额未恢复: 期望 {before_abort[p]}, 实际 {after_refund}")

        abort_room_final = await get_balance(client, f"room_{ROOM_ID_ABORT}")
        if abort_room_final == 0:
            log_ok(f"异常房间牌桌钱包已清零: {abort_room_final}")
        else:
            log_fail(f"异常房间牌桌钱包未清零: {abort_room_final}")

        # 再次守恒审计
        audit_res2 = await wallet_get(client, "/api/wallet/audit")
        audit2 = audit_res2["data"]
        if audit2["difference"] == 0:
            log_ok(f"退款后能量守恒依然通过: difference=0")
        else:
            log_fail(f"退款后能量守恒失败: difference={audit2['difference']}")

        # ============================================================
        # 汇总报告
        # ============================================================

        log_step("测试汇总报告")

        print(f"\n{Colors.BOLD}{'玩家':<12} {'初始余额':>12} {'最终余额':>12} {'净输赢':>12}{Colors.END}")
        print("-" * 50)
        for p in players:
            net = final_balances[p] - initial_balances[p]
            net_str = f"{net:+d}"
            color = Colors.GREEN if net > 0 else Colors.RED if net < 0 else Colors.END
            print(f"{p:<12} {initial_balances[p]:>12,} {final_balances[p]:>12,} {color}{net_str:>12}{Colors.END}")

        print(f"\n{Colors.BOLD}守恒审计:{Colors.END}")
        print(f"  总铸币:     {audit2['total_minted']:>12,}")
        print(f"  所有钱包和: {audit2['sum_all_wallets']:>12,}")
        print(f"  手续费池:   {audit2['sum_fee_pool']:>12,}")
        print(f"  差值:       {audit2['difference']:>12,}")
        print(f"  校验通过:   {audit2['check_passed']}")

        # 判定结果
        all_pass = (
            audit["difference"] == 0 and
            audit2["difference"] == 0 and
            room_final == 0 and
            abort_room_final == 0
        )

        print(f"\n{'='*60}")
        if all_pass:
            print(f"{Colors.GREEN}{Colors.BOLD}🎉 全部测试通过！资金闭环验证成功！{Colors.END}")
        else:
            print(f"{Colors.RED}{Colors.BOLD}❌ 部分测试失败！{Colors.END}")
            sys.exit(1)
        print(f"{'='*60}\n")


if __name__ == "__main__":
    asyncio.run(run_e2e_test())

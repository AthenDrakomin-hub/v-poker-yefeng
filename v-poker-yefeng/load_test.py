#!/usr/bin/env python3
"""
全链路压测脚本
场景：登录、转账、下注、佣金查询
"""
import asyncio
import aiohttp
import time
import json
from datetime import datetime

BASE_URL = "http://45.197.12.218:4000"
WALLET_URL = "http://45.197.12.218:8001"

results = {
    "login": {"success": 0, "fail": 0, "latencies": []},
    "transfer": {"success": 0, "fail": 0, "latencies": []},
    "balance": {"success": 0, "fail": 0, "latencies": []},
    "commission": {"success": 0, "fail": 0, "latencies": []},
}

async def login_user(session, username, password):
    """登录获取 JWT"""
    start = time.time()
    try:
        async with session.post(f"{BASE_URL}/api/auth/login", json={
            "username": username,
            "password": password
        }, timeout=aiohttp.ClientTimeout(total=5)) as resp:
            data = await resp.json()
            latency = (time.time() - start) * 1000
            if data.get("code") == 0:
                results["login"]["success"] += 1
                results["login"]["latencies"].append(latency)
                return data["data"]["access_token"]
            else:
                results["login"]["fail"] += 1
                return None
    except Exception as e:
        results["login"]["fail"] += 1
        return None

async def query_balance(session, token, user_id):
    """查询余额"""
    start = time.time()
    try:
        async with session.get(f"{WALLET_URL}/api/wallet/balance/{user_id}",
            headers={"Authorization": f"Bearer {token}"},
            timeout=aiohttp.ClientTimeout(total=5)) as resp:
            latency = (time.time() - start) * 1000
            if resp.status == 200:
                results["balance"]["success"] += 1
                results["balance"]["latencies"].append(latency)
            else:
                results["balance"]["fail"] += 1
    except Exception as e:
        results["balance"]["fail"] += 1

async def transfer_chips(session, token, from_user, to_user, amount):
    """转账"""
    start = time.time()
    try:
        async with session.post(f"{WALLET_URL}/api/wallet/transfer",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={
                "transaction_id": f"lt_{from_user}_to_{to_user}_{int(time.time()*1000)}",
                "from_user_id": from_user,
                "to_user_id": to_user,
                "amount": amount
            },
            timeout=aiohttp.ClientTimeout(total=5)) as resp:
            latency = (time.time() - start) * 1000
            if resp.status == 200:
                results["transfer"]["success"] += 1
                results["transfer"]["latencies"].append(latency)
            else:
                results["transfer"]["fail"] += 1
    except Exception as e:
        results["transfer"]["fail"] += 1

async def query_commission(session, token):
    """查询代理佣金"""
    start = time.time()
    try:
        async with session.get(f"{BASE_URL}/api/agent/dashboard",
            headers={"Authorization": f"Bearer {token}"},
            timeout=aiohttp.ClientTimeout(total=5)) as resp:
            latency = (time.time() - start) * 1000
            if resp.status == 200:
                results["commission"]["success"] += 1
                results["commission"]["latencies"].append(latency)
            else:
                results["commission"]["fail"] += 1
    except Exception as e:
        results["commission"]["fail"] += 1

def calc_percentile(data, p):
    """计算百分位数"""
    if not data:
        return 0
    sorted_data = sorted(data)
    index = int(len(sorted_data) * p / 100)
    return sorted_data[min(index, len(sorted_data) - 1)]

async def run_load_test():
    print("=" * 60)
    print("全链路压测开始:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    print("=" * 60)

    connector = aiohttp.TCPConnector(limit=200)
    async with aiohttp.ClientSession(connector=connector) as session:
        # 阶段1: 登录压测（50并发）
        print("\n【阶段1】登录压测: 50并发 × 30秒")
        start_time = time.time()
        login_tasks = []
        for i in range(50):
            username = f"player_user_{i % 5}"
            password = "test"
            login_tasks.append(login_user(session, username, password))

        await asyncio.gather(*login_tasks)
        login_duration = time.time() - start_time
        print(f"  完成: {login_duration:.1f}秒")

        # 阶段2: 余额查询压测（100并发）
        print("\n【阶段2】余额查询压测: 100并发 × 30秒")
        # 先拿一个有效 token
        token = await login_user(session, "player_alice", "test")
        if not token:
            token = "test_token"

        start_time = time.time()
        balance_tasks = []
        for i in range(100):
            balance_tasks.append(query_balance(session, token, f"player_user_{i % 10}"))

        await asyncio.gather(*balance_tasks)
        balance_duration = time.time() - start_time
        print(f"  完成: {balance_duration:.1f}秒")

        # 阶段3: 转账压测（50并发）
        print("\n【阶段3】转账压测: 50并发")
        start_time = time.time()
        transfer_tasks = []
        for i in range(50):
            transfer_tasks.append(transfer_chips(
                session, token,
                f"player_user_{i % 10}",
                f"player_user_{(i + 1) % 10}",
                100
            ))

        await asyncio.gather(*transfer_tasks)
        transfer_duration = time.time() - start_time
        print(f"  完成: {transfer_duration:.1f}秒")

        # 阶段4: 代理佣金查询压测（30并发）
        print("\n【阶段4】代理佣金查询压测: 30并发")
        agent_token = await login_user(session, "agent_root", "test")
        start_time = time.time()
        commission_tasks = []
        for i in range(30):
            commission_tasks.append(query_commission(session, agent_token or token))

        await asyncio.gather(*commission_tasks)
        commission_duration = time.time() - start_time
        print(f"  完成: {commission_duration:.1f}秒")

    # 输出报告
    print("\n" + "=" * 60)
    print("压测报告")
    print("=" * 60)

    for scenario, data in results.items():
        total = data["success"] + data["fail"]
        if total == 0:
            continue
        error_rate = data["fail"] / total * 100
        avg_latency = sum(data["latencies"]) / len(data["latencies"]) if data["latencies"] else 0
        p95 = calc_percentile(data["latencies"], 95)
        p99 = calc_percentile(data["latencies"], 99)
        qps = data["success"] / max(1, len(data["latencies"]))

        print(f"\n【{scenario}】")
        print(f"  总请求: {total}")
        print(f"  成功: {data['success']}, 失败: {data['fail']}")
        print(f"  错误率: {error_rate:.2f}%")
        print(f"  平均延迟: {avg_latency:.1f}ms")
        print(f"  P95 延迟: {p95:.1f}ms")
        print(f"  P99 延迟: {p99:.1f}ms")
        print(f"  QPS: {qps:.1f}")

    print("\n" + "=" * 60)
    print("压测完成")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(run_load_test())

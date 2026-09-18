#!/usr/bin/env python3
"""
全链路压测脚本（使用标准库）
场景：登录、余额查询、转账、佣金查询
"""
import urllib.request
import urllib.parse
import json
import time
import threading
from datetime import datetime

BASE_URL = "http://localhost:4000"
WALLET_URL = "http://localhost:8001"

results = {
    "login": {"success": 0, "fail": 0, "latencies": []},
    "balance": {"success": 0, "fail": 0, "latencies": []},
    "transfer": {"success": 0, "fail": 0, "latencies": []},
    "commission": {"success": 0, "fail": 0, "latencies": []},
}
lock = threading.Lock()

def http_post(url, data, headers=None):
    """POST 请求"""
    body = json.dumps(data).encode()
    req = urllib.request.Request(url, data=body, headers=headers or {"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return None

def http_get(url, headers=None):
    """GET 请求"""
    req = urllib.request.Request(url, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return json.loads(resp.read())
    except Exception as e:
        return None

def record_latency(scenario, success, latency_ms):
    """记录结果"""
    with lock:
        if success:
            results[scenario]["success"] += 1
            results[scenario]["latencies"].append(latency_ms)
        else:
            results[scenario]["fail"] += 1

def login_user(username, password):
    """登录"""
    start = time.time()
    data = http_post(f"{BASE_URL}/api/auth/login", {"username": username, "password": password})
    latency = (time.time() - start) * 1000
    success = data and data.get("code") == 0
    record_latency("login", success, latency)
    return data["data"]["access_token"] if success else None

def query_balance(token, user_id):
    """查询余额"""
    start = time.time()
    data = http_get(f"{WALLET_URL}/api/wallet/balance/{user_id}", {"Authorization": f"Bearer {token}"})
    latency = (time.time() - start) * 1000
    record_latency("balance", data is not None, latency)

def transfer_chips(token, from_user, to_user, amount):
    """转账"""
    start = time.time()
    data = http_post(f"{WALLET_URL}/api/wallet/transfer", {
        "transaction_id": f"lt_{from_user}_to_{to_user}_{int(time.time()*1000)}",
        "from_user_id": from_user,
        "to_user_id": to_user,
        "amount": amount
    }, {"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    latency = (time.time() - start) * 1000
    record_latency("transfer", data is not None, latency)

def query_commission(token):
    """查询代理佣金"""
    start = time.time()
    data = http_get(f"{BASE_URL}/api/agent/dashboard", {"Authorization": f"Bearer {token}"})
    latency = (time.time() - start) * 1000
    record_latency("commission", data is not None, latency)

def run_concurrent(func, args_list, num_threads):
    """并发执行"""
    threads = []
    for args in args_list:
        t = threading.Thread(target=func, args=args)
        threads.append(t)
        t.start()
        if len(threads) >= num_threads:
            for t in threads:
                t.join()
            threads = []
    for t in threads:
        t.join()

def calc_percentile(data, p):
    """计算百分位数"""
    if not data:
        return 0
    sorted_data = sorted(data)
    index = int(len(sorted_data) * p / 100)
    return sorted_data[min(index, len(sorted_data) - 1)]

def main():
    print("=" * 60)
    print("全链路压测开始:", datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    print("=" * 60)

    # 阶段1: 登录压测（50并发）
    print("\n【阶段1】登录压测: 50并发")
    start_time = time.time()
    login_args = [(f"player_user_{i % 5}", "test") for i in range(50)]
    run_concurrent(login_user, login_args, 50)
    print(f"  完成: {time.time() - start_time:.1f}秒")

    # 阶段2: 余额查询压测（100并发）
    print("\n【阶段2】余额查询压测: 100并发")
    token = login_user("player_alice", "test") or "test"
    start_time = time.time()
    balance_args = [(token, f"player_user_{i % 10}") for i in range(100)]
    run_concurrent(query_balance, balance_args, 100)
    print(f"  完成: {time.time() - start_time:.1f}秒")

    # 阶段3: 转账压测（50并发）
    print("\n【阶段3】转账压测: 50并发")
    start_time = time.time()
    transfer_args = [(token, f"player_user_{i % 10}", f"player_user_{(i+1) % 10}", 100) for i in range(50)]
    run_concurrent(transfer_chips, transfer_args, 50)
    print(f"  完成: {time.time() - start_time:.1f}秒")

    # 阶段4: 代理佣金查询压测（30并发）
    print("\n【阶段4】代理佣金查询压测: 30并发")
    agent_token = login_user("agent_root", "test") or token
    start_time = time.time()
    commission_args = [(agent_token,) for _ in range(30)]
    run_concurrent(query_commission, commission_args, 30)
    print(f"  完成: {time.time() - start_time:.1f}秒")

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

        print(f"\n【{scenario}】")
        print(f"  总请求: {total}")
        print(f"  成功: {data['success']}, 失败: {data['fail']}")
        print(f"  错误率: {error_rate:.2f}%")
        print(f"  平均延迟: {avg_latency:.1f}ms")
        print(f"  P95 延迟: {p95:.1f}ms")
        print(f"  P99 延迟: {p99:.1f}ms")

    print("\n" + "=" * 60)
    print("压测完成")
    print("=" * 60)

if __name__ == "__main__":
    main()

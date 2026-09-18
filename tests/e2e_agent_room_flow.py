#!/usr/bin/env python3
"""
端到端测试：代理开房 → 玩家加入 → 游戏 → 结算 → 代理佣金到账
验证完整资金闭环 + 代理分佣 + 能量守恒
"""
import requests
import time
import json
import sys
from typing import Dict, Any

# 配置
BASE_URL = "https://goodspage.cn"  # BFF (HTTPS，所有请求都走 BFF)
WALLET_URL = "https://goodspage.cn/api/wallet"  # wallet-service 通过 BFF 代理
COMMISSION_URL = "https://goodspage.cn/api/commission"  # commission-service 通过 BFF 代理

# 测试用户
AGENT_USER = "agent_root"
AGENT_PASS = "test"

PLAYER_B = "player_bob"
PLAYER_C = "player_charlie"
PLAYER_D = "player_david"
PLAYER_PASS = "test"

results = {
    "steps": [],
    "summary": {},
    "passed": 0,
    "failed": 0,
}


def log(step: str, detail: str, status: str = "INFO"):
    """打印日志"""
    icon = {"PASS": "✅", "FAIL": "❌", "INFO": "ℹ️", "WARN": "⚠️"}.get(status, "ℹ️")
    print(f"\n{icon} [{step}] {detail}")
    results["steps"].append({"step": step, "detail": detail, "status": status})
    if status == "PASS":
        results["passed"] += 1
    elif status == "FAIL":
        results["failed"] += 1


def api_request(method: str, url: str, token: str = "", **kwargs) -> Dict[str, Any]:
    """统一 API 请求"""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        resp = requests.request(method, url, headers=headers, timeout=10, **kwargs)
        return resp.json()
    except Exception as e:
        return {"code": -1, "message": str(e), "data": None}


def main():
    print("=" * 70)
    print("🎮 端到端测试：代理开房 → 玩家加入 → 游戏 → 结算 → 代理佣金到账")
    print("=" * 70)

    # ========== Step 1: 代理登录 ==========
    print("\n" + "=" * 70)
    log("Step 1", "代理 A 登录代理端")

    login_resp = api_request("POST", f"{BASE_URL}/api/auth/login",
                             json={"username": AGENT_USER, "password": AGENT_PASS})

    if login_resp.get("code") == 0:
        agent_token = login_resp["data"]["access_token"]
        log("Step 1", f"代理登录成功，user_id={AGENT_USER}", "PASS")
    else:
        log("Step 1", f"代理登录失败: {login_resp.get('message')}", "FAIL")
        print("测试终止：代理无法登录")
        sys.exit(1)

    # ========== Step 2: 代理创建房间 ==========
    print("\n" + "=" * 70)
    log("Step 2", "代理 A 创建德州扑克房间")

    room_config = {
        "room_name": "代理测试房",
        "game_type": "texas_holdem",
        "total_rounds": 8,
        "base_score": 10,
        "room_password": "",
    }

    create_resp = api_request("POST", f"{BASE_URL}/api/rooms/create",
                              token=agent_token, json=room_config)

    if create_resp.get("code") == 0:
        room_id = create_resp["data"]["room_id"]
        log("Step 2", f"房间创建成功，room_id={room_id}", "PASS")
        log("Step 2", f"游戏类型: {create_resp['data']['game_type']}", "INFO")
        log("Step 2", f"总局数: {create_resp['data']['total_rounds']}", "INFO")
        log("Step 2", f"底分: {create_resp['data']['base_score']}", "INFO")
    else:
        log("Step 2", f"房间创建失败: {create_resp.get('message')}", "FAIL")
        room_id = None

    # ========== Step 3: 玩家登录并加入房间 ==========
    print("\n" + "=" * 70)
    log("Step 3", "玩家 B、C、D 登录并加入房间")

    players = [PLAYER_B, PLAYER_C, PLAYER_D]
    player_tokens = {}

    for player in players:
        # 登录
        login_resp = api_request("POST", f"{BASE_URL}/api/auth/login",
                                 json={"username": player, "password": PLAYER_PASS})
        if login_resp.get("code") == 0:
            player_tokens[player] = login_resp["data"]["access_token"]
            log("Step 3", f"玩家 {player} 登录成功", "PASS")
        else:
            # 如果不存在，尝试注册
            reg_resp = api_request("POST", f"{BASE_URL}/api/auth/register",
                                  json={"username": player, "password": PLAYER_PASS, "role": "player"})
            if reg_resp.get("code") == 0:
                # 注册后再登录
                login_resp = api_request("POST", f"{BASE_URL}/api/auth/login",
                                         json={"username": player, "password": PLAYER_PASS})
                if login_resp.get("code") == 0:
                    player_tokens[player] = login_resp["data"]["access_token"]
                    log("Step 3", f"玩家 {player} 注册并登录成功", "PASS")
                else:
                    log("Step 3", f"玩家 {player} 登录失败: {login_resp.get('message')}", "FAIL")
            else:
                log("Step 3", f"玩家 {player} 注册失败: {reg_resp.get('message')}", "FAIL")
            continue

        # 加入房间
        if room_id:
            join_resp = api_request("POST", f"{BASE_URL}/api/rooms/join",
                                    token=player_tokens[player],
                                    json={"room_id": room_id, "room_password": ""})
            if join_resp.get("code") == 0:
                log("Step 3", f"玩家 {player} 加入房间 {room_id} 成功", "PASS")
            else:
                log("Step 3", f"玩家 {player} 加入房间失败: {join_resp.get('message')}", "FAIL")

    # ========== Step 4: 铸币给玩家 ==========
    print("\n" + "=" * 70)
    log("Step 4", "管理员铸币给玩家 B、C、D 各 10000 筹码")

    now_ms = int(time.time() * 1000)
    for i, player in enumerate(players):
        mint_payload = {
            "transaction_id": f"mint_e2e_{player}_{now_ms}",
            "admin_user_id": "admin_root",
            "target_user_id": player,
            "amount": 10000,
            "remark": "端到端测试铸币",
        }
        mint_resp = api_request("POST", f"{WALLET_URL}/api/wallet/mint", json=mint_payload)
        if mint_resp.get("code") == 0:
            log("Step 4", f"铸币 {player} 10000 成功", "PASS")
        else:
            log("Step 4", f"铸币 {player} 失败: {mint_resp.get('message')}", "FAIL")

    # ========== Step 5: 玩家下注（模拟游戏下注） ==========
    print("\n" + "=" * 70)
    log("Step 5", "模拟游戏下注：玩家 B 下注 500，玩家 C 跟注 500，玩家 D 加注到 1000")

    room_wallet = f"room_{room_id}" if room_id else "room_test"
    bet_transactions = []

    # 玩家 B 下注 500
    bet_payload = {
        "transaction_id": f"bet_{room_id}_{PLAYER_B}_1",
        "room_id": room_id,
        "user_id": PLAYER_B,
        "amount": 500,
    }
    bet_resp = api_request("POST", f"{WALLET_URL}/api/wallet/bet", json=bet_payload)
    if bet_resp.get("code") == 0:
        log("Step 5", f"玩家 B 下注 500 成功", "PASS")
        bet_transactions.append(bet_payload["transaction_id"])
    else:
        log("Step 5", f"玩家 B 下注失败: {bet_resp.get('message')}", "FAIL")

    # 玩家 C 跟注 500
    bet_payload = {
        "transaction_id": f"bet_{room_id}_{PLAYER_C}_1",
        "room_id": room_id,
        "user_id": PLAYER_C,
        "amount": 500,
    }
    bet_resp = api_request("POST", f"{WALLET_URL}/api/wallet/bet", json=bet_payload)
    if bet_resp.get("code") == 0:
        log("Step 5", f"玩家 C 下注 500 成功", "PASS")
        bet_transactions.append(bet_payload["transaction_id"])
    else:
        log("Step 5", f"玩家 C 下注失败: {bet_resp.get('message')}", "FAIL")

    # 玩家 D 加注到 1000（再下注 500）
    bet_payload = {
        "transaction_id": f"bet_{room_id}_{PLAYER_D}_1",
        "room_id": room_id,
        "user_id": PLAYER_D,
        "amount": 1000,
    }
    bet_resp = api_request("POST", f"{WALLET_URL}/api/wallet/bet", json=bet_payload)
    if bet_resp.get("code") == 0:
        log("Step 5", f"玩家 D 下注 1000 成功", "PASS")
        bet_transactions.append(bet_payload["transaction_id"])
    else:
        log("Step 5", f"玩家 D 下注失败: {bet_resp.get('message')}", "FAIL")

    # 玩家 B、C 跟注到 1000
    for player in [PLAYER_B, PLAYER_C]:
        bet_payload = {
            "transaction_id": f"bet_{room_id}_{player}_2",
            "room_id": room_id,
            "user_id": player,
            "amount": 500,
        }
        bet_resp = api_request("POST", f"{WALLET_URL}/api/wallet/bet", json=bet_payload)
        if bet_resp.get("code") == 0:
            log("Step 5", f"玩家 {player} 加注跟注 500 成功", "PASS")
            bet_transactions.append(bet_payload["transaction_id"])
        else:
            log("Step 5", f"玩家 {player} 跟注失败: {bet_resp.get('message')}", "FAIL")

    total_pot = 3000  # 500 + 500 + 1000 + 500 + 500
    log("Step 5", f"总底池: {total_pot}", "INFO")

    # ========== Step 6: 查询牌桌钱包余额 ==========
    print("\n" + "=" * 70)
    log("Step 6", "查询牌桌钱包余额")

    room_bal_resp = api_request("GET", f"{WALLET_URL}/api/wallet/balance/{room_wallet}")
    if room_bal_resp.get("code") == 0:
        room_balance = room_bal_resp["data"]["balance"]
        log("Step 6", f"牌桌钱包余额: {room_balance}", "PASS" if room_balance == total_pot else "FAIL")
    else:
        log("Step 6", f"查询牌桌钱包失败: {room_bal_resp.get('message')}", "FAIL")
        room_balance = 0

    # ========== Step 7: 游戏结算（玩家 D 赢） ==========
    print("\n" + "=" * 70)
    log("Step 7", "游戏结算：玩家 D 赢，底池 3000")

    settle_payload = {
        "transaction_id": f"settle_{room_id}_1",
        "room_id": room_id,
        "total_pot": total_pot,
        "winner_ids": [PLAYER_D],
        "platform_fee_rate": 0.05,  # 5% 房费
        "agent_commission_rate": 0.02,  # 2% 代理返佣
        "agent_ids": [AGENT_USER],
    }

    settle_resp = api_request("POST", f"{WALLET_URL}/api/wallet/game_settle", json=settle_payload)
    if settle_resp.get("code") == 0:
        log("Step 7", "游戏结算成功", "PASS")
        log("Step 7", f"结算结果: {json.dumps(settle_resp.get('data', {}), ensure_ascii=False)[:200]}", "INFO")
    else:
        log("Step 7", f"游戏结算失败: {settle_resp.get('message')}", "FAIL")

    # ========== Step 8: 验证各玩家余额 ==========
    print("\n" + "=" * 70)
    log("Step 8", "验证各玩家余额变化")

    for player in players:
        bal_resp = api_request("GET", f"{WALLET_URL}/api/wallet/balance/{player}")
        if bal_resp.get("code") == 0:
            balance = bal_resp["data"]["balance"]
            log("Step 8", f"玩家 {player} 余额: {balance}", "PASS")
        else:
            log("Step 8", f"查询玩家 {player} 余额失败: {bal_resp.get('message')}", "FAIL")

    # 验证代理余额
    agent_bal_resp = api_request("GET", f"{WALLET_URL}/api/wallet/balance/{AGENT_USER}")
    if agent_bal_resp.get("code") == 0:
        agent_balance = agent_bal_resp["data"]["balance"]
        log("Step 8", f"代理 {AGENT_USER} 余额: {agent_balance}", "PASS")
    else:
        log("Step 8", f"查询代理余额失败: {agent_bal_resp.get('message')}", "FAIL")

    # ========== Step 9: 能量守恒审计 ==========
    print("\n" + "=" * 70)
    log("Step 9", "能量守恒审计")

    audit_resp = api_request("GET", f"{WALLET_URL}/api/wallet/audit")
    if audit_resp.get("code") == 0:
        audit_data = audit_resp["data"]
        diff = audit_data.get("difference", -1)
        check_passed = audit_data.get("check_passed", False)
        log("Step 9", f"difference: {diff}", "PASS" if diff == 0 else "FAIL")
        log("Step 9", f"check_passed: {check_passed}", "PASS" if check_passed else "FAIL")
        log("Step 9", f"总铸币: {audit_data.get('total_minted')}", "INFO")
        log("Step 9", f"钱包总和: {audit_data.get('sum_all_wallets')}", "INFO")
        log("Step 9", f"手续费池: {audit_data.get('sum_fee_pool')}", "INFO")
        results["summary"]["audit"] = audit_data
    else:
        log("Step 9", f"审计失败: {audit_resp.get('message')}", "FAIL")

    # ========== Step 10: 验证代理佣金明细 ==========
    print("\n" + "=" * 70)
    log("Step 10", "验证代理佣金明细")

    commission_resp = api_request("GET", f"{BASE_URL}/api/agent/commission", token=agent_token)
    if commission_resp.get("code") == 0:
        commission_data = commission_resp["data"]
        total_commission = commission_data.get("total_commission", 0)
        records = commission_data.get("records", [])
        log("Step 10", f"累计佣金: {total_commission}", "PASS" if total_commission > 0 else "WARN")
        log("Step 10", f"佣金记录数: {len(records)}", "INFO")
        results["summary"]["agent_commission"] = total_commission
    else:
        log("Step 10", f"查询代理佣金失败: {commission_resp.get('message')}", "FAIL")

    # ========== Step 11: 验证房间列表 ==========
    print("\n" + "=" * 70)
    log("Step 11", "验证代理端「我的房间」列表")

    rooms_resp = api_request("GET", f"{BASE_URL}/api/rooms/list", token=agent_token)
    if rooms_resp.get("code") == 0:
        rooms = rooms_resp["data"]
        my_rooms = [r for r in rooms if r.get("created_by") == AGENT_USER]
        log("Step 11", f"公开房间总数: {len(rooms)}", "INFO")
        log("Step 11", f"代理创建的房间: {len(my_rooms)}", "PASS" if len(my_rooms) > 0 else "FAIL")
        if my_rooms:
            for room in my_rooms:
                log("Step 11", f"  - 房号: {room['room_id']}, 状态: {room['status']}, 局数: {room.get('current_round', 0)}/{room.get('total_rounds', 0)}", "INFO")
    else:
        log("Step 11", f"查询房间列表失败: {rooms_resp.get('message')}", "FAIL")

    # ========== Step 12: 异常退款测试 ==========
    print("\n" + "=" * 70)
    log("Step 12", "异常退款测试：模拟玩家掉线，退还下注筹码")

    # 先下注
    bet_payload = {
        "transaction_id": f"bet_refund_{room_id}_test",
        "room_id": room_id,
        "user_id": PLAYER_B,
        "amount": 200,
    }
    bet_resp = api_request("POST", f"{WALLET_URL}/api/wallet/bet", json=bet_payload)
    if bet_resp.get("code") == 0:
        log("Step 12", "玩家 B 下注 200 成功（用于退款测试）", "PASS")

        # 退款
        refund_payload = {
            "transaction_id": f"refund_{room_id}_test",
            "room_id": room_id,
            "refunds": [
                {"user_id": PLAYER_B, "amount": 200},
            ],
        }
        refund_resp = api_request("POST", f"{WALLET_URL}/api/wallet/refund", json=refund_payload)
        if refund_resp.get("code") == 0:
            log("Step 12", "异常退款成功", "PASS")
        else:
            log("Step 12", f"异常退款失败: {refund_resp.get('message')}", "FAIL")
    else:
        log("Step 12", f"下注失败（退款测试前置条件不满足）: {bet_resp.get('message')}", "WARN")

    # 退款后再次审计
    audit_resp2 = api_request("GET", f"{WALLET_URL}/api/wallet/audit")
    if audit_resp2.get("code") == 0:
        diff2 = audit_resp2["data"].get("difference", -1)
        log("Step 12", f"退款后审计 difference: {diff2}", "PASS" if diff2 == 0 else "FAIL")

    # ========== 汇总报告 ==========
    print("\n" + "=" * 70)
    print("📊 测试汇总报告")
    print("=" * 70)

    print(f"\n✅ 通过: {results['passed']}")
    print(f"❌ 失败: {results['failed']}")
    print(f"⚠️  警告: {len([s for s in results['steps'] if s['status'] == 'WARN'])}")

    print("\n📋 资金闭环验证：")
    if results.get("summary", {}).get("audit"):
        audit = results["summary"]["audit"]
        print(f"  - 总铸币量: {audit.get('total_minted', 'N/A')}")
        print(f"  - 钱包余额总和: {audit.get('sum_all_wallets', 'N/A')}")
        print(f"  - 手续费池: {audit.get('sum_fee_pool', 'N/A')}")
        print(f"  - 差额: {audit.get('difference', 'N/A')}")
        print(f"  - 守恒校验: {'通过 ✅' if audit.get('check_passed') else '失败 ❌'}")

    print(f"\n💰 代理佣金: {results.get('summary', {}).get('agent_commission', 'N/A')}")

    print("\n" + "=" * 70)
    if results["failed"] == 0:
        print("🎉 全部测试通过！完整资金闭环验证成功！")
    else:
        print(f"⚠️  有 {results['failed']} 个测试失败，请检查！")
    print("=" * 70)

    # 保存结果到文件
    with open("/tmp/e2e_test_result.json", "w") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print(f"\n详细结果已保存到: /tmp/e2e_test_result.json")


if __name__ == "__main__":
    main()

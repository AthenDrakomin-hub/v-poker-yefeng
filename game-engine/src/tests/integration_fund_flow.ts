/**
 * 端到端集成测试：游戏引擎 ↔ 钱包服务 资金闭环
 *
 * 测试场景：
 * 1. 铸币给玩家 Alice 和 Bob
 * 2. 创建德州扑克房间
 * 3. Alice 下注 5000，Bob 下注 5000
 * 4. 结算：赢家 Alice 拿走 pot - rake
 * 5. 验证 wallet-service 余额变化 + 能量守恒
 *
 * 运行前提：wallet-service 已在 http://127.0.0.1:8001 启动
 * 运行方式：npx tsx src/tests/integration_fund_flow.test.ts
 */

import { walletClient } from "../bridge/walletClient.js";
import { coreRoomManager } from "../core/roomManager.js";

const WALLET_URL = process.env.WALLET_SERVICE_URL || "http://127.0.0.1:8001";

// ============================================================
// 工具函数
// ============================================================

async function walletPost(path: string, body: any): Promise<any> {
  const res = await fetch(`${WALLET_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function walletGet(path: string): Promise<any> {
  const res = await fetch(`${WALLET_URL}${path}`);
  return res.json();
}

async function getBalance(userId: string): Promise<number> {
  const res = await walletGet(`/api/wallet/balance/${userId}`);
  return res.data?.balance ?? -1;
}

// ============================================================
// 主测试流程
// ============================================================

async function runIntegrationTest() {
  console.log("=".repeat(60));
  console.log("🚀 开始端到端资金闭环集成测试");
  console.log("=".repeat(60));

  // ---------- 1. 铸币 ----------
  console.log("\n📌 Step 1: 铸币给 Alice 和 Bob");

  await walletPost("/api/wallet/mint", {
    transaction_id: `test_mint_alice_${Date.now()}`,
    admin_user_id: "u_admin_root",
    target_user_id: "p_alice",
    amount: 100000,
    remark: "Integration test mint"
  });

  await walletPost("/api/wallet/mint", {
    transaction_id: `test_mint_bob_${Date.now()}`,
    admin_user_id: "u_admin_root",
    target_user_id: "p_bob",
    amount: 100000,
    remark: "Integration test mint"
  });

  const aliceBalBefore = await getBalance("p_alice");
  const bobBalBefore = await getBalance("p_bob");
  console.log(`  Alice 余额: ${aliceBalBefore}`);
  console.log(`  Bob 余额:   ${bobBalBefore}`);

  // ---------- 2. 下注 ----------
  console.log("\n📌 Step 2: Alice 和 Bob 各下注 5000");

  await walletPost("/api/wallet/bet", {
    transaction_id: `test_bet_alice_${Date.now()}`,
    room_id: "test_room_001",
    user_id: "p_alice",
    amount: 5000,
    remark: "Test bet"
  });

  await walletPost("/api/wallet/bet", {
    transaction_id: `test_bet_bob_${Date.now()}`,
    room_id: "test_room_001",
    user_id: "p_bob",
    amount: 5000,
    remark: "Test bet"
  });

  const aliceBalAfterBet = await getBalance("p_alice");
  const bobBalAfterBet = await getBalance("p_bob");
  const roomBal = await getBalance("room_test_room_001");
  console.log(`  Alice 余额: ${aliceBalAfterBet} (下注 5000 后)`);
  console.log(`  Bob 余额:   ${bobBalAfterBet} (下注 5000 后)`);
  console.log(`  牌桌余额:   ${roomBal}`);

  // ---------- 3. 结算 ----------
  console.log("\n📌 Step 3: 游戏结算 (pot=10000, p=0.03, a=0.02)");

  const settleRes = await walletPost("/api/wallet/game_settle", {
    transaction_id: `test_settle_${Date.now()}`,
    room_id: "test_room_001",
    total_pot: 10000,
    winner_ids: ["p_alice"],
    platform_fee_rate: "0.0300",
    agent_commission_rate: "0.0200",
    agent_ids: ["agt_room_03", "agt_sub_02", "agt_top_01"]
  });

  const settleData = settleRes.data;
  console.log(`  总池:       ${settleData.total_pot}`);
  console.log(`  房费:       ${settleData.total_rake}`);
  console.log(`  代理返佣:   ${settleData.agent_pool}`);
  console.log(`  赢家实得:   ${settleData.winners_payout}`);
  console.log(`  平台留存:   ${settleData.platform_revenue}`);

  // ---------- 4. 验证余额 ----------
  console.log("\n📌 Step 4: 验证最终余额");

  const aliceBalFinal = await getBalance("p_alice");
  const bobBalFinal = await getBalance("p_bob");
  const roomBalFinal = await getBalance("room_test_room_001");

  console.log(`  Alice 最终余额: ${aliceBalFinal}`);
  console.log(`  Bob 最终余额:   ${bobBalFinal}`);
  console.log(`  牌桌最终余额:   ${roomBalFinal}`);

  // ---------- 5. 守恒校验 ----------
  console.log("\n📌 Step 5: 能量守恒审计");

  const audit = await walletGet("/api/wallet/audit");
  console.log(`  总铸币:     ${audit.data.total_minted}`);
  console.log(`  所有钱包和: ${audit.data.sum_all_wallets}`);
  console.log(`  手续费池:   ${audit.data.sum_fee_pool}`);
  console.log(`  差值:       ${audit.data.difference}`);
  console.log(`  校验通过:   ${audit.data.check_passed}`);

  // ---------- 6. 断言 ----------
  console.log("\n📌 Step 6: 断言验证");

  const checks = [
    {
      name: "Alice 下注后余额减少 5000",
      pass: aliceBalBefore - aliceBalAfterBet === 5000
    },
    {
      name: "Bob 下注后余额减少 5000",
      pass: bobBalBefore - bobBalAfterBet === 5000
    },
    {
      name: "牌桌余额 = 10000",
      pass: roomBal === 10000
    },
    {
      name: "牌桌结算后余额 = 0",
      pass: roomBalFinal === 0
    },
    {
      name: "能量守恒 difference = 0",
      pass: audit.data.difference === 0
    }
  ];

  let allPass = true;
  for (const c of checks) {
    console.log(`  ${c.pass ? "✅" : "❌"} ${c.name}`);
    if (!c.pass) allPass = false;
  }

  console.log("\n" + "=".repeat(60));
  if (allPass) {
    console.log("🎉 全部测试通过！资金闭环验证成功！");
  } else {
    console.log("❌ 部分测试失败，请检查！");
    process.exit(1);
  }
  console.log("=".repeat(60));
}

// 运行测试
runIntegrationTest().catch((err) => {
  console.error("测试执行失败:", err);
  process.exit(1);
});

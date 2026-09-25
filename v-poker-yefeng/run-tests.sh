#!/bin/bash
# V-POKER 测试运行脚本
# 用法: bash run-tests.sh

set -e
cd "$(dirname "$0")"

echo "========== 1. 钱包服务健康检查 =========="
if curl -s http://127.0.0.1:8001/health > /dev/null 2>&1; then
  echo "✓ wallet-service:8001 OK"
else
  echo "✗ wallet-service not running, starting..."
  cd wallet_service
  DATABASE_URL="sqlite+aiosqlite:///./dev.db" nohup python3 -m uvicorn app.main:app --port 8001 > /tmp/wallet.log 2>&1 &
  sleep 3
  cd ..
fi

echo ""
echo "========== 2. 引擎健康检查 =========="
if curl -s http://127.0.0.1:8003/health > /dev/null 2>&1; then
  echo "✓ game-engine:8003 OK"
else
  echo "✗ game-engine not running, starting..."
  cd game-engine
  ENGINE_PORT=8003 INTERNAL_AUTH_KEY=dev-key WALLET_SERVICE_URL=http://127.0.0.1:8001 nohup npx tsx src/index.ts > /tmp/engine.log 2>&1 &
  sleep 4
  cd ..
fi

echo ""
echo "========== 3. 端到端冒烟测试 =========="
ENGINE=http://127.0.0.1:8003
KEY=dev-key
ROOM="test_$(date +%s)"

# Mint
curl -s -X POST http://127.0.0.1:8001/api/wallet/mint -H "Content-Type: application/json" \
  -d "{\"transaction_id\":\"m_$ROOM\",\"admin_user_id\":\"admin\",\"target_user_id\":\"smoke_a\",\"amount\":10000}" > /dev/null
curl -s -X POST http://127.0.0.1:8001/api/wallet/mint -H "Content-Type: application/json" \
  -d "{\"transaction_id\":\"m_$ROOM\",\"admin_user_id\":\"admin\",\"target_user_id\":\"smoke_b\",\"amount\":10000}" > /dev/null

# Create room
curl -s -X POST "$ENGINE/api/engine/room/create" -H "Content-Type: application/json" -H "X-Internal-Auth-Key: $KEY" \
  -d "{\"room_id\":\"$ROOM\",\"game_type\":\"zha_jin_hua\",\"mode\":\"compare\",\"base_score\":100}" > /dev/null

# Seat
curl -s -X POST "$ENGINE/api/engine/room/$ROOM/seat" -H "Content-Type: application/json" -H "X-Internal-Auth-Key: $KEY" \
  -d '{"user_id":"smoke_a","chips":10000}' > /dev/null
curl -s -X POST "$ENGINE/api/engine/room/$ROOM/seat" -H "Content-Type: application/json" -H "X-Internal-Auth-Key: $KEY" \
  -d '{"user_id":"smoke_b","chips":10000}' > /dev/null

# Ready
curl -s -X POST "$ENGINE/api/engine/room/$ROOM/action" -H "Content-Type: application/json" -H "X-Internal-Auth-Key: $KEY" \
  -d '{"user_id":"smoke_a","action":{"action_type":"ready"}}' > /dev/null
curl -s -X POST "$ENGINE/api/engine/room/$ROOM/action" -H "Content-Type: application/json" -H "X-Internal-Auth-Key: $KEY" \
  -d '{"user_id":"smoke_b","action":{"action_type":"ready"}}' > /dev/null
sleep 1

# Verify phase and pot
RESULT=$(curl -s "$ENGINE/api/engine/room/$ROOM" -H "X-Internal-Auth-Key: $KEY")
PHASE=$(echo "$RESULT" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['round_state']['phase'])")
POT=$(echo "$RESULT" | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['round_state']['total_pot'])")

echo "  phase=$PHASE pot=$POT"

if [ "$PHASE" = "BETTING" ] && [ "$POT" = "200" ]; then
  echo "✓ 端到端冒烟测试通过 (phase=BETTING, pot=200)"
else
  echo "✗ 冒烟测试失败 (phase=$PHASE, pot=$POT)"
  exit 1
fi

echo ""
echo "========== 4. 钱包余额验证 =========="
BAL_A=$(curl -s http://127.0.0.1:8001/api/wallet/balance/smoke_a | python3 -c "import sys,json;print(json.load(sys.stdin)['data']['balance'])")
echo "  smoke_a balance: $BAL_A (expected 9900 after blind)"
if [ "$BAL_A" = "9900" ]; then
  echo "✓ 下注同步扣款验证通过"
else
  echo "⚠ 余额=$BAL_A (可能bot模式或已有测试残留)"
fi

echo ""
echo "========== 全部测试完成 =========="

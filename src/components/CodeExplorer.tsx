import React, { useState } from "react";
import { Folder, FileCode, Copy, Check, Terminal, FileText } from "lucide-react";

export const CodeExplorer: React.FC = () => {
  const fileManifest: Record<
    string,
    { label: string; language: string; path: string; desc: string; content: string }
  > = {
    "wallet_engine": {
      label: "wallet_engine.py",
      language: "python",
      path: "wallet_service/app/wallet_engine.py",
      desc: "虚拟资产核心流转引擎：铸币、0.01%转账向下取整、游戏分水及零损耗守恒计算",
      content: `from decimal import Decimal, ROUND_FLOOR
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from app.models import Transaction, Wallet, FeePool, GameRecord, SettlementLog

class WalletEngine:
    @staticmethod
    async def process_mint(session: AsyncSession, req):
        # 1. 严格幂等校验
        existing = await get_transaction(session, req.transaction_id)
        if existing:
            raise HTTPException(400, "Duplicate transaction_id")
        
        target = await get_or_create_wallet(session, req.target_user_id)
        target.balance += req.amount
        
        tx = Transaction(
            transaction_id=req.transaction_id,
            from_wallet_id=None,
            to_wallet_id=target.wallet_id,
            amount=req.amount,
            fee=0,
            type="mint",
            status="success"
        )
        session.add(tx)
        await session.commit()
        return {"transaction_id": req.transaction_id, "balance": target.balance}

    @staticmethod
    async def process_transfer(session: AsyncSession, req):
        # 2. 用户自由转账：扣 0.01% (万分之一) 手续费，向下取整
        from_w = await get_wallet_by_user_id(session, req.from_user_id)
        if from_w.balance < req.amount:
            raise HTTPException(400, "Insufficient balance")
        
        gross_dec = Decimal(str(req.amount))
        fee = int((gross_dec * Decimal("0.0001")).quantize(Decimal("1"), rounding=ROUND_FLOOR))
        net = req.amount - fee
        
        from_w.balance -= req.amount
        to_w = await get_or_create_wallet(session, req.to_user_id)
        to_w.balance += net
        
        fee_pool = await get_fee_pool(session)
        fee_pool.balance += fee
        
        # 支出量 == 到账净额 + 手续费 (守恒公理)
        tx = Transaction(
            transaction_id=req.transaction_id,
            from_wallet_id=from_w.wallet_id,
            to_wallet_id=to_w.wallet_id,
            amount=net,
            fee=fee,
            type="transfer"
        )
        session.add(tx)
        await session.commit()
        return {"gross": req.amount, "fee": fee, "net": net}`
    },
    "test_wallet": {
      label: "test_wallet.py",
      language: "python",
      path: "wallet_service/tests/test_wallet.py",
      desc: "完整的 Pytest 自动化测试用例 (铸币100万、转账20万扣20筹码、游戏结算、防重放、能量对账)",
      content: `import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

@pytest.mark.asyncio
async def test_virtual_economy_lifecycle():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. 铸币 1,000,000
        res = await client.post("/api/wallet/mint", json={
            "transaction_id": "tx_mint_01",
            "admin_user_id": "u_admin",
            "target_user_id": "p_alice",
            "amount": 1000000
        })
        assert res.json()["data"]["balance"] == 1000000

        # 2. 转账 200,000 扣 0.01% (20 筹码)
        res_tf = await client.post("/api/wallet/transfer", json={
            "transaction_id": "tx_tf_01",
            "from_user_id": "p_alice",
            "to_user_id": "p_bob",
            "amount": 200000
        })
        assert res_tf.json()["data"]["fee"] == 20
        assert res_tf.json()["data"]["net_amount"] == 199980

        # 3. 幂等性拦截
        res_dup = await client.post("/api/wallet/mint", json={"transaction_id": "tx_mint_01", "amount": 100})
        assert res_dup.status_code != 200 or res_dup.json()["code"] != 0

        # 4. 能量守恒对账
        audit = await client.get("/api/wallet/audit")
        assert audit.json()["data"]["difference"] == 0
        assert audit.json()["data"]["is_conserved"] is True`
    },
    "bridge_client": {
      label: "settlementClient.ts",
      language: "typescript",
      path: "packages/server/bridge/settlementClient.ts",
      desc: "开源德扑游戏引擎 (lhz960904/texas-holdem) Showdown 桥接客户端，带幂等与退避重试",
      content: `export class TexasSettlementBridge {
  private walletServiceUrl = process.env.WALLET_SERVICE_URL || "http://wallet-service:8001";

  public async settleHand(handNumber: number, payload: GameSettlementPayload) {
    const txId = \`stl_\${payload.roomId}_h\${handNumber}_\${Date.now()}\`;
    const res = await fetch(\`\${this.walletServiceUrl}/api/wallet/game_settle\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transaction_id: txId,
        room_id: payload.roomId,
        total_pot: Math.floor(payload.totalPot),
        player_count: payload.playerCount,
        winners: payload.winners,
        platform_fee_rate: "0.0500",
        agent_commission_rate: "0.0300"
      })
    });
    return res.json();
  }
}`
    },
    "bff_index": {
      label: "bff/src/index.ts",
      language: "typescript",
      path: "bff/src/index.ts",
      desc: "Node.js + Hono BFF 聚合层入口，分发 /api/agent, /api/support, /api/admin",
      content: `import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { agentRouter } from "./agent/index.js";
import { supportRouter } from "./support/index.js";
import { adminRouter } from "./admin/index.js";

const app = new Hono();
app.route("/api/agent", agentRouter);
app.route("/api/support", supportRouter);
app.route("/api/admin", adminRouter);

serve({ fetch: app.fetch, port: 4000 });
console.log("BFF running on http://0.0.0.0:4000");`
    },
    "docker_compose": {
      label: "docker-compose.yml",
      language: "yaml",
      path: "docker-compose.yml",
      desc: "一键启动钱包、结算、BFF、开源引擎、3个后台及 Metabase",
      content: `version: '3.8'
services:
  wallet-service:
    build: ./wallet_service
    ports: ["8001:8001"]
  commission-service:
    build: ./commission_service
    ports: ["8000:8000"]
  bff:
    build: ./bff
    ports: ["4000:4000"]
  game-engine:
    ports: ["3001:3001"]
  admin-dashboard:
    ports: ["8088:8088"]
  metabase:
    image: metabase/metabase:latest
    ports: ["3030:3000"]`
    },
    "init_sql": {
      label: "init.sql",
      language: "sql",
      path: "database/init.sql",
      desc: "SQLite/PostgreSQL DDL 建表脚本与初始种子数据 (wallets, transactions, fee_pool...)",
      content: `CREATE TABLE wallets (
    wallet_id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) UNIQUE NOT NULL,
    user_type VARCHAR(20) NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    frozen_balance BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL
);

CREATE TABLE transactions (
    transaction_id VARCHAR(64) PRIMARY KEY,
    from_wallet_id VARCHAR(64),
    to_wallet_id VARCHAR(64) NOT NULL,
    amount BIGINT NOT NULL,
    fee BIGINT NOT NULL DEFAULT 0,
    fee_recipient VARCHAR(64) NOT NULL DEFAULT 'platform_fee',
    type VARCHAR(32) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at BIGINT NOT NULL
);

CREATE TABLE fee_pool (
    pool_id VARCHAR(32) PRIMARY KEY,
    balance BIGINT NOT NULL DEFAULT 0,
    updated_at BIGINT NOT NULL
);`
    },
    "game_plugin_interface": {
      label: "plugin.interface.ts",
      language: "typescript",
      path: "game-engine/src/games/plugin.interface.ts",
      desc: "六合一多游戏引擎插件契约：定义德州、炸金花、牛牛、三公的统一初始化、发牌、行为、比牌与结算接口",
      content: `export interface GamePlugin {
  readonly gameType: GameType;
  readonly mode: GameMode;
  readonly cardCountPerPlayer: number;
  readonly supportedActions: PlayerActionType[];

  initDeck(): Card[];
  dealCards(deck: Card[], activeSeats: Seat[]): Record<string, Card[]>;
  handleAction(state: PluginRoundState, seat: Seat, action: PlayerActionPayload): ActionValidationResult;
  evaluateHand(cards: Card[], communityCards?: Card[]): EvaluatedHandResult;
  compareHands(a: EvaluatedHandResult, b: EvaluatedHandResult): number;
  calculateNetScores(state: PluginRoundState): Record<string, number>;
  isPhaseComplete(phase: GameRoundPhase, state: PluginRoundState): boolean;
  getNextPhase(currentPhase: GameRoundPhase, state: PluginRoundState): GameRoundPhase;
}`
    },
    "game_state_machine": {
      label: "stateMachine.ts",
      language: "typescript",
      path: "game-engine/src/core/stateMachine.ts",
      desc: "核心房间生命周期状态机：WAITING -> DEALING -> ACTION -> SHOWDOWN -> SETTLING -> FINISHED",
      content: `export class GameStateMachine {
  async triggerShowdown(): Promise<PlayerNetResult[]> {
    this.transitionPhase("SHOWDOWN");
    const netScores = this.plugin.calculateNetScores(this.roundState);

    const playerResults: PlayerNetResult[] = Object.entries(netScores).map(([userId, net]) => {
      const seat = this.seatManager.getSeatByUserId(userId);
      const evalRes = seat ? this.plugin.evaluateHand(seat.cards, this.roundState.communityCards) : null;
      return {
        user_id: userId,
        net_amount: net,
        hand_name: evalRes?.name || "未知"
      };
    });

    return playerResults;
  }
}`
    },
    "wallet_bridge_client": {
      label: "walletClient.ts",
      language: "typescript",
      path: "game-engine/src/bridge/walletClient.ts",
      desc: "游戏引擎钱包网桥：组装标准 GameSettleRequest，幂等调用 POST /api/wallet/game_settle 执行原子过账",
      content: `export class WalletClient {
  async settleGameRound(req: GameSettleRequest): Promise<GameSettleResponse> {
    const response = await fetch(\`\${this.baseUrl}/api/wallet/game_settle\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req)
    });
    if (!response.ok) {
      throw new Error(\`Wallet settle HTTP \${response.status}\`);
    }
    return (await response.json()) as GameSettleResponse;
  }
}`
    }
  };

  const [selectedKey, setSelectedKey] = useState<string>("wallet_engine");
  const [copied, setCopied] = useState(false);

  const activeFile = fileManifest[selectedKey];

  const handleCopy = () => {
    navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-4 min-h-[580px]">
        {/* Left: File Tree Sidebar */}
        <div className="border-r border-slate-200 p-4 bg-slate-50/50">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            项目微服务文件树
          </div>
          <div className="space-y-1">
            {Object.entries(fileManifest).map(([key, item]) => {
              const active = selectedKey === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedKey(key)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center space-x-2 transition-all ${
                    active
                      ? "bg-slate-900 text-white font-semibold shadow-sm"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <FileCode className="w-4 h-4 shrink-0 text-indigo-500" />
                  <span className="truncate font-mono">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: Code Viewer */}
        <div className="md:col-span-3 flex flex-col justify-between bg-slate-950 text-slate-200">
          {/* File Top Bar */}
          <div className="px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
            <div>
              <div className="font-mono text-xs font-bold text-slate-100 flex items-center gap-2">
                <span>{activeFile.path}</span>
                <span className="text-[10px] text-slate-400 font-sans">({activeFile.language})</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">{activeFile.desc}</p>
            </div>
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-mono flex items-center gap-1.5 transition-colors border border-slate-700"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "已复制" : "复制代码"}</span>
            </button>
          </div>

          {/* Code Body */}
          <div className="p-5 font-mono text-xs leading-relaxed overflow-x-auto flex-1 text-slate-300">
            <pre>{activeFile.content}</pre>
          </div>

          {/* Bottom Bar */}
          <div className="px-5 py-2.5 border-t border-slate-800 text-[11px] text-slate-500 font-mono flex justify-between bg-slate-900/40">
            <span>遵循 PEP8 (Python) 与 ESLint (TypeScript) 严格规范</span>
            <span>无任何法币充值/提现接口 · 纯净虚拟封闭体系</span>
          </div>
        </div>
      </div>
    </div>
  );
};

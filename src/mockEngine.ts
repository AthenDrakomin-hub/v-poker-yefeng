/**
 * 虚拟经济沙盒引擎 (Client-side Exact Replica of WalletEngine)
 * 严格按照 Python 后端业务算法、向下取整规则与幂等拦截实现
 */
import { Wallet, Transaction, FeePool, Agent, GameRecord, SettlementLog, AuditMetrics, GameSettleRequest } from "./types";

export class VirtualEconomySandbox {
  wallets: Map<string, Wallet> = new Map();
  transactions: Transaction[] = [];
  feePool: FeePool = { pool_id: "platform_fee", balance: 0, updated_at: Date.now() };
  agents: Agent[] = [];
  gameRecords: GameRecord[] = [];
  settlementLogs: SettlementLog[] = [];

  constructor() {
    this.resetState();
  }

  resetState() {
    this.wallets.clear();
    this.transactions = [];
    this.feePool = { pool_id: "platform_fee", balance: 0, updated_at: Date.now() };
    this.gameRecords = [];
    this.settlementLogs = [];

    // 初始化预置角色钱包
    const initialWallets: Wallet[] = [
      { wallet_id: "w_admin_root", user_id: "u_admin_root", user_type: "admin", balance: 0, frozen_balance: 0, updated_at: Date.now() },
      { wallet_id: "w_support_01", user_id: "u_support_001", user_type: "support", balance: 0, frozen_balance: 0, updated_at: Date.now() },
      { wallet_id: "w_agent_top", user_id: "agt_top_01", user_type: "agent", balance: 0, frozen_balance: 0, updated_at: Date.now() },
      { wallet_id: "w_agent_sub", user_id: "agt_sub_02", user_type: "agent", balance: 0, frozen_balance: 0, updated_at: Date.now() },
      { wallet_id: "w_agent_room", user_id: "agt_room_03", user_type: "agent", balance: 0, frozen_balance: 0, updated_at: Date.now() },
      { wallet_id: "w_player_alice", user_id: "p_alice", user_type: "player", balance: 0, frozen_balance: 0, updated_at: Date.now() },
      { wallet_id: "w_player_bob", user_id: "p_bob", user_type: "player", balance: 0, frozen_balance: 0, updated_at: Date.now() },
      { wallet_id: "w_player_charlie", user_id: "p_charlie", user_type: "player", balance: 0, frozen_balance: 0, updated_at: Date.now() },
    ];
    initialWallets.forEach((w) => this.wallets.set(w.user_id, { ...w }));

    // 预置三级代理树
    this.agents = [
      { agent_id: "agt_top_01", parent_id: null, level: 2, r_ratio: 0.2000, commission_balance: 0, status: "active" },
      { agent_id: "agt_sub_02", parent_id: "agt_top_01", level: 1, r_ratio: 0.3000, commission_balance: 0, status: "active" },
      { agent_id: "agt_room_03", parent_id: "agt_sub_02", level: 0, r_ratio: 0.5000, commission_balance: 0, status: "active" },
    ];
  }

  getWallet(userId: string, userType: Wallet["user_type"] = "player"): Wallet {
    if (!this.wallets.has(userId)) {
      const newWallet: Wallet = {
        wallet_id: `w_${userType}_${userId}`,
        user_id: userId,
        user_type: userType,
        balance: 0,
        frozen_balance: 0,
        updated_at: Date.now()
      };
      this.wallets.set(userId, newWallet);
    }
    return this.wallets.get(userId)!;
  }

  /**
   * 1. 管理员铸币 POST /api/wallet/mint
   */
  mint(txId: string, adminUserId: string, targetUserId: string, amount: number, remark = "Admin Mint") {
    // 幂等校验
    if (this.transactions.some((t) => t.transaction_id === txId)) {
      throw new Error(`Duplicate transaction_id '${txId}'. Idempotency violation.`);
    }
    if (amount <= 0 || !Number.isInteger(amount)) {
      throw new Error("Mint amount must be a positive integer.");
    }

    const wallet = this.getWallet(targetUserId);
    wallet.balance += amount;
    wallet.updated_at = Date.now();

    const tx: Transaction = {
      transaction_id: txId,
      from_wallet_id: null,
      to_wallet_id: wallet.wallet_id,
      amount,
      fee: 0,
      fee_recipient: "platform_fee",
      type: "mint",
      status: "success",
      remark: `${remark} | Admin:${adminUserId}`,
      created_at: Date.now()
    };
    this.transactions.unshift(tx);

    return { tx, wallet, audit: this.audit() };
  }

  /**
   * 2. 用户自由转账 POST /api/wallet/transfer (扣 0.01% 手续费)
   */
  transfer(txId: string, fromUserId: string, toUserId: string, amount: number, remark = "User Transfer") {
    if (this.transactions.some((t) => t.transaction_id === txId)) {
      throw new Error(`Duplicate transaction_id '${txId}'. Idempotency violation.`);
    }
    if (fromUserId === toUserId) {
      throw new Error("Cannot transfer to self.");
    }
    if (amount <= 0 || !Number.isInteger(amount)) {
      throw new Error("Amount must be a positive integer.");
    }

    const fromWallet = this.wallets.get(fromUserId);
    if (!fromWallet || fromWallet.balance < amount) {
      throw new Error(`Insufficient balance. Available: ${fromWallet?.balance ?? 0}, Requested: ${amount}`);
    }

    const toWallet = this.getWallet(toUserId);

    // 扣除 0.01% 手续费 (向下取整)
    // 200,000 * 0.0001 = 20
    const fee = Math.floor(amount * 0.0001);
    const netAmount = amount - fee;

    fromWallet.balance -= amount;
    fromWallet.updated_at = Date.now();

    toWallet.balance += netAmount;
    toWallet.updated_at = Date.now();

    this.feePool.balance += fee;
    this.feePool.updated_at = Date.now();

    const tx: Transaction = {
      transaction_id: txId,
      from_wallet_id: fromWallet.wallet_id,
      to_wallet_id: toWallet.wallet_id,
      amount: netAmount,
      fee,
      fee_recipient: "platform_fee",
      type: "transfer",
      status: "success",
      remark: `${remark} | Gross:${amount}, Fee:${fee}`,
      created_at: Date.now()
    };
    this.transactions.unshift(tx);

    return { tx, fromWallet, toWallet, fee, netAmount, audit: this.audit() };
  }

  /**
   * 3. 游戏对局结算 POST /api/wallet/game_settle
   */
  gameSettle(
    txId: string,
    roomId: string,
    totalPot: number,
    playerCount: number,
    winners: Array<{ userId: string; weight: number }>,
    platformFeeRate = 0.0500, // 5%
    agentCommissionRate = 0.0300, // 3%
    roomAgentId = "agt_room_03"
  ) {
    if (this.transactions.some((t) => t.transaction_id === txId)) {
      throw new Error(`Duplicate transaction_id '${txId}'. Idempotency violation.`);
    }

    // 核心指标计算
    const totalRake = Math.floor(totalPot * platformFeeRate);
    const agentPool = Math.floor(totalPot * agentCommissionRate);
    const winnersPayout = totalPot - totalRake;
    const basePlatformRevenue = totalRake - agentPool;

    // 赢家筹码分发
    const totalWeight = winners.reduce((sum, w) => sum + w.weight, 0);
    let distributedPayout = 0;
    const winnersDetail = winners.map((w, idx) => {
      let share = 0;
      if (idx === winners.length - 1) {
        share = winnersPayout - distributedPayout;
      } else {
        share = Math.floor((winnersPayout * w.weight) / totalWeight);
        distributedPayout += share;
      }
      const winWallet = this.getWallet(w.userId);
      winWallet.balance += share;
      winWallet.updated_at = Date.now();
      return { userId: w.userId, amount: share };
    });

    // 代理层级分账
    let totalAgentCommission = 0;
    const agentShares: any[] = [];
    const agentChain = [...this.agents].sort((a, b) => a.level - b.level);

    agentChain.forEach((agt) => {
      const share = Math.floor(agentPool * agt.r_ratio);
      totalAgentCommission += share;

      const agtWallet = this.getWallet(agt.agent_id, "agent");
      agtWallet.balance += share;
      agtWallet.updated_at = Date.now();
      agt.commission_balance += share;

      agentShares.push({
        agent_id: agt.agent_id,
        level: agt.level,
        r_ratio: agt.r_ratio,
        commission_amount: share
      });

      this.settlementLogs.unshift({
        settlement_id: `stl_${Math.random().toString(36).substring(2, 10)}`,
        transaction_id: txId,
        agent_id: agt.agent_id,
        level: agt.level,
        commission_amount: share,
        platform_revenue: basePlatformRevenue,
        created_at: Date.now()
      });
    });

    // 零碎补贴给平台留存
    const unallocated = agentPool - totalAgentCommission;
    const finalPlatformRevenue = basePlatformRevenue + unallocated;

    this.feePool.balance += finalPlatformRevenue;
    this.feePool.updated_at = Date.now();

    this.gameRecords.unshift({
      transaction_id: txId,
      room_id: roomId,
      total_flow: totalPot,
      player_count: playerCount,
      created_at: Date.now(),
      settlement_status: "settled"
    });

    const tx: Transaction = {
      transaction_id: txId,
      from_wallet_id: `room_${roomId}`,
      to_wallet_id: winnersDetail[0].userId,
      amount: winnersPayout,
      fee: totalRake,
      fee_recipient: "platform_fee",
      type: "game_settle",
      status: "success",
      remark: `Room:${roomId} | Pot:${totalPot} | Rake:${totalRake} | AgentPool:${agentPool}`,
      created_at: Date.now()
    };
    this.transactions.unshift(tx);

    return {
      tx,
      totalPot,
      totalRake,
      agentPool,
      platformRevenue: finalPlatformRevenue,
      winnersPayout,
      winnersDetail,
      agentShares,
      audit: this.audit()
    };
  }

  /**
   * 4. 游戏引擎标准协议结算 POST /api/wallet/game_settle
   * 接收多游戏核心计算出的 player_results，执行原子增减与能量守恒分账
   */
  settleFromGameEngine(req: GameSettleRequest) {
    if (this.transactions.some((t) => t.transaction_id === req.transaction_id)) {
      throw new Error(`Duplicate transaction_id '${req.transaction_id}'. Idempotency violation.`);
    }

    // 分离赢家与输家
    const winners = req.player_results.filter((p) => p.net_amount > 0);
    const losers = req.player_results.filter((p) => p.net_amount < 0);

    const grossWinTotal = winners.reduce((sum, w) => sum + w.net_amount, 0);
    const grossLossTotal = Math.abs(losers.reduce((sum, l) => sum + l.net_amount, 0));

    // 计算抽水与代理池 (基于赢家盈利面)
    const platformFeeRate = req.platform_fee_rate || 0.0500;
    const agentCommissionRate = req.agent_commission_rate || 0.0300;

    const totalRake = Math.floor(grossWinTotal * platformFeeRate);
    const agentPool = Math.floor(grossWinTotal * agentCommissionRate);
    const basePlatformRevenue = totalRake - agentPool;

    // 1. 输家扣款
    losers.forEach((l) => {
      const loserWallet = this.getWallet(l.user_id);
      // net_amount 是负数，直接加上负数就是扣减
      loserWallet.balance += l.net_amount;
      loserWallet.updated_at = Date.now();
    });

    // 2. 赢家加款 (扣除抽水)
    let distributedRake = 0;
    const winnersPayoutDetails: Array<{ userId: string; netGain: number; rakePaid: number }> = [];

    winners.forEach((w, idx) => {
      let playerRake = 0;
      if (idx === winners.length - 1) {
        playerRake = totalRake - distributedRake;
      } else {
        playerRake = Math.floor((totalRake * w.net_amount) / grossWinTotal);
        distributedRake += playerRake;
      }

      const netGain = w.net_amount - playerRake;
      const winWallet = this.getWallet(w.user_id);
      winWallet.balance += netGain;
      winWallet.updated_at = Date.now();

      winnersPayoutDetails.push({
        userId: w.user_id,
        netGain,
        rakePaid: playerRake
      });
    });

    // 3. 代理返佣
    let totalAgentCommission = 0;
    const agentShares: any[] = [];
    const agentChain = [...this.agents].sort((a, b) => a.level - b.level);

    agentChain.forEach((agt) => {
      const share = Math.floor(agentPool * agt.r_ratio);
      totalAgentCommission += share;

      const agtWallet = this.getWallet(agt.agent_id, "agent");
      agtWallet.balance += share;
      agtWallet.updated_at = Date.now();
      agt.commission_balance += share;

      agentShares.push({
        agent_id: agt.agent_id,
        level: agt.level,
        r_ratio: agt.r_ratio,
        commission_amount: share
      });

      this.settlementLogs.unshift({
        settlement_id: `stl_${Math.random().toString(36).substring(2, 10)}`,
        transaction_id: req.transaction_id,
        agent_id: agt.agent_id,
        level: agt.level,
        commission_amount: share,
        platform_revenue: basePlatformRevenue,
        created_at: Date.now()
      });
    });

    // 4. 平台收益留存入 feePool
    const unallocated = agentPool - totalAgentCommission;
    const finalPlatformRevenue = basePlatformRevenue + unallocated;

    this.feePool.balance += finalPlatformRevenue;
    this.feePool.updated_at = Date.now();

    // 5. 记录总账
    this.gameRecords.unshift({
      transaction_id: req.transaction_id,
      room_id: req.room_id,
      total_flow: req.total_pot || grossWinTotal,
      player_count: req.player_results.length,
      created_at: Date.now(),
      settlement_status: "settled"
    });

    const tx: Transaction = {
      transaction_id: req.transaction_id,
      from_wallet_id: `room_${req.room_id}`,
      to_wallet_id: winners[0]?.user_id || "platform",
      amount: grossWinTotal - totalRake,
      fee: totalRake,
      fee_recipient: "platform_fee",
      type: "game_settle",
      status: "success",
      remark: `Game:${req.game_type} | Room:${req.room_id} | Pot:${req.total_pot} | Rake:${totalRake}`,
      created_at: Date.now()
    };
    this.transactions.unshift(tx);

    return {
      tx,
      totalPot: req.total_pot,
      totalRake,
      agentPool,
      platformRevenue: finalPlatformRevenue,
      winnersPayout: grossWinTotal - totalRake,
      winnersPayoutDetails,
      agentShares,
      audit: this.audit()
    };
  }

  /**
   * 5. 能量守恒对账 GET /api/wallet/audit
   */
  audit(): AuditMetrics {
    const totalMinted = this.transactions
      .filter((t) => t.type === "mint" && t.status === "success")
      .reduce((sum, t) => sum + t.amount, 0);

    const walletsBalanceSum = Array.from(this.wallets.values()).reduce(
      (sum, w) => sum + w.balance + w.frozen_balance,
      0
    );

    const feePoolBalance = this.feePool.balance;
    const totalAssets = walletsBalanceSum + feePoolBalance;
    const difference = totalAssets - totalMinted;

    return {
      total_minted: totalMinted,
      wallets_balance_sum: walletsBalanceSum,
      fee_pool_balance: feePoolBalance,
      total_system_assets: totalAssets,
      difference,
      is_conserved: difference === 0,
      wallets_count: this.wallets.size,
      audit_time: Date.now()
    };
  }
}

export const sandbox = new VirtualEconomySandbox();

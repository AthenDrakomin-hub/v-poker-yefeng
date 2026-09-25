/**
 * 平台核心状态机 (Core Game State Machine)
 * 管理牌局生命周期：WAITING -> DEALING -> ACTION/BETTING -> SHOWDOWN -> SETTLING -> FINISHED
 * 资金流闭环：玩家下注(bet) �?结算(game_settle) �?异常退�?refund)
 *
 * v3 新增�?
 *  - TurnTimer 回合动作倒计时（默认 30s，超时自�?check/fold�?
 *  - RoundEventLog 事件日志（局末落�?game_replays�?
 *  - startRound 改为 async，等待盲注扣款完�?
 */

import { GamePlugin, PluginRoundState } from "../games/plugin.interface.js";
import { GameAction, GameRoom, GameSettleRequest, PlayerNetResult, RoundPhase, SidePot } from "../shared/types.js";
import { SeatManager } from "./seatManager.js";
import { coreEventBus } from "./eventBus.js";
import { walletClient, WalletClient } from "../bridge/walletClient.js";
import { TurnTimer } from "./turnTimer.js";
import { RoundEventLog } from "./eventLog.js";
import { BotManager } from "./botManager.js";
import { saveGameRecord, saveGameReplay } from "./db.js";

export class GameStateMachine {
  public roundState: PluginRoundState;
  public plugin: GamePlugin;
  public seatManager: SeatManager;
  public lastResults: PlayerNetResult[] = [];

  /** 本局事件日志 */
  public eventLog: RoundEventLog;

  /** 回合动作倒计时器 */
  public turnTimer: TurnTimer;

  /** AI 机器人管理器 */
  public botManager: BotManager;

  /** 本局每个玩家已下注总额（用于异常退款） */
  private playerBetsThisRound: Map<string, number> = new Map();

  /** 当前轮次编号（用于生�?bet transaction_id�?*/
  private currentRoundNumber: number = 0;

  constructor(room: GameRoom, plugin: GamePlugin, seatManager: SeatManager) {
    this.plugin = plugin;
    this.seatManager = seatManager;

    this.roundState = {
      room,
      seats: seatManager.getSeats(),
      deck: [],
      community_cards: [],
      phase: "WAITING",
      banker_seat_index: null,
      current_turn_seat_index: null,
      total_pot: 0,
      current_highest_bet: 0,
      min_call_amount: room.base_score,
      betting_round_count: 0,
      side_pots: [],
    };

    this.eventLog = new RoundEventLog(room.room_id, room.game_type, 0);

    // 按游戏模式设置动作超时（毫秒）
    const MODE_TIMEOUTS: Record<string, number> = {
      fixed_limit: 30_000,   // 德州类：标准30s
      banker: 20_000,         // 抢庄牛牛/三公：快速20s
      free_compare: 15_000,   // 通比：15s
      compare: 25_000,        // 炸金花：25s
      split_hand: 15_000,     // 十三水/菠萝：15s（无下注）
      trick_taking: 30_000,   // 斗地主等：30s
    };
    const defaultTimeout = Number(process.env.TURN_TIMEOUT_MS || 30_000);
    const actionTimeout = MODE_TIMEOUTS[room.mode] ?? defaultTimeout;

    // 回合倒计时器：轮到谁行动时启动，超时自动 check/fold
    this.turnTimer = new TurnTimer({
      roomId: room.room_id,
      actionTimeoutMs: actionTimeout,
      onTimeout: (seatIndex, userId) => this.handleTimeoutAction(seatIndex, userId),
      canCheck: (seatIndex) => {
        const seat = this.seatManager.getSeat(seatIndex);
        return !!seat && seat.current_bet >= this.roundState.current_highest_bet;
      },
    });

    this.botManager = new BotManager(room.room_id, this);
  }

  public getPhase(): RoundPhase {
    return this.roundState.phase;
  }

  public canStart(): boolean {
    const readyCount = this.seatManager.getActivePlayersCount();
    return readyCount >= this.roundState.room.min_players_to_start;
  }

  /**
   * 开始一局（async：等待盲注扣款完成）
   * 修复 v2 bug：原实现调用 async processBlindBets �?await，盲注扣款可能失�?
   */
  public async startRound(): Promise<boolean> {
    if (!this.canStart()) return false;

    this.seatManager.resetRoundState();
    this.roundState.deck = this.plugin.initDeck();
    this.roundState.community_cards = [];
    this.roundState.total_pot = 0;
    this.roundState.current_highest_bet = 0;
    this.roundState.min_call_amount = this.roundState.room.base_score;
    this.roundState.betting_round_count = 0;
    this.roundState.side_pots = [];
    this.lastResults = [];
    this.playerBetsThisRound.clear();
    this.currentRoundNumber++;

    // 新一局，重置事件日�?
    this.eventLog = new RoundEventLog(
      this.roundState.room.room_id,
      this.roundState.room.game_type,
      this.currentRoundNumber
    );
    this.eventLog.push("round_start", {
      base_score: this.roundState.room.base_score,
      players: this.seatManager.getActivePlayersCount(),
    });

    this.transitionTo("DEALING");
    this.plugin.dealCards(this.roundState);

    // 记录发牌事件（只记数量）
    const dealtPlayers = this.roundState.seats
      .filter((s) => s.cards.length > 0)
      .map((s) => ({ seat_index: s.seat_index, count: s.cards.length }));
    this.eventLog.logCardsDealt(dealtPlayers);

    // 发牌后处理小�?大盲的下注（自动 bet）—�?async，必�?await
    await this.processBlindBets();

    const nextPhase = this.plugin.getNextPhase(this.roundState);
    this.transitionTo(nextPhase);

    // 进入行动阶段：先确保回合座位（非德州插件不设置该字段），再启动倒计�?
    this.syncTurnSeat();
    this.maybeStartTurnTimer();

    return true;
  }

  /**
   * 满足开局条件时自动开局（由 ready 动作触发�?
   *
   * 说明：此前引擎中没有任何调用 startRound 的入口（HTTP 路由�?WS 均无），
   *       `ready` 只把座位置为 ready，牌局会永远停�?WAITING�?
   */
  public maybeStartRound(): boolean {
    if (this.roundState.phase !== "WAITING") return false;
    if (!this.canStart()) return false;

    // startRound �?async（等待盲注扣款），此处不阻塞动作 ACK
    void this.startRound().catch((err) => {
      console.error(`[StateMachine] startRound failed (room ${this.roundState.room.room_id}):`, err);
    });
    return true;
  }

  /**
   * 处理初始下注：德州自动扣 SB/BB，炸金花/其他游戏扣 ante
   * 遍历所有在局座位，凡 current_bet > 0 者都记录下注（兼容盲注和底注两种模式）
   */
  private async processBlindBets(): Promise<void> {
    const activeSeats = this.roundState.seats.filter(
      (s) => s.status === "playing" || s.status === "ready"
    );
    if (activeSeats.length < 2) return;

    // P0：快照 current_bet，避免 await 期间被玩家动作修改
    const bets: Array<{ userId: string; amount: number }> = [];
    for (const seat of activeSeats) {
      if (seat.user_id && seat.current_bet > 0) {
        bets.push({ userId: seat.user_id, amount: seat.current_bet });
      }
    }
    for (const { userId, amount } of bets) {
      await this.recordPlayerBet(userId, amount);
      this.eventLog.push("blind", { user_id: userId, amount });
    }
  }

  /**
   * 记录玩家下注并调�?wallet-service/bet
   */
  public async recordPlayerBet(userId: string, amount: number): Promise<boolean> {
    if (amount <= 0) return true;

    // bot 玩家：虚拟筹码，不走 wallet-service
    if (this.botManager.isBot(userId)) {
      const previous = this.playerBetsThisRound.get(userId) || 0;
      this.playerBetsThisRound.set(userId, previous + amount);
      return true;
    }

    const previous = this.playerBetsThisRound.get(userId) || 0;
    this.playerBetsThisRound.set(userId, previous + amount);

    const txId = walletClient.generateBetTxId(
      this.roundState.room.room_id,
      userId,
      this.currentRoundNumber
    );

    try {
      await walletClient.betChips({
        transaction_id: txId,
        room_id: this.roundState.room.room_id,
        user_id: userId,
        amount,
        remark: `Round ${this.currentRoundNumber} bet`,
      });
      console.log(`[Bet] ${userId} bet ${amount} �?room ${this.roundState.room.room_id}`);
      return true;
    } catch (err: any) {
      console.error(`[Bet Failed] ${userId} bet ${amount}:`, err.message);
      this.playerBetsThisRound.set(userId, previous);
      return false;
    }
  }

  public async handleAction(action: GameAction): Promise<{ success: boolean; error?: string }> {
    // 结算阶段不接受玩家动作，防止跳过结算直接到 FINISHED
    if (this.roundState.phase === "SETTLING" || this.roundState.phase === "SHOWDOWN") {
      return { success: false, error: "Round is settling, no more actions." };
    }
    const seat = this.roundState.seats.find((s) => s.user_id === action.user_id);
    const oldCurrentBet = seat?.current_bet || 0;

    const result = this.plugin.handleAction(this.roundState, action);
    this.eventLog.logAction(action, result);

    if (!result.success) return result;

    // 玩家正常动作后取消倒计时
    this.turnTimer.cancel();

    // 如果是下注类动作，计算增量并调用 wallet-service/bet（同步等待，防止资金不平）
    const betActions = ["bet", "call", "raise", "all_in"];
    if (betActions.includes(action.action_type) && seat) {
      const newCurrentBet = seat.current_bet;
      const delta = newCurrentBet - oldCurrentBet;
      if (delta > 0) {
        const ok = await this.recordPlayerBet(action.user_id, delta);
        if (!ok) {
          // 扣款失败：回滚座位置，拒绝该动作
          seat.current_bet = oldCurrentBet;
          return { success: false, error: "Wallet bet failed: insufficient balance" };
        }
      }
    }

    coreEventBus.emit("action_executed", {
      roomId: this.roundState.room.room_id,
      action,
      phase: this.roundState.phase,
    });

    if (this.plugin.isPhaseComplete(this.roundState)) {
      const prevPhase = this.roundState.phase;
      const nextPhase = this.plugin.getNextPhase(this.roundState);
      this.transitionTo(nextPhase);

      // 记录公共牌事�?
      if (this.roundState.community_cards.length > 0 && this.roundState.phase === "BETTING") {
        const street = this.roundState.betting_round_count === 2 ? "flop"
          : this.roundState.betting_round_count === 3 ? "turn"
          : this.roundState.betting_round_count === 4 ? "river"
          : null;
        if (street) {
          this.eventLog.logCommunity(this.roundState.community_cards, street);
        }
      }

      if (this.roundState.phase === "SHOWDOWN") {
        this.lastResults = this.plugin.calculateNetScores(this.roundState);
        this.eventLog.logShowdown(
          this.lastResults.map((r) => ({
            user_id: r.user_id,
            hand_name: r.hand_name || "",
            rank_level: 0,
            net_amount: r.net_amount,
          }))
        );
        this.transitionTo("SETTLING");

        // 到达结算阶段 → 自动调用钱包结算
        // （此前只能由外部 HTTP /api/engine/room/:id/settle 触发，导致 round_result 永不推送）
        this.autoSettle();
      }
    }

    // 兜底：回合座位为空或不可行动时推进到下一个可行动座位
    this.syncTurnSeat();

    // 阶段推进后，如果还在 BETTING，启动下一个行动玩家的倒计�?
    this.maybeStartTurnTimer();

    return { success: true };
  }

  /**
   * 同步回合座位：依据插件声明的「本阶段应行动座位」推�?current_turn_seat_index
   *
   * 说明：只�?texas_holdem 插件实现�?rotateTurn；zha_jin_hua / niu_niu / san_gong
   *       从不设置 current_turn_seat_index，导致回合倒计时与机器人调度都不启动，
   *       牌局永远无法推进。这里由核心统一驱动，插件只需声明 getActionSeats()�?
   */
  private syncTurnSeat(): void {
    const actors = this.plugin.getActionSeats(this.roundState);
    if (actors.length === 0) {
      this.roundState.current_turn_seat_index = null;
      return;
    }

    const pending = actors.filter((s) => !s.has_acted).sort((a, b) => a.seat_index - b.seat_index);
    if (pending.length === 0) {
      this.roundState.current_turn_seat_index = null;
      return;
    }

    const idx = this.roundState.current_turn_seat_index;
    const cur = idx !== null ? this.roundState.seats[idx] : null;
    // 当前座位仍是待行动�?�?保留
    if (cur != null && pending.some((s) => s.seat_index === cur.seat_index)) return;

    const start = idx === null ? -1 : idx;
    const next = pending.find((s) => s.seat_index > start) ?? pending[0];
    this.roundState.current_turn_seat_index = next.seat_index;
  }

  /**
   * 自动结算（fire-and-forget）
   *
   * 说明：引擎此前不会自行结算，round_result 只在外部调用 HTTP /settle 时才推送，
   *       导致客户端永远收不到一局结束事件。这里在进入 SETTLING 后自动结算；
   *       结算失败也会强制收口（finishSettlement），避免牌局卡死。
   */
  private autoSettle(): void {
    void this.settleRound().catch((err: any) => {
      console.error(
        `[StateMachine] auto settle failed (room ${this.roundState.room.room_id}):`,
        err?.message ?? err
      );
      try {
        this.finishSettlement();
      } catch (e) {
        console.error(`[StateMachine] finishSettlement failed:`, e);
      }
    });
  }

  /**
   * 回合超时动作：能 check 就 check，否则 fold
   */
  private async handleTimeoutAction(seatIndex: number, userId: string): Promise<void> {
    const seat = this.seatManager.getSeat(seatIndex);
    if (!seat || !seat.user_id || (seat.status !== "playing" && seat.status !== "all_in")) {
      return;
    }

    this.eventLog.logAutoFold(userId, seatIndex, "turn_timeout");
    console.log(`[TurnTimer] Player ${userId} at seat ${seatIndex} timed out, auto action`);

    if (seat.current_bet >= this.roundState.current_highest_bet) {
      // 可以过牌
      await this.handleAction({ user_id: userId, action_type: "check" });
    } else {
      // 不能过牌，自动弃牌
      await this.handleAction({ user_id: userId, action_type: "fold" });
    }
  }

  /** 如果当前在需要行动阶段且有行动玩家，启动倒计�?*/
  private maybeStartTurnTimer(): void {
    const phase = this.roundState.phase;
    // 非德州玩法还包含 QIANG_ZHUANG / ACTION 阶段，同样需要回合调�?
    if (phase !== "BETTING" && phase !== "ACTION" && phase !== "QIANG_ZHUANG") return;
    const turnSeatIndex = this.roundState.current_turn_seat_index;
    if (turnSeatIndex === null) return;
    const seat = this.seatManager.getSeat(turnSeatIndex);
    if (!seat || !seat.user_id || seat.status !== "playing") return;
    if (seat.is_disconnected) return;

    // 轮到 bot：交�?BotManager 决策，不启动人类倒计�?
    if (this.botManager.isBot(seat.user_id)) {
      this.botManager.scheduleBotTurn(turnSeatIndex, seat.user_id);
      return;
    }

    this.turnTimer.start(turnSeatIndex, seat.user_id);
  }

  public forceShowdown(): PlayerNetResult[] {
    this.turnTimer.cancel();
    this.transitionTo("SHOWDOWN");
    this.lastResults = this.plugin.calculateNetScores(this.roundState);
    this.transitionTo("SETTLING");
    return this.lastResults;
  }

  /**
   * 执行微服务原子结�?(POST /api/wallet/game_settle)
   */
  public async settleRound(client: WalletClient = walletClient): Promise<{
    request: GameSettleRequest | null;
    response: any;
  }> {
    this.turnTimer.cancel();

    if (this.roundState.phase !== "SETTLING" && this.roundState.phase !== "SHOWDOWN") {
      this.forceShowdown();
    } else if (this.lastResults.length === 0) {
      this.lastResults = this.plugin.calculateNetScores(this.roundState);
    }

    const roomId = this.roundState.room.room_id;
    const totalPot = this.roundState.total_pot;

    // 判断是否为交换型游戏（抢庄/通比牛牛、三公等庄闲直接结算）
    const isExchangeGame =
      this.roundState.room.mode === "banker" ||
      this.roundState.room.mode === "free_compare" ||
      this.roundState.banker_seat_index != null;

    if (isExchangeGame) {
      // ===== 交换型结算：退款 + 用户间直接转账 =====
      // 1. 先把牌桌钱包里的下注全部退还给玩家
      const betEntries = Array.from(this.playerBetsThisRound.entries());
      for (const [userId, amount] of betEntries) {
        if (amount <= 0) continue;
        try {
          const refundTxId = `refund_${roomId}_${userId}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
          const refundRes = await client.refundChips({
            transaction_id: refundTxId,
            room_id: roomId,
            refunds: [{ user_id: userId, amount }],
          });
          if (refundRes.code !== 0) {
            console.error(`[ExchangeSettle] refund API error for ${userId}:`, refundRes.message);
          } else {
            console.log(`[ExchangeSettle] refunded ${amount} to ${userId} (room ${roomId})`);
          }
        } catch (e: any) {
          console.error(`[ExchangeSettle] refund failed for ${userId}:`, e.message);
        }
      }

      // 2. 按净分在玩家间直接转账：负数方 → 正数方
      const losers = this.lastResults.filter((r) => r.net_amount < 0);
      const winners = this.lastResults.filter((r) => r.net_amount > 0);
      let transferIdx = 0;
      for (const loser of losers) {
        let remaining = Math.abs(loser.net_amount);
        for (const winner of winners) {
          if (remaining <= 0) break;
          // 按赢家应收比例分配（简化：顺序扣完为止）
          const winnerShare = winner.net_amount;
          const transferAmount = Math.min(remaining, winnerShare);
          if (transferAmount <= 0) continue;
          try {
            const txId = client.generateTransferTxId(roomId, loser.user_id, winner.user_id);
            await client.transferChips({
              transaction_id: txId,
              from_user_id: loser.user_id,
              to_user_id: winner.user_id,
              amount: transferAmount,
              remark: `Exchange settle round ${this.currentRoundNumber}`,
            });
            console.log(`[ExchangeSettle] ${loser.user_id} -> ${winner.user_id}: ${transferAmount}`);
          } catch (e: any) {
            console.error(`[ExchangeSettle] transfer failed:`, e.message);
          }
          remaining -= transferAmount;
          transferIdx++;
        }
      }

      this.eventLog.logSettle(totalPot, winners.map((w) => w.user_id), []);
      console.log(`[StateMachine] exchange settle done for room ${roomId}, tx count=${transferIdx}`);
      this.finishSettlement();
      return { request: null, response: null };
    }

    // ===== 底池型结算（德州等）：game_settle 分池 =====
    const winnerIds = this.lastResults
      .filter((r) => r.net_amount >= 0)
      .map((r) => r.user_id);

    if (winnerIds.length === 0) {
      console.warn(
        `[StateMachine] no pot winner (room ${roomId}), refunding bets to players.`
      );
      try {
        await this.refundOnAbort("all_folded", client);
      } catch (e) {
        console.error(`[StateMachine] refund failed for room ${roomId}:`, e);
      }
      this.eventLog.logSettle(totalPot, [], []);
      this.finishSettlement();
      return { request: null, response: null };
    }

    if (totalPot <= 0) {
      console.warn(`[StateMachine] total_pot=0 for room ${roomId}, skipping wallet settle.`);
      this.eventLog.logSettle(0, winnerIds, []);
      this.finishSettlement();
      return { request: null, response: null };
    }

    const txId = client.generateSettleTxId(roomId);
    const settlePayload: GameSettleRequest = {
      transaction_id: txId,
      room_id: roomId,
      total_pot: totalPot,
      winner_ids: winnerIds,
      platform_fee_rate: this.roundState.room.platform_fee_rate,
      agent_commission_rate: this.roundState.room.agent_commission_rate,
      agent_ids: this.roundState.room.agent_ids,
    };

    const settleRes = await client.settleGame(settlePayload);

    this.eventLog.logSettle(
      totalPot,
      winnerIds,
      this.roundState.side_pots?.map((p: SidePot) => ({ amount: p.amount }))
    );

    // 落库（失败不影响结算主流程）
    try {
      const activePlayers = this.seatManager.getSeats().filter((s) => s.user_id);
      await saveGameRecord({
        transaction_id: txId,
        room_id: roomId,
        round_no: this.roundState.betting_round_count,
        total_flow: totalPot,
        player_count: activePlayers.length,
      });
      await saveGameReplay({
        replay_id: `replay_${txId}`,
        room_id: roomId,
        game_type: this.roundState.room.game_type,
        round_no: this.roundState.betting_round_count,
        players: activePlayers.map((s) => ({
          user_id: s.user_id,
          seat_index: s.seat_index,
          chips: s.chips,
          cards: s.cards?.map((c) => (typeof c === "string" ? c : c.code)),
          hand_result: s.hand_result,
        })),
        actions: this.eventLog.getAll(),
        result: this.lastResults,
        duration_sec: 0,
      });
      console.log(`[StateMachine] game_records + game_replays saved for tx ${txId}`);
    } catch (err) {
      console.error(`[StateMachine] Failed to persist game record:`, err);
    }

    this.finishSettlement();
    return { request: settlePayload, response: settleRes };
  }

  /**
   * 异常退款：玩家中途退�?/ 房间解散 / 游戏中断
   */
  public async refundOnAbort(
    reason: string = "aborted",
    client: WalletClient = walletClient
  ): Promise<{ refunds: Array<{ user_id: string; amount: number }>; response: any }> {
    this.turnTimer.cancel();
    const roomId = this.roundState.room.room_id;
    const refunds: Array<{ user_id: string; amount: number }> = [];

    for (const [userId, amount] of this.playerBetsThisRound.entries()) {
      if (amount > 0) {
        refunds.push({ user_id: userId, amount });
      }
    }

    if (refunds.length === 0) {
      return { refunds: [], response: null };
    }

    const txId = client.generateRefundTxId(roomId);
    const refundPayload = {
      transaction_id: txId,
      room_id: roomId,
      refunds,
      remark: `Abnormal refund: ${reason}`,
    };

    const refundRes = await client.refundChips(refundPayload);
    this.playerBetsThisRound.clear();
    this.transitionTo("WAITING");

    return { refunds, response: refundRes };
  }

  public getPlayerBetTotal(userId: string): number {
    return this.playerBetsThisRound.get(userId) || 0;
  }

  public getAllPlayerBets(): Map<string, number> {
    return new Map(this.playerBetsThisRound);
  }

  public finishSettlement(): void {
    this.turnTimer.cancel();
    this.transitionTo("FINISHED");
    this.roundState.phase = "WAITING";
    this.playerBetsThisRound.clear();
    coreEventBus.emit("round_finished", {
      roomId: this.roundState.room.room_id,
      results: this.lastResults,
      event_log: this.eventLog.toJSON(),
    });
  }

  /**
   * v2.1: 检查断线超时并自动弃牌
   */
  public checkDisconnectTimeout(timeoutMs: number = 5 * 60 * 1000): Array<{ userId: string; seatIndex: number }> {
    if (this.roundState.phase === "WAITING" || this.roundState.phase === "FINISHED") {
      return [];
    }

    const folded = this.seatManager.checkDisconnectTimeout(timeoutMs);

    if (folded.length > 0) {
      folded.forEach((f) => {
        this.eventLog.logAutoFold(f.userId, f.seatIndex, "disconnect_timeout");
      });
      coreEventBus.emit("auto_fold", {
        roomId: this.roundState.room.room_id,
        foldedPlayers: folded,
      });
    }

    return folded;
  }

  public onPlayerDisconnect(userId: string): void {
    this.seatManager.markDisconnected(userId);
    this.eventLog.logDisconnect(userId);
    coreEventBus.emit("player_disconnected", {
      roomId: this.roundState.room.room_id,
      userId,
    });
  }

  public onPlayerReconnect(userId: string): void {
    this.seatManager.markReconnected(userId);
    this.eventLog.logReconnect(userId);
    coreEventBus.emit("player_reconnected", {
      roomId: this.roundState.room.room_id,
      userId,
    });
  }

  /** 获取当前倒计时状态（�?WS 层快照推送） */
  public getTurnTimerState() {
    return this.turnTimer.getState();
  }

  private transitionTo(newPhase: RoundPhase): void {
    const prevPhase = this.roundState.phase;
    this.roundState.phase = newPhase;
    this.eventLog.logPhase(prevPhase, newPhase);
    coreEventBus.emit("phase_changed", {
      roomId: this.roundState.room.room_id,
      prevPhase,
      newPhase,
    });
  }
}

/**
 * 平台核心状态机 (Core Game State Machine)
 * 管理牌局生命周期：WAITING -> DEALING -> ACTION/BETTING -> SHOWDOWN -> SETTLING -> FINISHED
 * 资金流闭环：玩家下注(bet) → 结算(game_settle) → 异常退款(refund)
 */

import { GamePlugin, PluginRoundState } from "../games/plugin.interface.js";
import { GameAction, GameRoom, GameSettleRequest, PlayerNetResult, RoundPhase } from "../shared/types.js";
import { SeatManager } from "./seatManager.js";
import { coreEventBus } from "./eventBus.js";
import { walletClient, WalletClient } from "../bridge/walletClient.js";

export class GameStateMachine {
  public roundState: PluginRoundState;
  public plugin: GamePlugin;
  public seatManager: SeatManager;
  public lastResults: PlayerNetResult[] = [];

  /** 本局每个玩家已下注总额（用于异常退款） */
  private playerBetsThisRound: Map<string, number> = new Map();

  /** 当前轮次编号（用于生成 bet transaction_id） */
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
      betting_round_count: 0
    };
  }

  public getPhase(): RoundPhase {
    return this.roundState.phase;
  }

  public canStart(): boolean {
    const readyCount = this.seatManager.getActivePlayersCount();
    return readyCount >= this.roundState.room.min_players_to_start;
  }

  public startRound(): boolean {
    if (!this.canStart()) return false;

    this.seatManager.resetRoundState();
    this.roundState.deck = this.plugin.initDeck();
    this.roundState.community_cards = [];
    this.roundState.total_pot = 0;
    this.roundState.current_highest_bet = 0;
    this.roundState.min_call_amount = this.roundState.room.base_score;
    this.roundState.betting_round_count = 0;
    this.lastResults = [];
    this.playerBetsThisRound.clear();
    this.currentRoundNumber++;

    this.transitionTo("DEALING");
    this.plugin.dealCards(this.roundState);

    // 发牌后处理小盲/大盲的下注（自动 bet）
    this.processBlindBets();

    const nextPhase = this.plugin.getNextPhase(this.roundState);
    this.transitionTo(nextPhase);
    return true;
  }

  /**
   * 处理小盲/大盲自动下注
   * 德州扑克发牌后自动扣 SB/BB，需要同步调用 wallet-service/bet
   */
  private async processBlindBets(): Promise<void> {
    const activeSeats = this.roundState.seats.filter(
      (s) => s.status === "playing" || s.status === "ready"
    );
    if (activeSeats.length < 2) return;

    // SB = activeSeats[0], BB = activeSeats[1]
    const sbSeat = activeSeats[0];
    const bbSeat = activeSeats[1];

    if (sbSeat.user_id && sbSeat.current_bet > 0) {
      await this.recordPlayerBet(sbSeat.user_id, sbSeat.current_bet);
    }
    if (bbSeat.user_id && bbSeat.current_bet > 0) {
      await this.recordPlayerBet(bbSeat.user_id, bbSeat.current_bet);
    }
  }

  /**
   * 记录玩家下注并调用 wallet-service/bet
   * @param userId 玩家 ID
   * @param amount 本次下注金额（增量）
   */
  public async recordPlayerBet(userId: string, amount: number): Promise<boolean> {
    if (amount <= 0) return true;

    // 累计本局下注总额
    const previous = this.playerBetsThisRound.get(userId) || 0;
    this.playerBetsThisRound.set(userId, previous + amount);

    // 调用 wallet-service 扣款
    const txId = walletClient.generateBetTxId(
      this.roundState.room.room_id,
      userId,
      this.currentRoundNumber
    );

    try {
      const res = await walletClient.betChips({
        transaction_id: txId,
        room_id: this.roundState.room.room_id,
        user_id: userId,
        amount,
        remark: `Round ${this.currentRoundNumber} bet`
      });
      console.log(`[Bet] ${userId} bet ${amount} → room ${this.roundState.room.room_id}`);
      return true;
    } catch (err: any) {
      console.error(`[Bet Failed] ${userId} bet ${amount}:`, err.message);
      // 下注失败，回滚累计
      this.playerBetsThisRound.set(userId, previous);
      return false;
    }
  }

  public handleAction(action: GameAction): { success: boolean; error?: string } {
    // 记录执行前玩家的 current_bet
    const seat = this.roundState.seats.find((s) => s.user_id === action.user_id);
    const oldCurrentBet = seat?.current_bet || 0;

    const result = this.plugin.handleAction(this.roundState, action);
    if (!result.success) return result;

    // 如果是下注类动作，计算增量并调用 wallet-service/bet
    const betActions = ["bet", "call", "raise", "all_in"];
    if (betActions.includes(action.action_type) && seat) {
      const newCurrentBet = seat.current_bet;
      const delta = newCurrentBet - oldCurrentBet;

      if (delta > 0) {
        // 异步调用 bet（不阻塞动作路由，失败进补偿队列）
        this.recordPlayerBet(action.user_id, delta).catch((err) => {
          console.error(`[Bet Async Failed]`, err);
        });
      }
    }

    coreEventBus.emit("action_executed", {
      roomId: this.roundState.room.room_id,
      action,
      phase: this.roundState.phase
    });

    if (this.plugin.isPhaseComplete(this.roundState)) {
      const nextPhase = this.plugin.getNextPhase(this.roundState);
      this.transitionTo(nextPhase);

      if (this.roundState.phase === "SHOWDOWN") {
        this.lastResults = this.plugin.calculateNetScores(this.roundState);
        this.transitionTo("SETTLING");
      }
    }
    return { success: true };
  }

  public forceShowdown(): PlayerNetResult[] {
    this.transitionTo("SHOWDOWN");
    this.lastResults = this.plugin.calculateNetScores(this.roundState);
    this.transitionTo("SETTLING");
    return this.lastResults;
  }

  /**
   * 执行微服务原子结算 (POST /api/wallet/game_settle)
   * 从牌桌虚拟钱包扣款，分给赢家 + 平台 + 代理
   */
  public async settleRound(client: WalletClient = walletClient): Promise<{
    request: GameSettleRequest;
    response: any;
  }> {
    if (this.roundState.phase !== "SETTLING" && this.roundState.phase !== "SHOWDOWN") {
      this.forceShowdown();
    } else if (this.lastResults.length === 0) {
      this.lastResults = this.plugin.calculateNetScores(this.roundState);
    }

    const roomId = this.roundState.room.room_id;
    const totalPot = this.roundState.total_pot > 0
      ? this.roundState.total_pot
      : this.roundState.room.base_score * 4;

    // 从净输赢结果提取赢家 (net_amount > 0)
    const winnerIds = this.lastResults
      .filter(r => r.net_amount > 0)
      .map(r => r.user_id);

    if (winnerIds.length === 0) {
      throw new Error("No winners found in settlement results.");
    }

    const txId = client.generateSettleTxId(roomId);
    const settlePayload: GameSettleRequest = {
      transaction_id: txId,
      room_id: roomId,
      total_pot: totalPot,
      winner_ids: winnerIds,
      platform_fee_rate: this.roundState.room.platform_fee_rate,
      agent_commission_rate: this.roundState.room.agent_commission_rate,
      agent_ids: this.roundState.room.agent_ids
    };

    const settleRes = await client.settleGame(settlePayload);
    this.finishSettlement();

    return {
      request: settlePayload,
      response: settleRes
    };
  }

  /**
   * 异常退款：玩家中途退出 / 房间解散 / 游戏中断
   * 从牌桌虚拟钱包退还给玩家本局已下注但未结算的筹码
   */
  public async refundOnAbort(
    reason: string = "aborted",
    client: WalletClient = walletClient
  ): Promise<{ refunds: Array<{ user_id: string; amount: number }>; response: any }> {
    const roomId = this.roundState.room.room_id;
    const refunds: Array<{ user_id: string; amount: number }> = [];

    // 遍历本局所有有下注记录的玩家
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
      remark: `Abnormal refund: ${reason}`
    };

    const refundRes = await client.refundChips(refundPayload);

    // 清空下注记录
    this.playerBetsThisRound.clear();
    this.transitionTo("WAITING");

    return { refunds, response: refundRes };
  }

  /** 获取本局某玩家已下注总额 */
  public getPlayerBetTotal(userId: string): number {
    return this.playerBetsThisRound.get(userId) || 0;
  }

  /** 获取本局所有玩家下注总额 */
  public getAllPlayerBets(): Map<string, number> {
    return new Map(this.playerBetsThisRound);
  }

  public finishSettlement(): void {
    this.transitionTo("FINISHED");
    this.roundState.phase = "WAITING";
    this.playerBetsThisRound.clear();
    coreEventBus.emit("round_finished", {
      roomId: this.roundState.room.room_id,
      results: this.lastResults
    });
  }

  /**
   * v2.1: 检查断线超时并自动弃牌
   * 应该在每局开始前或定期调用
   * @param timeoutMs 超时时间，默认 5 分钟
   * @returns 自动弃牌的玩家列表
   */
  public checkDisconnectTimeout(timeoutMs: number = 5 * 60 * 1000): Array<{ userId: string; seatIndex: number }> {
    // 只在游戏进行中检查
    if (this.roundState.phase === "WAITING" || this.roundState.phase === "FINISHED") {
      return [];
    }

    const folded = this.seatManager.checkDisconnectTimeout(timeoutMs);

    if (folded.length > 0) {
      coreEventBus.emit("auto_fold", {
        roomId: this.roundState.room.room_id,
        foldedPlayers: folded
      });
    }

    return folded;
  }

  /**
   * v2.1: 玩家断线时调用
   */
  public onPlayerDisconnect(userId: string): void {
    this.seatManager.markDisconnected(userId);
    coreEventBus.emit("player_disconnected", {
      roomId: this.roundState.room.room_id,
      userId
    });
  }

  /**
   * v2.1: 玩家重连时调用
   */
  public onPlayerReconnect(userId: string): void {
    this.seatManager.markReconnected(userId);
    coreEventBus.emit("player_reconnected", {
      roomId: this.roundState.room.room_id,
      userId
    });
  }

  private transitionTo(newPhase: RoundPhase): void {
    const prevPhase = this.roundState.phase;
    this.roundState.phase = newPhase;
    coreEventBus.emit("phase_changed", {
      roomId: this.roundState.room.room_id,
      prevPhase,
      newPhase
    });
  }
}

/**
 * 平台核心状态机 (Core Game State Machine)
 * 严格管理牌局生命周期：
 * WAITING -> DEALING -> ACTION/BETTING -> SHOWDOWN -> SETTLING -> FINISHED
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

  /**
   * 启动新一局
   */
  public startRound(): boolean {
    if (!this.canStart()) return false;

    // 重置状态
    this.seatManager.resetRoundState();
    this.roundState.deck = this.plugin.initDeck();
    this.roundState.community_cards = [];
    this.roundState.total_pot = 0;
    this.roundState.current_highest_bet = 0;
    this.roundState.min_call_amount = this.roundState.room.base_score;
    this.roundState.betting_round_count = 0;
    this.lastResults = [];

    this.transitionTo("DEALING");
    this.plugin.dealCards(this.roundState);

    // 发牌完毕后推进到下一阶段
    const nextPhase = this.plugin.getNextPhase(this.roundState);
    this.transitionTo(nextPhase);

    return true;
  }

  /**
   * 处理玩家输入动作
   */
  public handleAction(action: GameAction): { success: boolean; error?: string } {
    const result = this.plugin.handleAction(this.roundState, action);
    if (!result.success) return result;

    coreEventBus.emit("action_executed", {
      roomId: this.roundState.room.room_id,
      action,
      phase: this.roundState.phase
    });

    // 检查本阶段是否完成
    if (this.plugin.isPhaseComplete(this.roundState)) {
      const nextPhase = this.plugin.getNextPhase(this.roundState);
      this.transitionTo(nextPhase);

      // 若跃迁到 SHOWDOWN，自动算分
      if (this.roundState.phase === "SHOWDOWN") {
        this.lastResults = this.plugin.calculateNetScores(this.roundState);
        this.transitionTo("SETTLING");
      }
    }

    return { success: true };
  }

  /**
   * 强制推进到比牌结算 (方便演示或超时触发)
   */
  public forceShowdown(): PlayerNetResult[] {
    this.transitionTo("SHOWDOWN");
    this.lastResults = this.plugin.calculateNetScores(this.roundState);
    this.transitionTo("SETTLING");
    return this.lastResults;
  }

  /**
   * 执行微服务原子结算 (POST /api/wallet/game_settle)
   * 核心原则：游戏引擎只管规则与净输赢，不碰筹码。
   * 钱包服务负责移动筹码 + 调用 commission-service 分佣。
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

    const txId = client.generateRoundTxId(roomId);
    const settlePayload: GameSettleRequest = {
      transaction_id: txId,
      game_type: this.roundState.room.game_type,
      room_id: roomId,
      total_pot: totalPot,
      platform_fee_rate: this.roundState.room.platform_fee_rate,
      agent_commission_rate: this.roundState.room.agent_commission_rate,
      agent_ids: this.roundState.room.agent_ids,
      player_results: this.lastResults
    };

    const settleRes = await client.settleGame(settlePayload);
    this.finishSettlement();

    return {
      request: settlePayload,
      response: settleRes
    };
  }

  /**
   * 完成结算切回 WAITING
   */
  public finishSettlement(): void {
    this.transitionTo("FINISHED");
    this.roundState.phase = "WAITING";
    coreEventBus.emit("round_finished", {
      roomId: this.roundState.room.room_id,
      results: this.lastResults
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

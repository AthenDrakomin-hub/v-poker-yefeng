/**
 * 德州扑克状态机 (gameStateMachine.ts) 结算节点挂载示范
 * 展示开源德扑游戏在 Showdown / Winner Determination 环节如何无缝接入 wallet-service
 */
import { settlementBridge } from "./settlementClient.js";

export interface GameState {
  roomId: string;
  handNumber: number;
  pot: number;
  activePlayers: Array<{ id: string; name: string }>;
  winners: Array<{ id: string; handRank: string }>;
  roomAgentId?: string;
}

/**
 * 当一局德州扑克进入 SHOWDOWN 并完成比牌后触发
 */
export async function onHandComplete(state: GameState) {
  console.log(`[GameStateMachine] Hand #${state.handNumber} finished in room ${state.roomId}. Pot: ${state.pot}`);

  // 1. 提取赢家列表
  const winnersPayload = state.winners.map((w) => ({
    userId: w.id,
    weight: 1 // 平分底池
  }));

  // 2. 调用钱包微服务进行扣水分账
  try {
    const settleResult = await settlementBridge.settleHand(state.handNumber, {
      roomId: state.roomId,
      totalPot: state.pot,
      playerCount: state.activePlayers.length,
      winners: winnersPayload,
      platformFeeRate: 0.05, // 抽水 5%
      agentCommissionRate: 0.03, // 代理返佣 3%
      roomAgentId: state.roomAgentId || "agt_room_03"
    });

    console.log(
      `[GameStateMachine] Settlement succeeded! Tx: ${settleResult.transactionId}, ` +
      `Payout to winners: ${settleResult.winnersPayout}, Platform rake: ${settleResult.totalRake}`
    );

    // 3. 广播给前端客户端
    return {
      success: true,
      settleResult
    };
  } catch (error) {
    console.error(`[GameStateMachine] FAILED to settle hand #${state.handNumber}:`, error);
    // 触发牌桌异常保护逻辑
    return {
      success: false,
      error
    };
  }
}

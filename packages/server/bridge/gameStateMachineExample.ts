/**
 * 德州扑克状态机结算节点挂载示范
 * 在 Showdown / Winner Determination 环节接入 wallet-service
 */
import { settlementBridge } from "./settlementClient.js";

export interface GameState {
  room_id: string;
  hand_number: number;
  total_pot: number;
  winner_ids: string[];
  agent_ids?: string[];
  platform_fee_rate?: number;
  agent_commission_rate?: number;
}

/**
 * 当一局德州扑克进入 SHOWDOWN 并完成比牌后触发
 */
export async function onHandComplete(state: GameState) {
  console.log(`[GameStateMachine] Hand #${state.hand_number} finished in room ${state.room_id}. Pot: ${state.total_pot}`);

  try {
    const settleResult = await settlementBridge.settleHand(state.hand_number, {
      room_id: state.room_id,
      total_pot: state.total_pot,
      winner_ids: state.winner_ids,
      platform_fee_rate: state.platform_fee_rate ?? 0.05,
      agent_commission_rate: state.agent_commission_rate ?? 0.03,
      agent_ids: state.agent_ids
    });

    console.log(
      `[GameStateMachine] Settlement succeeded! Tx: ${settleResult.transaction_id}, ` +
      `Payout: ${settleResult.winners_payout}, Rake: ${settleResult.total_rake}`
    );

    return { success: true, settleResult };
  } catch (error) {
    console.error(`[GameStateMachine] FAILED to settle hand #${state.hand_number}:`, error);
    return { success: false, error };
  }
}

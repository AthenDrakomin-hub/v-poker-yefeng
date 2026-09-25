/**
 * 插件基类：提供默认实现，子类只需覆盖游戏特定逻辑
 * 默认validateAction：所有动作都合法（子类可覆盖）
 * 默认getPhaseTimeout：30s
 */
import { Card, GameAction, GameMode, GameType, PlayerNetResult, RoundPhase, Seat } from "../../shared/types.js";
import {
  ActionValidation, CompareResult, GamePlugin, HandEvaluation,
  PluginMeta, PluginRoundState,
} from "../plugin.interface.js";

export abstract class BasePlugin implements GamePlugin {
  abstract readonly game_type: GameType;
  abstract readonly name: string;
  abstract readonly supported_modes: GameMode[];
  abstract readonly meta: PluginMeta;

  abstract initDeck(): Card[];
  abstract dealCards(state: PluginRoundState): void;
  abstract handleAction(state: PluginRoundState, action: GameAction): { success: boolean; error?: string };
  abstract evaluateHand(cards: Card[], communityCards?: Card[]): HandEvaluation;
  abstract compareHands(state: PluginRoundState): CompareResult;
  abstract calculateNetScores(state: PluginRoundState): PlayerNetResult[];
  abstract isPhaseComplete(state: PluginRoundState): boolean;
  abstract getActionSeats(state: PluginRoundState): Seat[];
  abstract getNextPhase(state: PluginRoundState): RoundPhase;

  /** 默认：所有动作合法，子类可覆盖 */
  validateAction(_state: PluginRoundState, _seat: Seat, _action: GameAction): ActionValidation {
    return { valid: true };
  }

  /** 默认：所有阶段30s，子类可覆盖 */
  getPhaseTimeout(_phase: RoundPhase): number {
    return 30_000;
  }
}

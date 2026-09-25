/**
 * 插件加载校验器
 * 注册插件时自动检查：
 * 1. 所有必填方法存在
 * 2. meta字段完整
 * 3. game_type与meta.gameId一致
 * 缺失即抛异常，拒绝加载
 */
import { GamePlugin, PluginMeta } from "./plugin.interface.js";

const REQUIRED_METHODS = [
  "initDeck",
  "dealCards",
  "handleAction",
  "validateAction",
  "evaluateHand",
  "compareHands",
  "calculateNetScores",
  "isPhaseComplete",
  "getActionSeats",
  "getNextPhase",
];

const REQUIRED_META_FIELDS: (keyof PluginMeta)[] = [
  "gameId", "name", "cardCount", "supportSidePot",
  "exchangeBased", "minPlayers", "maxSeats",
];

export class PluginValidationError extends Error {
  constructor(gameId: string, public errors: string[]) {
    super(`插件 '${gameId}' 校验失败：\n  - ${errors.join("\n  - ")}`);
    this.name = "PluginValidationError";
  }
}

export function validatePlugin(plugin: GamePlugin): void {
  const errors: string[] = [];
  const gameId = (plugin as any).game_type || (plugin.meta?.gameId || "unknown");

  // 1. 检查必填方法
  for (const method of REQUIRED_METHODS) {
    if (typeof (plugin as any)[method] !== "function") {
      errors.push(`缺少方法: ${method}()`);
    }
  }

  // 2. 检查meta
  if (!plugin.meta) {
    errors.push("缺少 meta 对象");
  } else {
    for (const field of REQUIRED_META_FIELDS) {
      if (plugin.meta[field] === undefined) {
        errors.push(`meta 缺少字段: ${field}`);
      }
    }
    // game_type 与 meta.gameId 一致性
    if (plugin.game_type && plugin.meta.gameId && plugin.game_type !== plugin.meta.gameId) {
      errors.push(`game_type(${plugin.game_type}) 与 meta.gameId(${plugin.meta.gameId}) 不一致`);
    }
  }

  // 3. 检查supported_modes
  if (!Array.isArray(plugin.supported_modes) || plugin.supported_modes.length === 0) {
    errors.push("supported_modes 为空");
  }

  if (errors.length > 0) {
    throw new PluginValidationError(gameId, errors);
  }

  console.log(`[PluginValidator] ✓ ${plugin.meta?.name || gameId} 加载成功 (${REQUIRED_METHODS.length}个方法, cardCount=${plugin.meta?.cardCount})`);
}

/**
 * 微服务内部鉴权工具
 *
 * game-engine 的 /api/* 与 wallet-service 的 /api/wallet/mint 均要求请求头
 * `X-Internal-Auth-Key`。BFF 作为聚合层转发时必须携带该头。
 * （此前遗漏，导致 BFF → game-engine / wallet 的转发在真实环境返回 401）
 */
export const INTERNAL_AUTH_KEY = process.env.INTERNAL_AUTH_KEY || "change-me-in-prod";

/** 构造带内部鉴权头的 headers，可附加其它头 */
export function internalHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "X-Internal-Auth-Key": INTERNAL_AUTH_KEY, ...extra };
}

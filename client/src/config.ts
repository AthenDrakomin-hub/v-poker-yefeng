/**
 * 后端服务配置
 * 生产环境: 修改为实际服务器地址
 * 开发环境: 本地 localhost
 */

const isDev = import.meta.env.DEV;

export const config = {
  // BFF 聚合层
  bffUrl: isDev ? "http://localhost:4000" : "http://45.197.12.218:4000",

  // 游戏引擎 WebSocket
  gameEngineWs: isDev ? "ws://localhost:8003" : "ws://45.197.12.218:8003",

  // 游戏引擎 HTTP
  gameEngineHttp: isDev ? "http://localhost:8003" : "http://45.197.12.218:8003",
};

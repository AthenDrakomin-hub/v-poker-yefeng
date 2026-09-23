/**
 * API 客户端：封装 BFF 请求，自动带 JWT Token
 */
import { config } from "../config";

const TOKEN_KEY = "poker_jwt_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${config.bffUrl}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (data.code !== 0) {
    throw new Error(data.message || "Request failed");
  }

  return data.data;
}

export const api = {
  // 认证
  login: (username: string, password: string) =>
    request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    }),

  // 钱包
  getBalance: (userId: string) =>
    request(`/api/wallet/balance/${userId}`),

  getTransactions: (userId: string) =>
    request(`/api/wallet/transactions/${userId}`),

  transfer: (fromUserId: string, toUserId: string, amount: number) =>
    request("/api/wallet/transfer", {
      method: "POST",
      body: JSON.stringify({
        transaction_id: `tx_transfer_${Date.now()}`,
        from_user_id: fromUserId,
        to_user_id: toUserId,
        amount,
      }),
    }),

  // 房间
  getRooms: () =>
    request("/api/admin/rooms"),

  // 代理
  getAgentDashboard: () =>
    request("/api/agent/dashboard"),

  // 管理
  getOverview: () =>
    request("/api/admin/overview"),

  getAudit: () =>
    request("/api/admin/audit"),
};

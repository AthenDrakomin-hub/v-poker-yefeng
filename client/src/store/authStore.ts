/**
 * 认证状态 Store (Zustand)
 * 统一管理：token、userId、用户资料、余额
 * 替代散落各处的 localStorage.getItem('vp_user_id')
 */

import { create } from "zustand";
import { getToken, setToken, clearToken, api } from "../api/client";

interface AuthState {
  token: string | null;
  userId: string;
  username: string;
  balance: number;
  isLoggedIn: boolean;

  // actions
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  setBalance: (balance: number) => void;
  refreshBalance: () => Promise<void>;
  hydrate: () => void; // 页面刷新时从 localStorage 恢复
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  userId: "",
  username: "",
  balance: 0,
  isLoggedIn: false,

  login: async (username, password) => {
    const data = await api.login(username, password);
    const token = (data as { token: string; user_id: string; username: string }).token;
    const userId = (data as { token: string; user_id: string; username: string }).user_id;

    setToken(token);
    localStorage.setItem("vp_user_id", userId);
    localStorage.setItem("vp_username", username);

    set({
      token,
      userId,
      username,
      isLoggedIn: true,
    });

    // 登录后拉余额
    get().refreshBalance();
  },

  logout: () => {
    clearToken();
    localStorage.removeItem("vp_user_id");
    localStorage.removeItem("vp_username");
    set({
      token: null,
      userId: "",
      username: "",
      balance: 0,
      isLoggedIn: false,
    });
  },

  setBalance: (balance) => set({ balance }),

  refreshBalance: async () => {
    const { userId } = get();
    if (!userId) return;
    try {
      const data = await api.getBalance(userId);
      set({ balance: (data as { balance: number }).balance });
    } catch (err) {
      console.error("Failed to refresh balance:", err);
    }
  },

  hydrate: () => {
    const token = getToken();
    const userId = localStorage.getItem("vp_user_id") || "";
    const username = localStorage.getItem("vp_username") || "";
    set({ token, userId, username, isLoggedIn: !!token && !!userId });
  },
}));

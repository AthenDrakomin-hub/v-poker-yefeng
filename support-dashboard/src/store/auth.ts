import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * V-POKER 统一认证 Store
 * 所有前端站点共享同一套认证状态管理
 */

interface User {
  user_id: string
  username: string
  role: 'admin' | 'support' | 'agent' | 'player'
  balance?: number
}

interface AuthState {
  token: string | null
  user: User | null
  isAuthenticated: boolean
  login: (token: string, user: User) => void
  logout: () => void
  updateUser: (user: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,

      login: (token, user) => set({
        token,
        user,
        isAuthenticated: true,
      }),

      logout: () => set({
        token: null,
        user: null,
        isAuthenticated: false,
      }),

      updateUser: (userData) => set((state) => ({
        user: state.user ? { ...state.user, ...userData } : null,
      })),
    }),
    {
      name: 'vpoker-auth', // localStorage key
    }
  )
)

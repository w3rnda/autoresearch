import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      // Accepts flat shape { user, accessToken, refreshToken } from backend
      // or nested { user, tokens: { accessToken, refreshToken } } for flexibility
      login: ({ user, accessToken, refreshToken, tokens }) => set({
        user,
        accessToken: accessToken ?? tokens?.accessToken,
        refreshToken: refreshToken ?? tokens?.refreshToken,
        isAuthenticated: true,
      }),

      logout: () => set({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      }),

      updateTokens: (tokens) => set({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      }),

      updateUser: (user) => set({ user }),
    }),
    {
      name: 'leadflow-auth',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)

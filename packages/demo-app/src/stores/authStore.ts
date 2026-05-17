import { type AuthSession, getCurrentUser, type JwtClaims } from "@DarkAuth/client";
import { create } from "zustand";

interface AuthStore {
  session: AuthSession | null;
  user: JwtClaims | null;
  isAuthenticated: boolean;
  setSession: (session: AuthSession | null) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  session: null,
  user: null,
  isAuthenticated: false,

  setSession: (session) => {
    const user = session ? getCurrentUser() : null;
    set({
      session,
      user,
      isAuthenticated: !!session,
    });
  },

  clearSession: () => {
    sessionStorage.removeItem("id_token");
    sessionStorage.removeItem("drk_b64");
    localStorage.removeItem("id_token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("drk_protected");
    localStorage.removeItem("refresh_token");
    set({
      session: null,
      user: null,
      isAuthenticated: false,
    });
  },
}));

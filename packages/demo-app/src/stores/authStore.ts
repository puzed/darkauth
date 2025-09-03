import { create } from "zustand";
import { AuthSession, JwtClaims, getCurrentUser } from "@DarkAuth/client";

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
    localStorage.removeItem("refresh_token");
    set({
      session: null,
      user: null,
      isAuthenticated: false,
    });
  },
}));

import { logger } from "./logger";

interface StoredSession {
  adminId: string;
  name?: string;
  email?: string;
  role: "read" | "write";
  timestamp: number;
  sessionKey?: string;
  exportKey?: string;
  otpRequired?: boolean;
  otpVerified?: boolean;
}

interface StoredLoginInfo {
  email: string;
  timestamp: number;
}

const SESSION_STORAGE_KEY = "DarkAuth_admin_session";
const LOGIN_INFO_KEY = "DarkAuth_admin_login_info";
const SESSION_REFRESH_INTERVAL = 10 * 60 * 1000;

class AuthService {
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private visibilityChangeHandler: (() => void) | null = null;

  saveSession(sessionData: Omit<StoredSession, "timestamp">): void {
    const session: StoredSession = {
      ...sessionData,
      timestamp: Date.now(),
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  }

  saveLoginInfo(email: string): void {
    const loginInfo: StoredLoginInfo = {
      email,
      timestamp: Date.now(),
    };
    localStorage.setItem(LOGIN_INFO_KEY, JSON.stringify(loginInfo));
  }

  getStoredLoginInfo(): StoredLoginInfo | null {
    try {
      const stored = localStorage.getItem(LOGIN_INFO_KEY);
      if (!stored) return null;

      const loginInfo = JSON.parse(stored) as StoredLoginInfo;

      // Keep login info for 30 days
      const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000;
      if (Date.now() - loginInfo.timestamp > thirtyDaysInMs) {
        localStorage.removeItem(LOGIN_INFO_KEY);
        return null;
      }

      return loginInfo;
    } catch {
      localStorage.removeItem(LOGIN_INFO_KEY);
      return null;
    }
  }

  getStoredSession(): StoredSession | null {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!stored) return null;

      const session = JSON.parse(stored) as StoredSession;

      // Check if stored session is older than 24 hours (reasonable upper limit)
      const dayInMs = 24 * 60 * 60 * 1000;
      if (Date.now() - session.timestamp > dayInMs) {
        this.clearSession();
        return null;
      }

      return session;
    } catch {
      this.clearSession();
      return null;
    }
  }

  clearSession(): void {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    this.stopSessionRefresh();
  }

  clearAll(): void {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(LOGIN_INFO_KEY);
    this.stopSessionRefresh();
  }

  startSessionRefresh(onRefresh: () => Promise<void>): void {
    this.stopSessionRefresh();

    // Set up periodic refresh
    this.refreshTimer = setInterval(async () => {
      try {
        await onRefresh();
      } catch (error) {
        logger.error(error, "Session refresh failed");
      }
    }, SESSION_REFRESH_INTERVAL);

    // Also refresh when the page becomes visible after being hidden
    const handleVisibilityChange = async () => {
      if (!document.hidden) {
        try {
          await onRefresh();
        } catch (error) {
          logger.error(error, "Session refresh on visibility change failed");
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    this.visibilityChangeHandler = handleVisibilityChange;
  }

  stopSessionRefresh(): void {
    if (this.visibilityChangeHandler) {
      document.removeEventListener("visibilitychange", this.visibilityChangeHandler);
      this.visibilityChangeHandler = null;
    }
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

export const authService = new AuthService();
export default authService;

const THEME_KEY = "DarkAuth_admin_theme";

type Theme = "system" | "light" | "dark";

const getStoredTheme = (): Theme => {
  const v = localStorage.getItem(THEME_KEY);
  if (v === "light" || v === "dark" || v === "system") return v;
  return "system";
};

const systemPrefersDark = () =>
  window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;

const applyTheme = (t: Theme) => {
  const dark = t === "system" ? systemPrefersDark() : t === "dark";
  const el = document.documentElement;
  if (dark) el.classList.add("dark");
  else el.classList.remove("dark");
};

export const setTheme = (t: Theme) => {
  localStorage.setItem(THEME_KEY, t);
  applyTheme(t);
};

export const getTheme = getStoredTheme;

export const initTheme = () => {
  applyTheme(getStoredTheme());
  const m = window.matchMedia?.("(prefers-color-scheme: dark)");
  if (m && typeof m.addEventListener === "function") {
    const onChange = () => {
      if (getStoredTheme() === "system") applyTheme("system");
    };
    m.addEventListener("change", onChange);
  }
};

export const cycleTheme = (): Theme => {
  const current = getStoredTheme();
  const next: Theme = current === "system" ? "dark" : current === "dark" ? "light" : "system";
  setTheme(next);
  return next;
};

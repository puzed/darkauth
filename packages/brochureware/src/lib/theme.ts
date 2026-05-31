export type Theme = "dark" | "light";

export const THEME_CHANGED_EVENT = "darkauth-theme-change";

export const getCurrentTheme = (): Theme => document.documentElement.dataset.theme === "light" ? "light" : "dark";

export const setCurrentTheme = (theme: Theme) => {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("darkauth-theme", theme);
  window.dispatchEvent(new CustomEvent<Theme>(THEME_CHANGED_EVENT, { detail: theme }));
};

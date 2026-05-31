import { useEffect, useState } from "react";
import { getCurrentTheme, setCurrentTheme, type Theme } from "../lib/theme";
import styles from "./ThemeToggle.module.css";

export default function ThemeToggle() {
  const [theme, setThemeState] = useState<Theme>(getCurrentTheme);

  useEffect(() => {
    const nextTheme = getCurrentTheme();
    setThemeState(nextTheme);
  }, []);

  const updateTheme = (nextTheme: Theme) => {
    setCurrentTheme(nextTheme);
    setThemeState(nextTheme);
  };

  const nextTheme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={() => updateTheme(nextTheme)}
      aria-label={`Switch to ${nextTheme} mode`}
      title={`Switch to ${nextTheme} mode`}
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a7 7 0 1 0 11 11Z" />
        </svg>
      )}
    </button>
  );
}

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { setTheme as applyThemeSetting, getTheme } from "@/lib/theme";
import styles from "../Login.module.css";

interface AuthFrameProps {
  title: string;
  description: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function AuthFrame({ title, description, children, footer }: AuthFrameProps) {
  const [mode, setMode] = useState<"light" | "dark">(() => {
    const theme = getTheme();
    if (theme === "system") {
      const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
      return prefersDark ? "dark" : "light";
    }
    return theme;
  });

  useEffect(() => {
    if (getTheme() !== "system") return;
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const handle = () => {
      const theme = getTheme();
      if (theme === "system") {
        const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
        setMode(prefersDark ? "dark" : "light");
      }
    };
    media?.addEventListener?.("change", handle);
    return () => media?.removeEventListener?.("change", handle);
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.themeToggle}>
          <button
            type="button"
            aria-label="Toggle theme"
            className={styles.themeToggleBtn}
            onClick={() => {
              const next = mode === "dark" ? "light" : "dark";
              setMode(next);
              applyThemeSetting(next);
            }}
            title={mode === "dark" ? "Dark" : "Light"}
          >
            {mode === "dark" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
        </div>
        <div className={styles.header}>
          <div className={styles.brandWrap}>
            <div className={styles.brand}>
              <img src="/favicon.svg" alt="DarkAuth" />
            </div>
          </div>
          <div className={styles.title}>{title}</div>
          <p className={styles.description}>{description}</p>
        </div>
        <div className={styles.content}>{children}</div>
        {footer && <div className={styles.footer}>{footer}</div>}
      </div>
    </div>
  );
}

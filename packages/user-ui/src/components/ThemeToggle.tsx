import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("daTheme");
  if (stored === "light" || stored === "dark") return stored;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  return prefersDark ? "dark" : "light";
}

function getEffectiveTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("daTheme");
  if (stored === "light" || stored === "dark") return stored;
  const attr = document.documentElement.getAttribute("data-da-theme");
  if (attr === "light" || attr === "dark") return attr;
  return getPreferredTheme();
}

function applyTheme(theme: Theme | null) {
  const root = document.documentElement;
  if (!theme) {
    root.removeAttribute("data-da-theme");
    return;
  }
  root.setAttribute("data-da-theme", theme);
}

type ThemedWindow = Window & { __setDaTheme?: (theme: Theme) => void };

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getEffectiveTheme());

  useEffect(() => {
    const stored = localStorage.getItem("daTheme");
    if (stored === "light" || stored === "dark") {
      applyTheme(stored as Theme);
      setTheme(stored as Theme);
    } else {
      const current = getEffectiveTheme();
      applyTheme(current);
      setTheme(current);
    }
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "daTheme") return;
      const v = e.newValue;
      if (v === "light" || v === "dark") {
        setTheme(v);
        applyTheme(v);
      }
    };
    window.addEventListener("storage", onStorage);
    const mo = new MutationObserver(() => {
      const storedNow = localStorage.getItem("daTheme");
      if (storedNow === "light" || storedNow === "dark") return;
      const attr = document.documentElement.getAttribute("data-da-theme");
      if (attr === "light" || attr === "dark") setTheme(attr);
    });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-da-theme"] });
    return () => {
      window.removeEventListener("storage", onStorage);
      mo.disconnect();
    };
  }, []);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    const w = window as ThemedWindow;
    if (w && typeof w.__setDaTheme === "function") {
      w.__setDaTheme(next);
    } else {
      localStorage.setItem("daTheme", next);
      applyTheme(next);
    }
  };

  return (
    <button
      type="button"
      className="theme-toggle-btn"
      onClick={toggle}
      aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
    >
      {theme === "light" ? (
        <Moon size={16} aria-hidden="true" />
      ) : (
        <Sun size={16} aria-hidden="true" />
      )}
    </button>
  );
}

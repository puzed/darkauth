import { useEffect, useState } from "react";

type Theme = "light" | "dark";

function getPreferredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const stored = localStorage.getItem("daTheme");
  if (stored === "light" || stored === "dark") return stored;
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? false;
  return prefersDark ? "dark" : "light";
}

function applyTheme(theme: Theme | null) {
  const root = document.documentElement;
  if (!theme) {
    root.removeAttribute("data-da-theme");
    return;
  }
  root.setAttribute("data-da-theme", theme);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme());

  useEffect(() => {
    const stored = localStorage.getItem("daTheme");
    if (stored === "light" || stored === "dark") {
      applyTheme(stored as Theme);
      setTheme(stored as Theme);
    } else {
      // Apply preferred theme
      const preferred = getPreferredTheme();
      applyTheme(preferred);
      setTheme(preferred);
    }
  }, []);

  const toggle = () => {
    const next: Theme = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("daTheme", next);
    applyTheme(next);
  };

  return (
    <button
      type="button"
      className="link-button da-button-link"
      onClick={toggle}
      style={{ minWidth: "50px" }}
    >
      {theme === "light" ? "Dark" : "Light"}
    </button>
  );
}

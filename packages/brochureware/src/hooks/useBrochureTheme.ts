import { useEffect, useState } from "react";
import { getCurrentTheme, THEME_CHANGED_EVENT, type Theme } from "../lib/theme";

export const useBrochureTheme = () => {
  const [theme, setTheme] = useState<Theme>(getCurrentTheme);

  useEffect(() => {
    const sync = () => setTheme(getCurrentTheme());
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.addEventListener(THEME_CHANGED_EVENT, sync);
    window.addEventListener("storage", sync);
    sync();
    return () => {
      observer.disconnect();
      window.removeEventListener(THEME_CHANGED_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return theme;
};

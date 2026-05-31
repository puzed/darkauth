import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { applyAdminBranding } from "./lib/branding";
import { initTheme } from "./lib/theme";

initTheme();
applyAdminBranding();
new MutationObserver(() => applyAdminBranding()).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["class"],
});
const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");
createRoot(rootEl).render(<App />);

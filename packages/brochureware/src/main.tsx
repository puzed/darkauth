import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { setCurrentTheme } from "./lib/theme";
import "./index.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("No root element");

const storedTheme = localStorage.getItem("darkauth-theme");
const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
const initialTheme = storedTheme === "light" || storedTheme === "dark"
  ? storedTheme
  : prefersLight
    ? "light"
    : "dark";

setCurrentTheme(initialTheme);
if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

createRoot(rootEl).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

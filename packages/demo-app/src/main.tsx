import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";
import { setConfig, setHooks } from "@DarkAuth/client";
import { api } from "./services/api";

type RuntimeConfig = { issuer?: string; clientId?: string; redirectUri?: string };
const appConfiguration =
  (window as unknown as { __APP_CONFIG__?: RuntimeConfig }).__APP_CONFIG__ || {};
setConfig({
  issuer: appConfiguration.issuer || "http://localhost:9080",
  clientId: appConfiguration.clientId || "app-web",
  redirectUri: appConfiguration.redirectUri || `${window.location.origin}/callback`,
});

setHooks({
  fetchNoteDek: (noteId: string) => api.getNoteDek(noteId),
  fetchWrappedEncPrivateJwk: () => api.getWrappedEncPrivateJwk(),
});

const rootEl = document.getElementById("app");
if (!rootEl) throw new Error("app root not found");
ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

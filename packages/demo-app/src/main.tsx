import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles/globals.css";
import { setConfig, setHooks } from "@DarkAuth/client";
import { api } from "./services/api";

const appCfg = (window as any).__APP_CONFIG__ || {};
setConfig({
  issuer: appCfg.issuer || "http://localhost:9080",
  clientId: appCfg.clientId || "app-web",
  redirectUri: appCfg.redirectUri || window.location.origin + "/callback",
});

setHooks({
  fetchNoteDek: (noteId: string) => api.getNoteDek(noteId),
  fetchWrappedEncPrivateJwk: () => api.getWrappedEncPrivateJwk(),
});

ReactDOM.createRoot(document.getElementById("app")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

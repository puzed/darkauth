import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  server: {
    port: 9092,
    proxy: {
      "/config.js": {
        target: "http://localhost:9094",
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    wasm(),
    topLevelAwait(),
    {
      name: "demo-app-config-fallback",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/config.js") {
            const payload = {
              issuer: "http://localhost:9080",
              clientId: "app-web",
              redirectUri: "http://localhost:9092/callback",
              demoApi: "http://localhost:9094",
            };
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/javascript; charset=utf-8");
            res.end(`window.__APP_CONFIG__=${JSON.stringify(payload)};`);
            return;
          }
          next();
        });
      },
    },
  ],
  define: {},
});

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import wasm from "vite-plugin-wasm";

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
    {
      name: "demo-app-config-fallback",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === "/config.js") {
            const payload = {
              issuer: "http://localhost:9080",
              clientId: "app-web",
              redirectUri: "http://localhost:9092/callback",
              demoApi: "http://localhost:9094",
            };
            response.statusCode = 200;
            response.setHeader("Content-Type", "application/javascript; charset=utf-8");
            response.end(`window.__APP_CONFIG__=${JSON.stringify(payload)};`);
            return;
          }
          next();
        });
      },
    },
  ],
  define: {},
});

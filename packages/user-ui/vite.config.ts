import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      crypto: new URL("./src/shims/empty.ts", import.meta.url).pathname,
    },
  },
  build: {},
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:9080",
        changeOrigin: true,
      },
      "/config.js": {
        target: "http://localhost:9080",
        changeOrigin: true,
      },
    },
  },
  define: {},
});

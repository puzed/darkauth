import { execSync } from "node:child_process";
import path, { resolve } from "node:path";
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

let COMMIT_HASH = process.env.COMMIT_HASH;
try {
  if (!COMMIT_HASH) COMMIT_HASH = execSync("git rev-parse --short HEAD").toString().trim();
} catch {}

export default defineConfig({
  server: {
    host: "::",
    port: 5174,
    proxy: {
      "/config.js": {
        target: "http://localhost:9081",
        changeOrigin: true,
      },
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      crypto: path.resolve(__dirname, "./src/shims/empty.ts"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        preview: resolve(__dirname, "branding/preview.html"),
      },
    },
  },
  define: {
    "import.meta.env.VITE_COMMIT_HASH": JSON.stringify(COMMIT_HASH || ""),
  },
});

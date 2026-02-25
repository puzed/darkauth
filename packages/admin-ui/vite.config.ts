import { execSync } from "node:child_process";
import fs from "node:fs";
import path, { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

let COMMIT_HASH = process.env.COMMIT_HASH;
try {
  if (!COMMIT_HASH) COMMIT_HASH = execSync("git rev-parse --short HEAD").toString().trim();
} catch {}

let APP_VERSION = process.env.APP_VERSION;
try {
  if (!APP_VERSION) {
    const rootPackageJsonPath = resolve(__dirname, "../../package.json");
    const rootPackageJson = JSON.parse(fs.readFileSync(rootPackageJsonPath, "utf8")) as {
      version?: string;
    };
    APP_VERSION = rootPackageJson.version || "";
  }
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
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(APP_VERSION || ""),
  },
});

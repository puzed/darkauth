import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path, { join } from "node:path";
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
  plugins: [
    react(),
    {
      name: "git-changelog-plugin",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === "/changelog.json") {
            const payload = buildChangelog();
            res.statusCode = 200;
            res.setHeader("Content-Type", "application/json");
            res.end(payload);
            return;
          }
          next();
        });
      },
      generateBundle() {
        const payload = buildChangelog();
        this.emitFile({ type: "asset", fileName: "changelog.json", source: payload });
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      crypto: path.resolve(__dirname, "./src/shims/empty.ts"),
    },
  },
  build: {},
  define: {
    "import.meta.env.VITE_COMMIT_HASH": JSON.stringify(COMMIT_HASH || ""),
  },
});

function buildChangelog() {
  try {
    const changelogDir = join(process.cwd(), "../../changelog");
    if (!existsSync(changelogDir))
      return JSON.stringify({ generatedAt: new Date().toISOString(), entries: [] }, null, 2);
    const files = readdirSync(changelogDir)
      .filter((f) => f.endsWith(".md"))
      .sort((a, b) => b.localeCompare(a));
    const entries = files.map((filename) => {
      const filePath = join(changelogDir, filename);
      const content = readFileSync(filePath, "utf8");
      const parts = content.split("---");
      if (parts.length < 2) return { date: "", title: "", changes: [], filename };
      const header = parts[0];
      const body = parts.slice(1).join("---").trim();
      let date = "";
      let title = "";
      const headerLines = header.split("\n");
      for (const line of headerLines) {
        if (line.startsWith("date: ")) date = line.replace("date: ", "").trim();
        else if (line.startsWith("title: ")) title = line.replace("title: ", "").trim();
      }
      const changes = body ? [body] : [];
      return { date, title, changes, filename };
    });
    return JSON.stringify({ generatedAt: new Date().toISOString(), entries }, null, 2);
  } catch (error) {
    console.error("Failed to build changelog:", error);
    return JSON.stringify({ generatedAt: new Date().toISOString(), entries: [] }, null, 2);
  }
}

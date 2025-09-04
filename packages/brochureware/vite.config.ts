import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path, { join } from "path";
import tailwind from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";
import { existsSync, readdirSync, readFileSync } from "fs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  css: {
    postcss: {
      plugins: [tailwind(), autoprefixer()],
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
    {
      name: "static-logos-plugin",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (!req.url) return next()
          if (req.url.startsWith("/logos/")) {
            const file = req.url.replace("/logos/", "");
            const logosDir = join(process.cwd(), "../../logos");
            const filePath = join(logosDir, file);
            try {
              const svg = readFileSync(filePath, "utf8");
              res.statusCode = 200;
              res.setHeader("Content-Type", file.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream");
              res.end(svg);
              return;
            } catch (e) { void e }
          }
          next();
        });
      },
      generateBundle() {
        try {
          const logosDir = join(process.cwd(), "../../logos");
          const svg = readFileSync(join(logosDir, "icon.svg"), "utf8");
          this.emitFile({ type: "asset", fileName: "logos/icon.svg", source: svg });
        } catch (e) { void e }
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));

function buildChangelog() {
  try {
    const changelogDir = join(process.cwd(), "../../changelog");
    if (!existsSync(changelogDir)) return JSON.stringify({ generatedAt: new Date().toISOString(), entries: [] }, null, 2);
    const files = readdirSync(changelogDir).filter((f) => f.endsWith(".md")).sort((a, b) => b.localeCompare(a));
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
  } catch {
    return JSON.stringify({ generatedAt: new Date().toISOString(), entries: [] }, null, 2);
  }
}

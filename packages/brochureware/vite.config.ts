import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path, { join } from "path";
import tailwind from "@tailwindcss/postcss";
import autoprefixer from "autoprefixer";
import { readFileSync } from "fs";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
  },
  css: {
    transformer: "postcss",
    postcss: {
      plugins: [tailwind(), autoprefixer()],
    },
  },
  build: {
    cssMinify: "esbuild",
  },
  plugins: [
    react(),
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

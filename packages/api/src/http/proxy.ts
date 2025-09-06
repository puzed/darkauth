import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
import type { Duplex } from "node:stream";

export async function proxyToVite(
  req: IncomingMessage,
  res: ServerResponse,
  vitePort: number
): Promise<void> {
  const explicitHost = process.env.VITE_HOST || process.env.PROXY_HOST;
  const inDocker = fs.existsSync("/.dockerenv");
  const hostname = explicitHost || (inDocker ? "host.docker.internal" : "localhost");
  const options = {
    hostname,
    port: vitePort,
    path: req.url,
    method: req.method,
    headers: req.headers,
  };

  const proxyReq = httpRequest(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
    proxyRes.pipe(res);
  });

  proxyReq.on("error", (error) => {
    console.error("Proxy error:", error);
    res.statusCode = 502;
    res.end("Bad Gateway - Vite dev server not running");
  });

  req.pipe(proxyReq);
}

export function proxyWebSocketToVite(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  vitePort: number
): void {
  const explicitHost = process.env.VITE_HOST || process.env.PROXY_HOST;
  const inDocker = fs.existsSync("/.dockerenv");
  const hostname = explicitHost || (inDocker ? "host.docker.internal" : "localhost");
  const headers = { ...req.headers } as Record<string, string | string[] | undefined>;
  headers.host = `${hostname}:${vitePort}`;
  const options = {
    hostname,
    port: vitePort,
    path: req.url || "/",
    method: "GET",
    headers,
  };
  const proxyReq = httpRequest(options);
  proxyReq.on("upgrade", (proxyRes, proxySocket, proxyHead) => {
    const lines: string[] = [`HTTP/1.1 ${proxyRes.statusCode || 101} Switching Protocols`];
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (Array.isArray(v)) {
        for (const vv of v) lines.push(`${k}: ${vv}`);
      } else if (v !== undefined) {
        lines.push(`${k}: ${v}`);
      }
    }
    lines.push("\r\n");
    socket.write(lines.join("\r\n"));
    if (proxyHead?.length) proxySocket.unshift(proxyHead);
    if (head?.length) socket.unshift(head);
    proxySocket.pipe(socket);
    socket.pipe(proxySocket);
    const destroyBoth = () => {
      try {
        proxySocket.destroy();
      } catch {}
      try {
        socket.destroy();
      } catch {}
    };
    proxySocket.on("error", destroyBoth);
    socket.on("error", destroyBoth);
    proxySocket.on("end", () => socket.end());
    socket.on("end", () => proxySocket.end());
  });
  proxyReq.on("error", () => {
    try {
      socket.destroy();
    } catch {}
  });
  proxyReq.end();
}

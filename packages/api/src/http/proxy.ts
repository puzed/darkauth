import type { IncomingMessage, ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";

export async function proxyToVite(
  req: IncomingMessage,
  res: ServerResponse,
  vitePort: number
): Promise<void> {
  const options = {
    hostname: "localhost",
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

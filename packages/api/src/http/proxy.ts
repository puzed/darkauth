import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { request as httpRequest } from "node:http";
import type { Duplex } from "node:stream";

export async function proxyToVite(
  request: IncomingMessage,
  response: ServerResponse,
  vitePort: number
): Promise<void> {
  const inDocker = fs.existsSync("/.dockerenv");
  const hostname = inDocker ? "host.docker.internal" : "localhost";
  const headers = { ...request.headers } as Record<string, string | string[] | undefined>;
  headers.host = `${hostname}:${vitePort}`;
  const options = {
    hostname,
    port: vitePort,
    path: request.url,
    method: request.method,
    headers,
  };

  const proxyRequest = httpRequest(options, (proxyResponse) => {
    response.writeHead(proxyResponse.statusCode || 200, proxyResponse.headers);
    proxyResponse.pipe(response);
  });

  proxyRequest.on("error", (_error) => {
    response.statusCode = 502;
    response.end("Bad Gateway - Vite dev server not running");
  });

  request.pipe(proxyRequest);
}

export function proxyWebSocketToVite(
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  vitePort: number
): void {
  const inDocker = fs.existsSync("/.dockerenv");
  const hostname = inDocker ? "host.docker.internal" : "localhost";
  const headers = { ...request.headers } as Record<string, string | string[] | undefined>;
  headers.host = `${hostname}:${vitePort}`;
  const options = {
    hostname,
    port: vitePort,
    path: request.url || "/",
    method: "GET",
    headers,
  };
  const proxyRequest = httpRequest(options);
  proxyRequest.on("upgrade", (proxyResponse, proxySocket, proxyHead) => {
    const lines: string[] = [`HTTP/1.1 ${proxyResponse.statusCode || 101} Switching Protocols`];
    for (const [headerName, headerValue] of Object.entries(proxyResponse.headers)) {
      if (Array.isArray(headerValue)) {
        for (const value of headerValue) lines.push(`${headerName}: ${value}`);
      } else if (headerValue !== undefined) {
        lines.push(`${headerName}: ${headerValue}`);
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
  proxyRequest.on("error", () => {
    try {
      socket.destroy();
    } catch {}
  });
  proxyRequest.end();
}

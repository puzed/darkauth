import fs from "node:fs";
import net from "node:net";
import path from "node:path";

function readConfigText() {
  const candidates = [
    path.resolve(process.cwd(), "config.yaml"),
    path.resolve(process.cwd(), "..", "config.yaml"),
    path.resolve(process.cwd(), "..", "..", "config.yaml"),
    path.resolve(process.cwd(), "..", "..", "..", "config.yaml"),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return fs.readFileSync(candidate, "utf8");
  }
  return "";
}

function getNumberConfig(configText, key, fallback) {
  const match = configText.match(new RegExp(`(^|\\n)\\s*${key}\\s*:\\s*(\\d+)`, "m"));
  if (!match) return fallback;
  const parsed = Number(match[2]);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function checkPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (error) => {
      if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
        resolve(true);
        return;
      }
      resolve(true);
    });
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, "127.0.0.1");
  });
}

const configText = readConfigText();
const userPort = getNumberConfig(configText, "userPort", 9080);
const adminPort = getNumberConfig(configText, "adminPort", 9081);

const services = [
  { name: "User UI", port: 5173 },
  { name: "Admin UI", port: 5174 },
  { name: "DarkAuth API", port: userPort },
  { name: "DarkAuth Admin API", port: adminPort },
  { name: "Dark Notes UI", port: 9092 },
  { name: "Dark Notes API", port: 9094 },
];

process.stdout.write("\nDarkAuth dev services\n\n");
for (const service of services) {
  process.stdout.write(`- ${service.name}: http://localhost:${service.port}\n`);
}
process.stdout.write("\n");

const occupied = [];
for (const service of services) {
  const inUse = await checkPortInUse(service.port);
  if (inUse) occupied.push(service);
}

if (occupied.length > 0) {
  process.stderr.write("Ports already in use:\n");
  for (const service of occupied) {
    process.stderr.write(`- ${service.name}: ${service.port}\n`);
  }
  process.stderr.write("\nStop the existing process or change your configured ports before running dev.\n");
  process.exit(1);
}

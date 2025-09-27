import { createContext } from "./createContext";
import { createServer } from "./createServer";

async function main() {
  const context = await createContext();
  const serverApplication = createServer(context);
  if (process.env.DEMO_APP_AUTOSTART !== "0") await serverApplication.start();
}

main();

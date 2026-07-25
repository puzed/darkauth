import { loadConfig, loadSigningKey } from "./config.ts";
import { createDarkAuthMockServer } from "./server.ts";

const config = await loadConfig();
const signingKey = await loadSigningKey(config.keyPath);
const server = createDarkAuthMockServer(config, signingKey);

server.listen(config.port, config.host, () => {
  console.log(`darkauth-mock listening on ${config.issuer}`);
});

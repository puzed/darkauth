import { loadConfig, loadSigningKey } from "./config.ts";
import { createDarkAuthMockServer } from "./server.ts";

const config = await loadConfig();
const signingKey = await loadSigningKey(process.env.DARKAUTH_MOCK_CONFIG);
const server = createDarkAuthMockServer(config, signingKey);

server.listen(config.port, config.host, () => {
  console.log(`darkauth-mock listening on ${config.issuer}`);
});

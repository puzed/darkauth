import { loadSigningKey } from "./config.ts";

await loadSigningKey(process.env.DARKAUTH_MOCK_CONFIG);

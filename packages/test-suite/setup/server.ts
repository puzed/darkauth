import { createServer } from 'node:http';
import { createContext } from '@DarkAuth/api/src/context/createContext.ts';
import { createServer as createAppServer } from '@DarkAuth/api/src/createServer.ts';
import type { Context, Config } from '@DarkAuth/api/src/types.ts';
import { randomBytes } from 'node:crypto';

export interface TestServerConfig {
  testName: string;
  adminPort?: number;
  userPort?: number;
  installToken?: string;
}

export interface TestServers {
  adminServer: ReturnType<typeof createServer>;
  userServer: ReturnType<typeof createServer>;
  context: Context;
  getContext: () => Context;
  stop: () => Promise<void>;
  adminPort: number;
  userPort: number;
  adminUrl: string;
  userUrl: string;
}

async function getRandomPort(): Promise<number> {
  return new Promise((resolve) => {
    const server = createServer();
    server.listen(0, () => {
      const port = (server.address() as any)?.port;
      server.close(() => resolve(port));
    });
  });
}

export async function createTestServers(config: TestServerConfig): Promise<TestServers> {
  process.env.DARKAUTH_TEST_MODE = 'true';
  
  const adminPort = config.adminPort || await getRandomPort();
  const userPort = config.userPort || await getRandomPort();
  
  const configFile = `./test-data/${config.testName}-${randomBytes(4).toString('hex')}/config.yaml`;
  
  const contextConfig: Config = {
    dbMode: 'pglite',
    pgliteDir: `./test-data/${config.testName}-${randomBytes(4).toString('hex')}`,
    adminPort,
    userPort,
    proxyUi: false,
    kekPassphrase: 'test-passphrase-for-testing-only',
    isDevelopment: true,
    publicOrigin: `http://localhost:${userPort}`,
    issuer: `http://localhost:${userPort}`,
    rpId: 'localhost',
    insecureKeys: true,
    configFile,
    installToken: config.installToken || 'test-install-token',
    inInstallMode: true,
  };

  const context = await createContext(contextConfig);
  const app = await createAppServer(context);
  await app.start();
  const adminServer = app.adminServer;
  const userServer = app.userServer;

  return {
    adminServer,
    userServer,
    context,
    getContext: app.getContext,
    stop: app.stop,
    adminPort,
    userPort,
    adminUrl: `http://localhost:${adminPort}`,
    userUrl: `http://localhost:${userPort}`
  };
}

export async function destroyTestServers(servers: TestServers): Promise<void> {
  try {
    await withTimeout(servers.stop(), 5_000);
  } finally {
    delete process.env.DARKAUTH_TEST_MODE;
  }
}

async function withTimeout(promise: Promise<void>, timeoutMs: number): Promise<void> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    promise.finally(() => {
      if (timeout) clearTimeout(timeout);
    }),
    new Promise<void>((resolve) => {
      timeout = setTimeout(resolve, timeoutMs);
      timeout.unref?.();
    }),
  ]);
}

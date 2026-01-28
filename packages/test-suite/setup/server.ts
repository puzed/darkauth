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
  // Set test mode environment variable to allow iframe embedding
  process.env.DARKAUTH_TEST_MODE = 'true';
  
  const adminPort = config.adminPort || await getRandomPort();
  const userPort = config.userPort || await getRandomPort();
  
  // Use a unique config file for each test to avoid conflicts
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
    // logLevel: 'silent'
  };

  const context = await createContext(contextConfig);
  const app = await createAppServer(context);
  await app.start();
  const adminServer = app.adminServer;
  const userServer = app.userServer;

  // Test servers started

  return {
    adminServer,
    userServer,
    context,
    adminPort,
    userPort,
    adminUrl: `http://localhost:${adminPort}`,
    userUrl: `http://localhost:${userPort}`
  };
}

export async function destroyTestServers(servers: TestServers): Promise<void> {
  await new Promise<void>((resolve) => {
    servers.adminServer.close(() => resolve());
  });
  delete process.env.DARKAUTH_TEST_MODE;
  await new Promise<void>((resolve) => {
    servers.userServer.close(() => resolve());
  });
  await servers.context.destroy();
}

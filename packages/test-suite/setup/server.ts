import { createServer } from 'node:http';
import { createContext } from '@DarkAuth/api/src/context/createContext.ts';
import { createAdminServer, createUserServer } from '@DarkAuth/api/src/http/createServer.ts';
import type { Context, Config } from '@DarkAuth/api/src/types.ts';
import { getTestDatabaseUri } from './database.js';

export interface TestServerConfig {
  dbName: string;
  adminPort?: number;
  userPort?: number;
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
  const adminPort = config.adminPort || await getRandomPort();
  const userPort = config.userPort || await getRandomPort();
  
  const contextConfig: Config = {
    postgresUri: getTestDatabaseUri(config.dbName),
    adminPort,
    userPort,
    proxyUi: false,
    kekPassphrase: 'test-passphrase-for-testing-only',
    isDevelopment: true,
    publicOrigin: `http://localhost:${userPort}`,
    issuer: `http://localhost:${userPort}`,
    rpId: 'localhost',
    insecureKeys: true,
    // logLevel: 'silent'
  };

  const context = await createContext(contextConfig);
  
  const adminServer = await createAdminServer(context);
  const userServer = await createUserServer(context);

  await new Promise<void>((resolve) => {
    adminServer.listen(adminPort, resolve);
  });

  let started = false;
  for (let i = 0; i < 5 && !started; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        userServer.once('error', reject);
        userServer.listen(userPort, () => {
          userServer.removeAllListeners('error');
          resolve();
        });
      });
      started = true;
    } catch (err: any) {
      if (err && err.code === 'EADDRINUSE') {
        userPort = await getRandomPort();
        contextConfig.userPort = userPort;
        context.config.userPort = userPort;
        continue;
      }
      throw err;
    }
  }

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
  
  await new Promise<void>((resolve) => {
    servers.userServer.close(() => resolve());
  });
  
  await servers.context.destroy();
  
  // Test servers destroyed
}

import { toBase64Url } from '@DarkAuth/api/src/utils/crypto.ts';
import { OpaqueClient } from '@DarkAuth/api/src/lib/opaque/opaque-ts-wrapper.ts';

export interface InstallConfig {
  adminUrl: string;
  adminEmail: string;
  adminName: string;
  adminPassword: string;
  installToken?: string;
}

export async function installDarkAuth(config: InstallConfig): Promise<void> {
  if (!config.installToken) {
    throw new Error('installToken not provided')
  }
  // Use provided token or generate one (in real app this comes from server console)
  const installToken = config.installToken;
  const installResponse = await fetch(`${config.adminUrl}/api/install?token=${installToken}`);
  if (!installResponse.ok) {
    // Continue anyway in dev/test; server accepts dev tokens
  }

  // Perform OPAQUE registration for the bootstrap admin (zero-knowledge)
  const opaque = new OpaqueClient();
  await opaque.initialize();
  const regStart = await opaque.startRegistration(config.adminPassword, config.adminEmail);

  const startRes = await fetch(`${config.adminUrl}/api/install/opaque/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: installToken,
      email: config.adminEmail,
      name: config.adminName,
      request: toBase64Url(Buffer.from(regStart.request)),
    }),
  });
  if (!startRes.ok) {
    const errorText = await startRes.text();
    throw new Error(`OPAQUE start failed: ${startRes.status} ${errorText}`);
  }
  const startJson = await startRes.json();
  const message = Buffer.from(startJson.message, 'base64url');
  const serverPublicKey = Buffer.from(startJson.serverPublicKey, 'base64url');

  const regFinish = await opaque.finishRegistration(
    new Uint8Array(message),
    regStart.state,
    new Uint8Array(serverPublicKey),
    'DarkAuth',
    config.adminEmail
  );

  const finishRes = await fetch(`${config.adminUrl}/api/install/opaque/finish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: installToken,
      email: config.adminEmail,
      name: config.adminName,
      record: toBase64Url(Buffer.from(regFinish.upload)),
    }),
  });
  if (!finishRes.ok) {
    const errorText = await finishRes.text();
    throw new Error(`OPAQUE finish failed: ${finishRes.status} ${errorText}`);
  }

  // Now finalize installation and mark system initialized
  const installPayload = {
    token: installToken,
    adminEmail: config.adminEmail,
    adminName: config.adminName,
  };

  const response = await fetch(`${config.adminUrl}/api/install/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(installPayload)
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.error('Installation failed:', response.status, errorText);
    throw new Error(`Installation failed: ${response.status} ${errorText}`);
  }
  
  const result = await response.json();

  async function waitForRestart(url: string, downTimeoutMs = 7000, upTimeoutMs = 20000): Promise<void> {
    const healthUrl = `${url}/api/health`;
    const downStart = Date.now();
    let sawDown = false;
    while (Date.now() - downStart < downTimeoutMs) {
      try {
        const res = await fetch(healthUrl, { method: 'GET' });
        if (!res.ok) {
          sawDown = true;
          break;
        }
      } catch {
        sawDown = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    const upStart = Date.now();
    while (Date.now() - upStart < upTimeoutMs) {
      try {
        const res = await fetch(healthUrl, { method: 'GET' });
        if (res.ok) return;
      } catch {}
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error(`Server at ${url} not healthy after restart`);
  }

  await waitForRestart(config.adminUrl);

  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(config.adminUrl, { method: 'GET' });
      if (res.ok || (res.status >= 200 && res.status < 400)) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 150));
  }
}

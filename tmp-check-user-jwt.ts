import { createTestServers, destroyTestServers } from './packages/test-suite/setup/server.js';
import { installDarkAuth } from './packages/test-suite/setup/install.js';
import { FIXED_TEST_ADMIN } from './packages/test-suite/fixtures/testData.js';
import { createUserViaAdmin, getAdminSession } from './packages/test-suite/setup/helpers/auth.js';
import { OpaqueClient } from './packages/api/src/lib/opaque/opaque-ts-wrapper.ts';
import { toBase64Url, fromBase64Url } from './packages/api/src/utils/crypto.ts';

async function opaqueLoginFinish(userUrl: string, email: string, password: string) {
  const client = new OpaqueClient();
  await client.initialize();
  const start = await client.startLogin(password, email);
  const resStart = await fetch(`${userUrl}/api/user/opaque/login/start`, { method:'POST', headers:{'Content-Type':'application/json', Origin:userUrl}, body: JSON.stringify({ email, request: toBase64Url(Buffer.from(start.request))})});
  const startJson = await resStart.json() as { message: string; sessionId: string };
  const finish = await client.finishLogin(fromBase64Url(startJson.message), start.state, new Uint8Array(), 'DarkAuth', email);
  const resFinish = await fetch(`${userUrl}/api/user/opaque/login/finish`, { method:'POST', headers:{'Content-Type':'application/json', Origin:userUrl}, body: JSON.stringify({ finish: toBase64Url(Buffer.from(finish.finish)), sessionId: startJson.sessionId })});
  const finishJson = await resFinish.json() as { refreshToken: string };
  return finishJson.refreshToken;
}
const b64urlDecode = (s: string) => Buffer.from(s.replace(/-/g,'+').replace(/_/g,'/') + '==='.slice((s.length+3)%4), 'base64').toString('utf8');

(async () => {
  const servers = await createTestServers({ testName: 'tmp-check-jwt' });
  try {
    await installDarkAuth({ adminUrl: servers.adminUrl, adminEmail: FIXED_TEST_ADMIN.email, adminName: FIXED_TEST_ADMIN.name, adminPassword: FIXED_TEST_ADMIN.password, installToken: 'test-install-token' });
    const adminSession = await getAdminSession(servers, {
      email: FIXED_TEST_ADMIN.email,
      password: FIXED_TEST_ADMIN.password,
    });
    const reader = { email: `reader-${Date.now()}@example.com`, name: 'Directory Reader', password: 'Passw0rd!123' };
    const { sub: readerSub } = await createUserViaAdmin(servers, { email: FIXED_TEST_ADMIN.email, password: FIXED_TEST_ADMIN.password }, reader);
    const upd = await fetch(`${servers.adminUrl}/admin/users/${encodeURIComponent(readerSub)}/permissions`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminSession.cookieHeader,
        Origin: servers.adminUrl,
        'x-csrf-token': adminSession.csrfToken,
      },
      body: JSON.stringify({ permissionKeys: ['darkauth.users:read'] }),
    });
    console.log('update perms status', upd.status);
    const refreshToken = await opaqueLoginFinish(servers.userUrl, reader.email, reader.password);
    const tokenRes = await fetch(`${servers.userUrl}/api/user/token`, { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded', Origin: servers.userUrl }, body: new URLSearchParams({ grant_type:'refresh_token', client_id:'demo-public-client', refresh_token: refreshToken }) });
    console.log('token status', tokenRes.status);
    const tokenJson = await tokenRes.json() as { id_token: string };
    const payload = JSON.parse(b64urlDecode(tokenJson.id_token.split('.')[1]!));
    console.log(JSON.stringify(payload, null, 2));
  } finally {
    await destroyTestServers(servers);
  }
})();

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('API: importação sem iniciar servidor, sessão e bloqueio de persistência efêmera', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rodovar-bootstrap-'));
  const previousRoot = process.env.RODOVAR_DATA_ROOT;
  const previousVercel = process.env.VERCEL;
  process.env.RODOVAR_DATA_ROOT = root;
  delete process.env.VERCEL;
  const { createPortalApp } = await import('../server');
  assert.equal(fs.existsSync(path.join(root, 'data')), false, 'Importar não deve carregar ou criar dados');

  // Use only an isolated fixture. Never open a production account or copy credentials.
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data', 'rodovar-server-db.json'), JSON.stringify({
    users: [{ id: 'test-worker', name: 'Funcionário Teste', login: 'worker@example.test',
      accessLevel: 'FUNCIONARIO', accessProfile: 'COMERCIAL', active: true,
      approvalStatus: 'APROVADO', department: 'Logística' }],
    loginLocks: {}, sessions: {}, passwordResetTokens: [], accessDecisions: [], auditLogs: [],
  }));
  const app = await createPortalApp({ serveFrontend: false });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  try {
    const health = await fetch(base + '/api/health');
    assert.equal(health.status, 200);
    assert.match(health.headers.get('cache-control') || '', /no-store/);
    assert.deepEqual(await health.json(), { status: 'ok', authentication: 'local-session', persistence: 'local-files' });
    const session = await fetch(base + '/api/auth/session');
    assert.equal(session.status, 401, 'A API de sessão deve recusar visitante sem sessão');
    const sessionData = await session.json();
    assert.equal(sessionData.authenticated, false);
    assert.equal((await fetch(base + '/api/agenda')).status, 401);
    assert.equal((await fetch(base + '/api/auth/register', { method: 'POST' })).status, 403);
    process.env.VERCEL = '1';
    await assert.rejects(createPortalApp({ serveFrontend: false }), /persistência durável/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (previousRoot === undefined) delete process.env.RODOVAR_DATA_ROOT;
    else process.env.RODOVAR_DATA_ROOT = previousRoot;
    if (previousVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = previousVercel;
  }
});

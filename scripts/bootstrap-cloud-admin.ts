import { cloudRuntime, HOMOLOGATION_PROJECT } from '../src/server/cloud/runtime.js';
import { bootstrapAdmin } from '../src/server/cloud/bootstrapAdmin.js';
import { createRequire } from 'node:module';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { Firestore } from '@google-cloud/firestore';
import { GoogleAuth, OAuth2Client } from 'google-auth-library';

// ADC must be provided through an operator's authorized environment. No keys/passwords in arguments.
const [uid, login, name, confirm] = process.argv.slice(2);
if (!uid || !login || !name || !confirm) throw Error('Uso: node --import tsx scripts/bootstrap-cloud-admin.ts UID LOGIN NOME PROVISION:rodovar-conecta-hml-60770:UID');
if (process.env.VERCEL) throw Error('Execute somente no ambiente autorizado do operador, nunca no servidor HTTP.');
try {
  let runtime;
  if (process.argv.includes('--firebase-cli')) {
    // Operator process only: reuse the explicit CLI authorization in memory.
    // Never copy refresh tokens to the application, environment or Vercel.
    const require = createRequire(import.meta.url);
    const { requireAuth } = require('firebase-tools/lib/requireAuth');
    const { getGlobalDefaultAccount, getAccessToken } = require('firebase-tools/lib/auth');
    const account = getGlobalDefaultAccount();
    if (!account) throw Error('Autorize o Firebase CLI.');
    await requireAuth({ project: HOMOLOGATION_PROJECT, ...account });
    const token = await getAccessToken(account.tokens.refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
    const client = new OAuth2Client();
    client.setCredentials({ access_token: token.access_token, expiry_date: token.expires_at });
    const app = initializeApp({ projectId: HOMOLOGATION_PROJECT, credential: { getAccessToken: async () => ({ access_token: token.access_token, expires_in: 300 }) } }, 'operator-bootstrap');
    runtime = { auth: getAuth(app), db: new Firestore({ projectId: HOMOLOGATION_PROJECT, auth: new GoogleAuth({ authClient: client }), preferRest: true }) };
  } else runtime = cloudRuntime();
  await bootstrapAdmin(runtime, { projectId: HOMOLOGATION_PROJECT, uid, login, name, confirm });
  console.log('Administrador de homologação provisionado. Troca de senha obrigatória no primeiro acesso.');
} catch { console.error('Provisionamento não concluído. Confira ADC, projeto, identidade de teste e se já existe administrador.'); process.exitCode = 1; }

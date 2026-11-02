// Administrative provisioning helper, never imported by browser or API code.
// Uses the user's existing Firebase CLI authorization without exporting tokens.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { requireAuth } = require('firebase-tools/lib/requireAuth');
const { getGlobalDefaultAccount } = require('firebase-tools/lib/auth');
const { Client } = require('firebase-tools/lib/apiv2');
const project = 'rodovar-conecta-hml-60770';
if (process.argv[2] !== project || process.env.VERCEL) {
  throw new Error('Informe explicitamente o projeto de homologação. Produção/Vercel não são permitidas.');
}
await requireAuth({ project, ...getGlobalDefaultAccount() });
const auth = new Client({ urlPrefix: 'https://identitytoolkit.googleapis.com', apiVersion: 'v2' });
await auth.patch(`/projects/${project}/config`, {
  client: { permissions: { disabledUserSignup: true, disabledUserDeletion: true } },
}, { queryParams: { updateMask: 'client.permissions' }, skipLog: { body: true, resBody: true } });
const config = (await auth.get(`/projects/${project}/config`, { skipLog: { resBody: true } })).body;
if (!config.client?.permissions?.disabledUserSignup || !config.client?.permissions?.disabledUserDeletion) {
  throw new Error('O provedor não confirmou o bloqueio do cadastro público.');
}
if (!config.signIn?.email?.enabled || !config.signIn?.email?.passwordRequired) {
  throw new Error('E-mail/senha ainda não está habilitado no projeto de homologação.');
}
console.log('Authentication: e-mail/senha confirmado; cadastro e exclusão pelo cliente bloqueados.');

const firestore = new Client({ urlPrefix: 'https://firestore.googleapis.com', apiVersion: 'v1' });
const target = `/projects/${project}/databases/(default)/documents/system_settings/homologation_check`;
const checkedAt = new Date().toISOString();
await firestore.patch(target, { fields: {
  environment: { stringValue: 'homologation' },
  checkedAt: { timestampValue: checkedAt },
  containsPersonalData: { booleanValue: false },
} }, { skipLog: { body: true, resBody: true } });
const stored = (await firestore.get(target, { skipLog: { resBody: true } })).body;
if (stored.fields?.checkedAt?.timestampValue !== checkedAt) throw new Error('Leitura após escrita não confirmou a persistência.');
console.log('Firestore remoto: escrita e leitura administrativa confirmadas, sem dados pessoais.');

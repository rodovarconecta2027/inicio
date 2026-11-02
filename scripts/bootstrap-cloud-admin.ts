import { cloudRuntime, HOMOLOGATION_PROJECT } from '../src/server/cloud/runtime.js';
import { bootstrapAdmin } from '../src/server/cloud/bootstrapAdmin.js';

// ADC must be provided through an operator's authorized environment. No keys/passwords in arguments.
const [uid, login, name, confirm] = process.argv.slice(2);
if (!uid || !login || !name || !confirm) throw Error('Uso: node --import tsx scripts/bootstrap-cloud-admin.ts UID LOGIN NOME PROVISION:rodovar-conecta-hml-60770:UID');
if (process.env.VERCEL) throw Error('Execute somente no ambiente autorizado do operador, nunca no servidor HTTP.');
try {
  await bootstrapAdmin(cloudRuntime(), { projectId: HOMOLOGATION_PROJECT, uid, login, name, confirm });
  console.log('Administrador de homologação provisionado. Troca de senha obrigatória no primeiro acesso.');
} catch { console.error('Provisionamento não concluído. Confira ADC, projeto, identidade de teste e se já existe administrador.'); process.exitCode = 1; }

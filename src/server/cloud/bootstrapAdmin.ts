import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { privateIdentifierKey } from './authService.js';

/** Operator-only provisioning. Never mounted as an HTTP endpoint; never creates Auth accounts. */
export async function bootstrapAdmin(runtime: { auth: Auth; db: Firestore }, input: {
  projectId: string; uid: string; login: string; name: string; confirm: string;
}) {
  if (!['rodovar-conecta-hml-60770', 'demo-rodovar-conecta'].includes(input.projectId) ||
      runtime.auth.app.options.projectId !== input.projectId || input.confirm !== `PROVISION:${input.projectId}:${input.uid}`)
    throw Error('Confirme explicitamente o projeto de homologação e UID.');
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(input.login) || !input.name?.trim() || input.name.length > 120)
    throw Error('Nome e login válidos são obrigatórios.');
  const account = await runtime.auth.getUser(input.uid);
  if (!account.email || account.disabled || !account.email.endsWith('@example.test'))
    throw Error('Use uma conta de teste ativa, previamente criada, com e-mail @example.test.');
  const db = runtime.db, security = db.collection('system_settings').doc('security');
  const user = db.collection('users').doc(account.uid), profile = db.collection('employee_profiles').doc(account.uid);
  const aliases = [...new Set([privateIdentifierKey(input.login), privateIdentifierKey(account.email)])].map(id => db.collection('auth_identifiers').doc(id));
  return db.runTransaction(async tx => {
    const existing = await tx.get(security);
    const snapshots = await tx.getAll(user, profile, ...aliases);
    if (existing.exists || snapshots.some(doc => doc.exists)) throw Error('Provisionamento já executado ou identidade já vinculada. Nenhum registro foi alterado.');
    const atIso = new Date().toISOString();
    tx.create(security, { protectedAdminUid: account.uid, provisionedAtIso: atIso, environment: 'homologation' });
    tx.create(user, { active: true, approvalStatus: 'APROVADO', accessLevel: 'ADMINISTRADOR', accessProfile: 'DIRETORIA', mustChangePassword: true });
    tx.create(profile, { name: input.name.trim(), login: input.login, department: 'Administrativo', roleTitle: 'Administrador de Homologação', joinedAt: atIso });
    for (const ref of aliases) tx.create(ref, { uid: account.uid, email: account.email });
    tx.create(db.collection('audit_logs').doc(), { actorId: account.uid, action: 'HOMOLOGATION_ADMIN_PROVISIONED', atIso });
    return { uid: account.uid, provisioned: true };
  });
}

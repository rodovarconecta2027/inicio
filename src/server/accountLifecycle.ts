import crypto from 'node:crypto';
import type { Express } from 'express';
import type { ServerDatabase, ServerUserRecord } from '../../server';

export interface ArchivedAccount {
  user: Omit<ServerUserRecord, 'passwordHash' | 'passwordSalt'>;
  deletedAtIso: string;
  deletedById: string;
  reason: string;
}

export class AccountDeletionError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export function archiveAccount(db: ServerDatabase, targetId: string, actorId: string, reason: string): ArchivedAccount {
  const actor = db.users.find(u => u.id === actorId);
  const policy = db.accessPolicy;
  if (!policy || !actor || actorId !== policy.protectedAdminUid || actor.accessLevel !== 'ADMINISTRADOR' || !actor.active || actor.approvalStatus !== 'APROVADO') throw new AccountDeletionError('Apenas o administrador principal pode excluir cadastros.', 403);
  if (targetId === policy.protectedAdminUid || targetId === actorId) throw new AccountDeletionError('O administrador principal está protegido e não pode ser excluído.', 409);
  const target = db.users.find(u => u.id === targetId);
  if (!target) throw new AccountDeletionError('Cadastro não encontrado.', 404);
  const { passwordHash: _hash, passwordSalt: _salt, ...snapshot } = target;
  const stamp = new Date().toISOString();
  const archived: ArchivedAccount = { user: { ...snapshot, active: false, approvalStatus: 'SUSPENSO' }, deletedAtIso: stamp, deletedById: actorId, reason };
  (db.archivedUsers ||= []).push(archived);
  db.users = db.users.filter(u => u.id !== targetId);
  policy.authorizedUids = policy.authorizedUids.filter(uid => uid !== targetId);
  for (const [sid, session] of Object.entries(db.sessions)) if (session.userId === targetId) delete db.sessions[sid];
  db.passwordResetTokens = db.passwordResetTokens.filter(t => t.userId !== targetId);
  delete db.loginLocks['user:' + targetId];
  delete db.loginLocks[target.login];
  db.auditLogs.unshift({ id: crypto.randomUUID(), timestampIso: stamp, timestampFormatted: new Date(stamp).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), actorId, actorName: actor.name, actorRole: 'ADMINISTRADOR', action: 'EXCLUSAO_CADASTRO', details: `Cadastro ${target.name} (${target.login}, UID ${targetId}) excluído dos acessos. Histórico preservado. ${reason}` });
  return archived;
}

export function registerAccountDeletionRoutes(app: Express, guard: any, db: ServerDatabase, save: (db: ServerDatabase) => void) {
  app.delete('/api/admin/users/:userId', guard, (req: any, res) => {
    try {
      archiveAccount(db, String(req.params.userId), req.sessionUser.id, String(req.body?.reason || 'Exclusão solicitada pelo administrador.').trim().slice(0, 500));
      save(db);
      res.json({ ok: true, deletedUserId: req.params.userId, historyPreserved: true });
    } catch (e) {
      if (e instanceof AccountDeletionError) return res.status(e.status).json({ error: e.message });
      throw e;
    }
  });
}

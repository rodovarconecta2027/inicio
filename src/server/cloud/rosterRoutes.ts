import type { Express, RequestHandler } from 'express';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { AUTHORIZED_ROSTER, PROFILE_MODULES, type AccessProfile } from '../../lib/accessPolicy.js';
import { privateIdentifierKey } from './authService.js';
import { actorOf, requireProtectedAdmin } from './protectedAdmin.js';

const roster = AUTHORIZED_ROSTER.map(person => ({ ...person, slot: privateIdentifierKey(person.name).slice(0, 24) }));
const roles: Record<AccessProfile, [department: string, title: string]> = {
  RH: ['Recursos Humanos', 'Recursos Humanos'],
  DIRETORIA: ['Diretoria', 'Diretor'],
  MONITORAMENTO: ['Logística', 'Monitoramento'],
  COMERCIAL: ['Logística', 'Comercial'],
  EXPEDICAO: ['Logística', 'Expedição'],
  FINANCEIRO: ['Financeiro', 'Financeiro'],
};

function sector(person: typeof roster[number]) {
  const [department, title] = roles[person.profile];
  return {
    account: {
      accessProfile: person.profile,
      accessLevel: person.profile === 'DIRETORIA' ? 'DIRETORIA' : 'FUNCIONARIO',
      permissoesPaginas: [...PROFILE_MODULES[person.profile]],
    },
    profile: { department, roleTitle: person.name === 'Augusto César Brito da Cruz' ? 'Encarregado de Expedição' : title },
  };
}

const fail = (status: number, message: string): never => { throw Object.assign(Error(message), { status }); };

export function registerCloudRoster(app: Express, guard: RequestHandler, { auth, db }: { auth: Auth; db: Firestore }) {
  const base = '/api/cloud/admin/roster';
  const accounts = db.collection('users'), profiles = db.collection('employee_profiles');
  const assignments = db.collection('roster_assignments'), aliases = db.collection('auth_identifiers');

  app.get(base, guard, async (req, res, next) => {
    try {
      const actor = actorOf(req);
      const data = await db.runTransaction(async tx => {
        await requireProtectedAdmin(tx, db, actor);
        const [links, users] = await Promise.all([
          tx.getAll(...roster.map(person => assignments.doc(person.slot))),
          tx.get(accounts.where('active', '==', true).limit(501)),
        ]);
        if (users.size > 500) fail(409, 'Diretório acima do limite de conferência.');
        const linkedUids = links.flatMap(doc => doc.data()?.uid ? [String(doc.data()!.uid)] : []);
        const linkedRecords = linkedUids.length
          ? await tx.getAll(...linkedUids.map(uid => accounts.doc(uid)), ...linkedUids.map(uid => profiles.doc(uid)))
          : [];
        const byUid = new Map(linkedRecords.slice(0, linkedUids.length).map(doc => [doc.id, doc.data()]));
        const profileByUid = new Map(linkedRecords.slice(linkedUids.length).map(doc => [doc.id, doc.data()]));
        return {
          administratorPreserved: true,
          unlinkedActive: users.docs.filter(doc => doc.id !== actor.id && doc.data().approvalStatus === 'APROVADO' && !byUid.has(doc.id)).length,
          roster: roster.map((person, index) => {
            const link = links[index].data(), account = byUid.get(link?.uid);
            const profile = profileByUid.get(link?.uid), expected = sector(person);
            return {
              ...person, uid: link?.uid, login: link?.login, actualProfile: account?.accessProfile,
              status: account?.removedAtIso ? 'removed' : !link ? 'unlinked' :
                profile && account?.active && account.approvalStatus === 'APROVADO' ? 'active' : 'inactive',
              profileMatches: Boolean(account && account.rosterSlot === person.slot && account.accessProfile === person.profile &&
                account.accessLevel === expected.account.accessLevel && profile?.department === expected.profile.department &&
                profile?.roleTitle === expected.profile.roleTitle &&
                JSON.stringify(account.permissoesPaginas) === JSON.stringify(expected.account.permissoesPaginas)),
              mustChangePassword: account?.mustChangePassword === true,
            };
          }),
        };
      });
      res.json(data);
    } catch (error) { next(error); }
  });

  app.post(base, guard, async (req, res, next) => {
    try {
      const actor = actorOf(req);
      await db.runTransaction(tx => requireProtectedAdmin(tx, db, actor));
      if (!['rodovar-conecta-hml-60770', 'demo-rodovar-conecta'].includes(auth.app.options.projectId || ''))
        fail(403, 'Vínculo disponível exclusivamente na homologação.');
      const { slot, uid, login, email, confirm } = req.body || {};
      const person = roster.find(item => item.slot === slot) ?? fail(400, 'Selecione um colaborador da lista autorizada.');
      if (confirm !== true || typeof uid !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(uid) ||
          typeof login !== 'string' || !/^[A-Za-z0-9._-]{3,80}$/.test(login) ||
          typeof email !== 'string' || email.length > 254 || !/^[^\s@]+@example\.test$/i.test(email))
        fail(400, 'Informe UID, login e e-mail de teste @example.test e confirme o vínculo.');
      if (uid === actor.id) fail(403, 'O administrador principal é protegido.');
      const identity = await auth.getUser(uid).catch((cause: { code?: string }) => {
        if (cause.code === 'auth/user-not-found') fail(404, 'UID não encontrado no Firebase de homologação.');
        throw cause;
      });
      if (identity.disabled || identity.email?.toLowerCase() !== email.toLowerCase() ||
          !identity.providerData.some(provider => provider.providerId === 'password'))
        fail(409, 'O UID precisa corresponder a uma conta ativa com esse e-mail e autenticação por senha.');
      const accountRef = accounts.doc(uid), profileRef = profiles.doc(uid), linkRef = assignments.doc(person.slot);
      const aliasRefs = [aliases.doc(privateIdentifierKey(login)), aliases.doc(privateIdentifierKey(email))];
      const result = await db.runTransaction(async tx => {
        await requireProtectedAdmin(tx, db, actor);
        const [accountDoc, profileDoc, link, loginAlias, emailAlias] = await tx.getAll(accountRef, profileRef, linkRef, ...aliasRefs);
        const account = accountDoc.data(), existing = profileDoc.data();
        if (account?.accessLevel === 'ADMINISTRADOR') fail(403, 'O administrador principal é protegido.');
        if (link.data()?.uid === uid && link.data()?.login === login && account?.rosterSlot === person.slot) return { ok: true };
        if (link.exists || account?.rosterSlot || account?.removedAtIso)
          fail(409, 'O colaborador ou UID já possui vínculo ou histórico de exclusão.');
        const previousEmail = emailAlias.data();
        if ((accountDoc.exists || profileDoc.exists) && (!account || !existing || previousEmail?.uid !== uid ||
            previousEmail?.email?.toLowerCase() !== email.toLowerCase()))
          fail(409, 'Há um cadastro anterior sem vínculo verificável com este UID. O histórico foi preservado.');
        if ([loginAlias, emailAlias].some(doc => doc.exists &&
            (doc.data()?.uid !== uid || doc.data()?.email?.toLowerCase() !== email.toLowerCase())))
          fail(409, 'O login ou e-mail já pertence a outro vínculo.');
        const now = Date.now(), atIso = new Date(now).toISOString(), access = sector(person);
        if (account) {
          tx.update(accountRef, { ...access.account, rosterSlot: person.slot,
            accessRevokedAt: Math.max(now, Number(account.accessRevokedAt || 0) + 1) });
          tx.update(profileRef, { ...access.profile, login, email: identity.email });
        } else {
          tx.create(accountRef, { ...access.account, rosterSlot: person.slot, active: true,
            approvalStatus: 'APROVADO', mustChangePassword: true });
          tx.create(profileRef, { ...access.profile, login, email: identity.email, joinedAt: atIso,
            name: 'Colaborador de teste · ' + login });
        }
        for (const [index, doc] of [loginAlias, emailAlias].entries()) {
          if (!doc.exists) tx.create(aliasRefs[index], { uid, email: identity.email });
        }
        tx.create(linkRef, { uid, login, linkedAt: atIso, linkedBy: actor.id });
        tx.create(db.collection('audit_logs').doc(), { action: 'ROSTER_IDENTITY_LINKED', actorId: actor.id,
          targetId: uid, accessProfile: person.profile, atIso });
        return { ok: true };
      });
      res.json(result);
    } catch (error) { next(error); }
  });

  app.patch(base + '/:slot/profile', guard, async (req, res, next) => {
    try {
      const actor = actorOf(req);
      await db.runTransaction(async tx => {
        await requireProtectedAdmin(tx, db, actor);
        const person = roster.find(item => item.slot === req.params.slot) ?? fail(404, 'Colaborador fora da lista autorizada.');
        if (req.body?.confirm !== true || Object.keys(req.body).length !== 1)
          fail(400, 'Confirme somente a aplicação do perfil de setor previsto.');
        const uid = (await tx.get(assignments.doc(person.slot))).data()?.uid;
        if (!uid) fail(404, 'O colaborador ainda não possui vínculo.');
        const accountRef = accounts.doc(uid), profileRef = profiles.doc(uid);
        const [accountDoc, profileDoc] = await tx.getAll(accountRef, profileRef);
        const account = accountDoc.data(), profile = profileDoc.data();
        if (uid === actor.id || account?.accessLevel === 'ADMINISTRADOR') fail(403, 'O administrador principal é protegido.');
        if (!account || account.removedAtIso || account.rosterSlot !== person.slot || !profile)
          return fail(409, 'Vínculo indisponível para alteração.');
        const access = sector(person);
        if (account.accessProfile === person.profile && account.accessLevel === access.account.accessLevel &&
            JSON.stringify(account.permissoesPaginas) === JSON.stringify(access.account.permissoesPaginas) &&
            profile.department === access.profile.department && profile.roleTitle === access.profile.roleTitle) return;
        const now = Date.now();
        tx.update(accountRef, { ...access.account, accessRevokedAt: Math.max(now, Number(account.accessRevokedAt || 0) + 1) });
        tx.update(profileRef, access.profile);
        tx.create(db.collection('audit_logs').doc(), { action: 'ROSTER_PROFILE_APPLIED', actorId: actor.id,
          targetId: uid, previousProfile: account.accessProfile || null, accessProfile: person.profile, atIso: new Date(now).toISOString() });
      });
      res.json({ ok: true });
    } catch (error) { next(error); }
  });
}

import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { Firestore } from 'firebase-admin/firestore';
import { canViewFreightTeam } from '../../lib/permissions.js';
import { readPrivateFile, validateFreightUpload, writePrivateFiles } from './freightFiles.js';
import { presentOfficialNames } from './presentNames.js';
import type { Employee, UnifiedFreightAttachment, UnifiedFreightRecord } from '../../types';
import { canUserAccessFreightRecord, emptyFreightEngineState, registerUnifiedFreightRoutes, withFreightEngineState } from '../unifiedFreightEngine.js';

const fail = (message: string, status = 503): never => { throw Object.assign(Error(message), { status }); };
const clean = (value: unknown) => JSON.parse(JSON.stringify(value));
const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const context = new AsyncLocalStorage<{ users: Employee[]; audits: any[]; drivers: any[] }>();

/** Reuses the local operational handlers, with isolated state and one Firestore commit.
 * No response is sent before commit, no seed data and no filesystem writes.
 * Bounded homologation adapter: refuse overflow explicitly instead of truncating data.
 */
export function registerCloudFreightRoutes(app: Express, guard: RequestHandler, db: Firestore) {
  const captured: { method: string; path: string; handler: any }[] = [];
  const registry: any = { locals: { checkDriverBinding: (_req: any, res: any, cpf: string) => {
    const normalized = String(cpf).replace(/\D/g, '');
    const blocked = context.getStore()!.drivers.find(d => String(d.cpf || '').replace(/\D/g, '') === normalized && ['BLOQUEADO', 'REPROVADO'].includes(d.status));
    if (blocked) { res.status(409).json({ error: 'Motorista bloqueado. Consulte o cadastro antes de continuar.', code: 'DRIVER_BLOCKED' }); return false; }
    return true;
  } } };
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) registry[method] = (paths: string | string[], ...handlers: any[]) => {
    for (const path of Array.isArray(paths) ? paths : [paths]) captured.push({ method, path, handler: handlers.at(-1) });
  };
  registerUnifiedFreightRoutes(registry, guard, () => context.getStore()!.users,
    (actorId, actorName, actorRole, action, details) => context.getStore()!.audits.push({ actorId, actorName, actorRole, action, details, atIso: new Date().toISOString() }), { remote: true });

  for (const route of captured) (app as any)[route.method](route.path.replace('/api/', '/api/cloud/'), guard, async (req: any, res: any, next: any) => {
    try {
      const attachmentRoute = route.path.includes('/attachments');
      const upload = attachmentRoute && route.method === 'post' && route.path.endsWith('/attachments');
      const download = attachmentRoute && route.method === 'get';
      const verifying = attachmentRoute && route.path.endsWith('/verify');
      if (upload) validateFreightUpload(req.body?.dataUrl);
      const mutation = req.method !== 'GET';
      const rawKey = String(req.headers['x-idempotency-key'] || req.body?.idempotencyKey || '');
      if (mutation && !/^[A-Za-z0-9_-]{1,128}$/.test(rawKey)) { res.status(400).json({ error: 'Identificador de envio obrigatório. Atualize a página e tente novamente.', code: 'IDEMPOTENCY_REQUIRED' }); return; }
      const fingerprint = digest(JSON.stringify({ method: req.method, path: req.path, body: req.body }));
      const keyRef = db.collection('operation_keys').doc(digest(`${req.sessionUser.id}:${req.method}:${req.path}:${rawKey}`));
      const result = await db.runTransaction(async tx => {
        const actor = (await tx.get(db.collection('users').doc(req.sessionUser.id))).data();
        if (!actor?.active || actor.approvalStatus !== 'APROVADO') fail('Conta sem acesso autorizado.', 403);
        const security = (await tx.get(db.collection('system_settings').doc('security'))).data();
        if (actor!.accessLevel === 'ADMINISTRADOR' && security?.protectedAdminUid !== req.sessionUser.id) fail('Administrador não autorizado.', 403);
        const uid = req.sessionUser.id;
        if (download) {
          const { freightId, attId } = req.params;
          const [record, details] = await tx.getAll(db.collection('freight_operations').doc(freightId), db.collection('freight_details').doc(freightId));
          const freight = record.data() as UnifiedFreightRecord | undefined;
          const user = { ...req.sessionUser, ...actor, id: uid } as Employee;
          if (!freight) return fail('Frete não encontrado.', 404);
          const unclaimed = freight.expedicaoResponsavelId === null && freight.comercialResponsavelId !== uid &&
            freight.monitoramentoResponsavelId !== uid && !canViewFreightTeam(user);
          if (!canUserAccessFreightRecord(freight, user) || unclaimed) return fail('Sem permissão para baixar documentos deste frete.', 403);
          const att = (details.data()?.anexos as UnifiedFreightAttachment[] | undefined)?.find(item => item.id === attId);
          if (!att || att.freightId !== freightId) return fail('Anexo não encontrado.', 404);
          const file = await readPrivateFile(tx, db, att);
          return { file, mimeType: att.mimeType, fileName: att.fileName };
        }
        if (attachmentRoute) {
          const { freightId } = req.params;
          const freight = (await tx.get(db.collection('freight_operations').doc(freightId))).data() as UnifiedFreightRecord | undefined;
          if (!freight) return fail('Frete não encontrado.', 404);
          if (!canUserAccessFreightRecord(freight, { ...req.sessionUser, ...actor, id: uid } as Employee)) {
            return fail('Sem permissão para alterar documentos deste frete.', 403);
          }
        }
        if (mutation) {
          const previous = await tx.get(keyRef);
          if (previous.exists) {
            if (previous.data()!.fingerprint !== fingerprint) fail('Este envio já foi usado com outros dados.', 409);
            return previous.data()!.response;
          }
        }
        const names = ['freight_operations', 'freight_details', 'users', 'employee_profiles', 'freight_notifications', 'drivers'];
        const snapshots = await Promise.all(names.map(name => tx.get(db.collection(name).limit(501))));
        if (snapshots.some(s => s.size > 500)) fail('Limite de consulta da homologação atingido. É necessário paginar a persistência antes de continuar.');
        const sequenceRef = db.collection('system_settings').doc('freight_sequence');
        const sequence = await tx.get(sequenceRef);
        const driverState = await tx.get(db.collection('portal_modules').doc('drivers'));
        const last = sequence.data()?.lastNumber;
        if (sequence.exists && (!Number.isSafeInteger(last) || last < 0)) fail('Sequência RDV inválida. Solicite revisão administrativa.');
        if (!sequence.exists && snapshots[0].size) fail('A sequência RDV precisa ser reconciliada com os fretes existentes.');
        const state = emptyFreightEngineState((last ?? 0) + 1);
        for (const doc of snapshots[0].docs) state.freightsIndex.set(doc.id, doc.data() as any);
        for (const doc of snapshots[1].docs) state.freightSubDocs.set(doc.id, doc.data() as any);
        state.serverNotifications = snapshots[4].docs.map(d => d.data() as any);
        const profiles = new Map(snapshots[3].docs.map(d => [d.id, d.data()]));
        const users = snapshots[2].docs.filter(d => profiles.has(d.id)).map(d => ({ ...profiles.get(d.id), ...d.data(),
          name: profiles.get(d.id)?.name, id: d.id } as Employee))
          .filter(u => u.accessLevel !== 'ADMINISTRADOR' || u.id === security?.protectedAdminUid);
        const transactionUser = users.find(u => u.id === req.sessionUser.id);
        if (!transactionUser) fail('Perfil profissional indisponível.', 403);
        const freightId = req.params.freightId;
        const beforeFiles = attachmentRoute ? [...(state.freightSubDocs.get(freightId)?.anexos || [])] : [];
        if (upload) {
          const freight = state.freightsIndex.get(freightId);
          if (freight && transactionUser!.accessLevel !== 'ADMINISTRADOR' &&
              ![freight.comercialResponsavelId, freight.expedicaoResponsavelId, freight.monitoramentoResponsavelId].includes(uid)) {
            return fail('Somente os responsáveis podem anexar documentos a este frete.', 403);
          }
        }
        const audits: any[] = [];
        let fileToSave: { name: string; bytes: Buffer } | undefined;
        let response: { status: number; body: any } | undefined;
        let status = 200;
        const output: any = { status(code: number) { status = code; return output; }, json(body: any) { response = { status, body: clean(body) }; return output; } };
        await context.run({ users, audits, drivers: [...snapshots[5].docs.map(d => d.data()), ...(driverState.data()?.drivers || [])] }, () => withFreightEngineState(state, () => route.handler({
          body: req.body, params: req.params, query: req.query, headers: req.headers, method: req.method,
          path: req.path, ip: req.ip, sessionUser: transactionUser,
          saveAttachment: (name: string, bytes: Buffer) => { fileToSave = { name, bytes }; },
        }, output)));
        if (!response) fail('A operação não retornou uma resposta válida.');
        response!.body = presentOfficialNames(response!.body,
          new Map(users.map(person => [person.id, person.name])));
        if (mutation && response!.status < 400) {
          if (route.path.endsWith('/monitoramento-action') && req.body?.targetStage === 'FINALIZADO') {
            const completed = state.freightsIndex.get(freightId);
            const proof = state.freightSubDocs.get(freightId)?.anexos.find(att => att.id === completed?.comprovanteEntregaAnexoId);
            if (!proof) return fail('Comprovante de entrega indisponível.', 409);
            await readPrivateFile(tx, db, proof);
          }
          if (verifying && req.body?.conferido !== false) {
            const attachment = beforeFiles.find(att => att.id === req.params.attId);
            if (!attachment) return fail('Anexo não encontrado.', 404);
            await readPrivateFile(tx, db, attachment);
          }
          if (attachmentRoute) {
            const retained = new Set(state.freightSubDocs.get(freightId)?.anexos.map(att => att.id));
            const removed = beforeFiles.filter(att => !retained.has(att.id));
            await writePrivateFiles(tx, db, freightId, fileToSave, removed);
          }
          const desired = [state.freightsIndex, state.freightSubDocs, new Map(state.serverNotifications.map(n => [n.id, n]))];
          for (const [i, snapshotIndex] of [0, 1, 4].entries()) {
            const old = new Map(snapshots[snapshotIndex].docs.map(d => [d.id, JSON.stringify(d.data())]));
            for (const [id, value] of desired[i]) {
              const data = clean(value);
              if (JSON.stringify(data) !== old.get(id)) tx.set(db.collection(names[snapshotIndex]).doc(id), data);
            }
            // Notification dismissal only. Freight records/history are never deleted here.
            if (snapshotIndex === 4) for (const id of old.keys()) if (!desired[i].has(id)) tx.delete(db.collection(names[snapshotIndex]).doc(id));
          }
          if (state.nextProtocolNumber !== (last ?? 0) + 1) tx.set(sequenceRef, { lastNumber: state.nextProtocolNumber - 1 });
          for (const audit of audits) tx.create(db.collection('audit_logs').doc(), clean(audit));
          tx.create(keyRef, { fingerprint, actorId: transactionUser!.id, response: response!, atIso: new Date().toISOString() });
        }
        return response!;
      });
      if ('file' in result) {
        res.attachment(result.fileName);
        res.setHeader('Content-Type', result.mimeType);
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        res.send(result.file);
        return;
      }
      res.status(result.status).json(result.body);
    } catch (error) { next(error); }
  });
}

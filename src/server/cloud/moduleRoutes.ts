import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import { registerAgenda } from '../agenda.js';
import { registerMural } from '../mural.js';
import { readPrivateFile, writePrivateFiles } from './freightFiles.js';
import type { PaymentReceiptRecord, RequestAttachment } from '../../types';
import { registerRequestQueue } from '../requestQueue.js';
import { registerPolls } from '../muralPolls.js';
import { registerExternalRh, canAccessExternalRh } from '../externalRh.js';
import { registerDrivers } from '../drivers.js';
import { registerPaymentReceiptRoutes, withPaymentStore } from '../paymentReceiptsEngine.js';
import { financialProjection } from '../financialProjection.js';
import { presentOfficialNames } from './presentNames.js';
import { moduleAssets, rejectAssetReferences } from './moduleAssets.js';
import { registerCustomerCovers } from '../customerCovers.js';
import { hasPagePermission, canConfirmFreightPayment } from '../../lib/permissions.js';

const fail = (message: string, status = 503): never => { throw Object.assign(Error(message), { status }); };
const clean = (data: any) => JSON.parse(JSON.stringify(data));
const hash = (data: string) => crypto.createHash('sha256').update(data).digest('hex');

export async function cloudDirectory(db: Firestore, tx?: Transaction) {
  const read = (query: any) => tx ? tx.get(query) : query.get();
  const [accounts, profiles, security]: any[] = await Promise.all([
    read(db.collection('users').limit(501)), read(db.collection('employee_profiles').limit(501)), read(db.collection('system_settings').doc('security')),
  ]);
  if (accounts.size > 500 || profiles.size > 500) fail('Diretório acima do limite de homologação. Solicite paginação.');
  const people = new Map(profiles.docs.map((d: any) => [d.id, d.data()]));
  return accounts.docs.filter((d: any) => people.has(d.id)).map((d: any) => ({ ...(people.get(d.id) as any), ...d.data(),
    name: (people.get(d.id) as any).name, id: d.id }))
    .filter((u: any) => u.accessLevel !== 'ADMINISTRADOR' || security.data()?.protectedAdminUid === u.id);
}

/** Preserve each module's handlers and permissions; replace only its persistence boundary.
 * State documents are bounded to avoid Firestore's 1 MiB limit. Overflow is an explicit
 * error, not a partial save. Supported binaries use the private transactional file store.
 */
export function registerCloudModuleRoutes(app: Express, guard: RequestHandler, db: Firestore) {
  const adminGuard = (req: any, res: any, next: any) => req.sessionUser.accessLevel === 'ADMINISTRADOR'
    ? next() : res.status(403).json({ error: 'Operação exclusiva do administrador principal.' });
  app.get('/api/cloud/employees', guard, async (req: any, res, next) => {
    try {
      if (!['diretorio', 'mensagens', 'grupos'].some(page => hasPagePermission(req.sessionUser, page)) && req.sessionUser.accessLevel !== 'ADMINISTRADOR') { res.status(403).json({ error: 'Diretório não autorizado.' }); return; }
      const users = await cloudDirectory(db);
      res.json({ employees: users.filter((u: any) => u.active && u.approvalStatus === 'APROVADO').map((u: any) => ({
        id: u.id, name: u.name, department: u.department, roleTitle: u.roleTitle, email: u.email || '',
        phone: u.phone || '', avatar: u.avatar || '/assets/default-avatar.png', active: true, approvalStatus: 'APROVADO',
        accessProfile: u.accessProfile, accessLevel: u.accessLevel,
      })) });
    } catch (error) { next(error); }
  });
  app.get('/api/cloud/admin/access-requests', guard, adminGuard, async (req: any, res, next) => {
    try {
      const [users, audit, decisions] = await Promise.all([
        cloudDirectory(db),
        db.collection('audit_logs').orderBy('atIso', 'desc').limit(150).get(),
        db.collection('access_decisions').orderBy('timestampIso', 'desc').limit(100).get(),
      ]);
      const accounts = users.filter((user: any) => !user.removedAtIso).map((user: any) => ({
        id: user.id, name: user.name, login: user.login || '', email: user.id === req.sessionUser.id ? req.sessionUser.email : user.email || '',
        department: user.department, roleTitle: user.roleTitle, phoneExt: user.phoneExt || '',
        active: user.active, approvalStatus: user.approvalStatus, accessLevel: user.accessLevel,
        accessProfile: user.accessProfile, permissoesPaginas: user.permissoesPaginas || [],
        mustChangePassword: user.mustChangePassword === true, reactivationAllowed: user.reactivationAllowed === true,
      }));
      const auditLogs = audit.docs.map(doc => {
        const { action, actorId, atIso } = doc.data();
        return { id: doc.id, action, actorUserId: actorId || '', atIso };
      });
      res.json({ accounts, pendingCount: accounts.filter((user: { approvalStatus: string }) => user.approvalStatus === 'PENDENTE').length, decisionsHistory: decisions.docs.map(doc => doc.data()), auditLogs });
    } catch (error) { next(error); }
  });

  const accountAction = (forcedAction?: 'EXCLUIR'): RequestHandler => async (req: any, res, next) => {
    try {
      const targetId = req.params.userId;
      const action = forcedAction ?? req.body?.action;
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetId)) fail('Conta inválida.', 400);
      if (!['APROVAR', 'SUSPENDER', 'RECUSAR', 'EXCLUIR'].includes(action)) {
        fail('Vínculos e perfis precisam passar pelo provisionamento controlado.', 409);
      }
      const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 500) : '';
      const result = await db.runTransaction(async tx => {
        const security = db.collection('system_settings').doc('security');
        const actorRef = db.collection('users').doc(req.sessionUser.id);
        const targetRef = db.collection('users').doc(targetId);
        const profileRef = db.collection('employee_profiles').doc(targetId);
        const [policy, actor, target, profile] = await tx.getAll(security, actorRef, targetRef, profileRef);
        const admin = actor.data(), account = target.data(), person = profile.data();
        if (policy.data()?.protectedAdminUid !== actor.id || !admin?.active || admin.approvalStatus !== 'APROVADO' || admin.accessLevel !== 'ADMINISTRADOR') {
          fail('Operação exclusiva do administrador principal.', 403);
        }
        if (targetId === actor.id || account?.accessLevel === 'ADMINISTRADOR') fail('O administrador principal é protegido.', 403);
        if (!account || !person) return fail('Conta não encontrada.', 404);
        if (account.removedAtIso) {
          if (action === 'EXCLUIR') return { ok: true };
          return fail('Cadastro excluído. O histórico foi preservado.', 409);
        }
        const reactivate = action === 'APROVAR';
        if (reactivate && !(account.approvalStatus === 'SUSPENSO' && account.reactivationAllowed === true)) {
          fail('Só é possível reativar um vínculo aprovado e suspenso nesta central.', 409);
        }
        const newStatus = reactivate ? 'APROVADO' : action === 'RECUSAR' ? 'RECUSADO' : 'SUSPENSO';
        if (!reactivate && action !== 'EXCLUIR' && !account.active && account.approvalStatus === newStatus) return { ok: true };
        const now = Date.now(), timestampIso = new Date(now).toISOString();
        const decisionRef = db.collection('access_decisions').doc();
        const decision = {
          id: decisionRef.id, action, newStatus, targetUserId: targetId,
          targetName: person.name, targetLogin: person.login || '',
          adminId: actor.id, adminName: req.sessionUser.name,
          accessLevel: account.accessLevel, permissoesPaginas: account.permissoesPaginas || [],
          reason, timestampIso, timestampFormatted: new Date(now).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }),
        };
        const reactivationAllowed = action === 'SUSPENDER' && account.active && account.approvalStatus === 'APROVADO';
        tx.update(targetRef, {
          active: reactivate, approvalStatus: newStatus, reactivationAllowed,
          ...(reactivate ? {} : { accessRevokedAt: Math.max(now, Number(account.accessRevokedAt || 0) + 1) }),
          ...(action === 'EXCLUIR' ? { removedAtIso: timestampIso } : {}),
        });
        tx.create(decisionRef, decision);
        tx.create(db.collection('audit_logs').doc(), { actorId: actor.id, targetId, action: 'DECISAO_LIBERACAO_USO_' + action, atIso: timestampIso });
        return { ok: true, decision };
      });
      res.json(result);
    } catch (error) { next(error); }
  };
  app.post('/api/cloud/admin/access-requests/:userId/decision', guard, adminGuard, accountAction());
  app.delete('/api/cloud/admin/users/:userId', guard, adminGuard, accountAction('EXCLUIR'));

  const modules = [
    { name: 'customer-covers', page: 'fretes_ativos', initial: () => ({ customerCovers: [], auditLogs: [] }), mount: (r: any, s: any) => registerCustomerCovers(r, guard, s, () => {}) },
    { name: 'rh-external', page: 'solicitacoes', initial: () => ({ clients: [], services: [], requests: [], keys: {}, events: {} }), mount: (r: any, s: any) => registerExternalRh(r, guard, undefined, s, process.env.RODOVAR_RH_BILLING_PROVIDER === 'C6_BANK' ? 'C6 Bank' : undefined) },
    { name: 'drivers', page: '', initial: () => ({ drivers: [], driverAudit: [], accessPolicy: {} }), mount: (r: any, s: any, users: any[]) => registerDrivers(r, guard, adminGuard, { ...s, accessPolicy: { protectedAdminUid: users.find(u => u.accessLevel === 'ADMINISTRADOR')?.id } }, () => {}) },
    { name: 'finance', page: 'financeiro', initial: () => ({ freights: [], intents: [], receipts: [], history: [], stagedShares: [] }), mount: (r: any, s: any) => withPaymentStore(s, () => registerPaymentReceiptRoutes(r, guard, () => {}, { remote: true })) },
    { name: 'agenda', page: 'agenda', initial: () => ({ events: [], notifications: [], imported: true, keys: {} }), mount: (r: any, s: any, users: any[]) => registerAgenda(r, guard, () => users, s) },
    { name: 'mural', page: 'comunicados', initial: () => ({ announcements: [], notifications: [], keys: {}, audit: [], imported: true }), mount: (r: any, s: any, users: any[]) => registerMural(r, guard, { users, mural: s }, () => {}, [], true) },
    { name: 'requests', page: 'solicitacoes', initial: () => ({ requests: [], notifications: [], keys: {} }), mount: (r: any, s: any, users: any[]) => registerRequestQueue(r, guard, () => users, [], s) },
    { name: 'polls', page: 'comunicados', initial: () => ({ polls: [] }), mount: (r: any, s: any) => registerPolls(r, guard, '', s.polls) },
  ];
  const capture = (mount: (r: any) => void) => {
    const routes: any[] = [], registry: any = { use() {}, locals: {} };
    for (const method of ['get', 'post', 'put', 'delete', 'patch']) registry[method] = (path: string, ...handlers: any[]) => { if (path.startsWith('/api/')) routes.push({ method, path, handlers: handlers.filter(h => h !== guard) }); };
    mount(registry); return routes;
  };
  for (const module of modules) {
    const routes = capture(r => module.mount(r, module.initial(), []));
    for (const route of routes) (app as any)[route.method](route.path.replace('/api/', '/api/cloud/'), guard, async (req: any, res: any, next: any) => {
      try {
        if (module.page && !hasPagePermission(req.sessionUser, module.page)) { res.status(403).json({ error: 'Módulo não autorizado.' }); return; }
        if (route.path.endsWith('/import')) { res.status(403).json({ error: 'Importação de dados locais desabilitada na homologação.' }); return; }
        if (module.name === 'rh-external' && !canAccessExternalRh(req.sessionUser)) { res.status(403).json({ error: 'Acesso exclusivo ao RH.' }); return; }
        const receiptUpload = module.name === 'finance' && route.path === '/api/pagamentos/comprovantes';
        if (receiptUpload && !req.is('application/json')) { res.status(415).json({ error: 'Use o envio de comprovantes pela interface do Financeiro.' }); return; }
        const corporateFiles = ['mural', 'agenda', 'rh-external', 'customer-covers'].includes(module.name);
        if (/\/shared-staging(\/|$)/.test(route.path) || route.path.endsWith('/document') || (!corporateFiles && module.name !== 'requests' && !receiptUpload && JSON.stringify(req.body || {}).includes('data:'))) {
          res.status(503).json({ error: 'Armazenamento de anexos ainda não configurado. Nenhuma alteração foi salva.', code: 'STORAGE_NOT_CONFIGURED' }); return;
        }
        const mutation = req.method !== 'GET', rawKey = String(req.headers['x-idempotency-key'] || '');
        if (mutation && !/^[A-Za-z0-9_-]{1,128}$/.test(rawKey)) { res.status(400).json({ error: 'Identificador do envio obrigatório.' }); return; }
        const keyRef = db.collection('operation_keys').doc(hash(`${req.sessionUser.id}:${req.method}:${req.path}:${rawKey}`));
        const fingerprint = hash(JSON.stringify(req.body || {}));
        const result = await db.runTransaction(async tx => {
          const assets = moduleAssets(tx, db, 'module:' + module.name);
          rejectAssetReferences(req.body);
          const users = await cloudDirectory(db, tx), actor = users.find((u: any) => u.id === req.sessionUser.id);
          if (!actor?.active || actor.approvalStatus !== 'APROVADO' || (module.page && !hasPagePermission(actor, module.page))) fail('Conta sem autorização para este módulo.', 403);
          if (module.name === 'rh-external' && !canAccessExternalRh(actor)) fail('Acesso exclusivo ao RH.', 403);
          if (mutation && module.name === 'finance' && !canConfirmFreightPayment(actor)) fail('Alterações financeiras restritas ao Financeiro autorizado.', 403);
          if (mutation) {
            const previous = await tx.get(keyRef);
            if (previous.exists) {
              if (previous.data()!.fingerprint !== fingerprint) fail('Identificador reutilizado com dados diferentes.', 409);
              return assets.decode(previous.data()!.response);
            }
          }
          const ref = db.collection('portal_modules').doc(module.name), snapshot = await tx.get(ref);
          const state: any = snapshot.exists ? snapshot.data()! : module.initial();
          const before = JSON.stringify(state);
          const blockedFinancialFreights = new Set<string>();
          if (module.name === 'finance') {
            const freights = await tx.get(db.collection('freight_operations').limit(501));
            if (freights.size > 500) fail('Consulta financeira excedeu o limite da homologação.');
            for (const freight of freights.docs) {
              const index = state.freights.findIndex((f: any) => f.id === freight.id);
              const operational = financialProjection(freight.data() as any, undefined, true);
              const existing = state.freights[index];
              if (!operational || (existing && (existing.valorTotal !== operational.valorTotal ||
                  existing.valorAdiantamento !== operational.valorAdiantamento || existing.valorSaldo !== operational.valorSaldo))) {
                blockedFinancialFreights.add(freight.id);
              }
              const projected = operational && (existing ? financialProjection(freight.data() as any, existing, true) : operational);
              if (projected) { if (index < 0) state.freights.push(projected); else state.freights[index] = projected; }
            }
          }
          const handler = capture(r => module.mount(r, state, users)).find(r => r.method === route.method && r.path === route.path);
          let status = 200, response: any;
          const out: any = { setHeader() {}, status(n: number) { status = n; return out; }, sendStatus(n: number) { response = { status: n, body: { error: 'Operação não autorizada.' } }; return out; }, json(body: any) { response = { status, body: clean(body) }; return out; } };
          let upload: { recordId: string; name: string; bytes: Buffer } | undefined;
          const readReceipt = (receipt: PaymentReceiptRecord) => readPrivateFile(tx, db, {
            freightId: receipt.freightId, storageName: receipt.storageFileName,
            sizeBytes: receipt.sizeBytes, mimeType: receipt.mimeType,
          });
          const request = {
            storeModuleFile: (bytes: Buffer, mime: string) => assets.store(bytes, mime),
            async sendModuleFile(file: any) {
              if (!file.privateAsset) fail('O arquivo precisa ser enviado novamente pelo módulo.', 404);
              response = { file: await assets.read(file.privateAsset), fileName: file.name, mimeType: file.mimeType };
            },
            isPaymentFreightBlocked: (freightId: string) => blockedFinancialFreights.has(freightId),
            savePaymentReceipt(receipt: PaymentReceiptRecord, bytes: Buffer) {
              upload = { recordId: receipt.freightId, name: receipt.storageFileName, bytes };
            },
            readPaymentReceipt: readReceipt,
            async sendPaymentReceipt(receipt: PaymentReceiptRecord) {
              response = { file: await readReceipt(receipt), fileName: receipt.originalFileName, mimeType: receipt.mimeType };
            },
            saveRequestAttachment(recordId: string, attachment: RequestAttachment, bytes: Buffer) {
              upload = { recordId, name: 'rdoc-' + attachment.id, bytes };
            },
            async sendRequestAttachment(recordId: string, attachment: RequestAttachment) {
              const file = await readPrivateFile(tx, db, {
                freightId: recordId, storageName: 'rdoc-' + attachment.id,
                sizeBytes: attachment.size, mimeType: attachment.mimeType,
              });
              response = { file, fileName: attachment.name, mimeType: attachment.mimeType };
            },
            body: req.body, query: req.query, params: req.params, headers: req.headers, sessionUser: actor, ip: req.ip, method: req.method, path: req.path };
          const execute = async (i: number): Promise<void> => {
            if (!handler.handlers[i] || response) return;
            let advance = false;
            await handler.handlers[i](request, out, (error?: any) => { if (error) throw error; advance = true; });
            if (advance) await execute(i + 1);
          };
          if (module.name === 'finance') await withPaymentStore(state as any, () => execute(0)); else await execute(0);
          if (!response) fail('Resposta do módulo indisponível.');
          if (!response.file) response.body = presentOfficialNames(response.body,
            new Map(users.map((person: any) => [person.id, person.name])));
          if (response.file || response.status < 400) {
            const encodedState = assets.encode(state);
            const encodedResponse = response.file ? response : assets.encode(response);
            const output = response.file ? response : await assets.decode(encodedResponse);
            if (assets.hasUploads && upload) fail('Envie os arquivos em operações separadas.', 400);
            await assets.persist();
            if (upload) await writePrivateFiles(tx, db, upload.recordId, upload, []);
            const after = JSON.stringify(encodedState);
            if (Buffer.byteLength(after) > 850000) fail('O módulo atingiu o limite de homologação. Nenhum registro foi apagado; é necessário particionar a persistência.');
            if (after !== before) tx.set(ref, clean(encodedState));
            if (mutation) {
              tx.create(keyRef, { fingerprint, actorId: actor.id, response: encodedResponse, atIso: new Date().toISOString() });
              tx.create(db.collection('audit_logs').doc(), { actorId: actor.id, action: `${req.method} ${req.path}`, atIso: new Date().toISOString() });
            }
            return output;
          }
          return response;
        });
        if (result.file) {
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
}

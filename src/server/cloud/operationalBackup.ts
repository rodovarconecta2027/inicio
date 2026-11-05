import { createHash } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { actorOf, requireAdmin, requireProtectedAdmin } from './protectedAdmin.js';

const fail = (message: string, status = 400): never => { throw Object.assign(Error(message), {status}); };
const canonical = (value: any): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.keys(item).sort().map(key => [key,item[key]])) : item);
const sha = (text: string) => createHash('sha256').update(text).digest('hex');

function parseBackup(serialized: unknown) {
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized) > MAX_EXPORT_BYTES) return fail('Selecione uma exportação operacional de até 2 MB.');
  let backup: any;
  try { backup = JSON.parse(serialized); } catch { return fail('Arquivo JSON inválido.'); }
  const names = ['freights','freightDetails','events','announcements','requests'];
  if (backup?.format !== 'rodovar-homologation-operations' || backup.schemaVersion !== 1 || !backup.collections ||
      names.some(name => !Array.isArray(backup.collections[name]) || backup.collections[name].length > 1000 || backup.collections[name].length !== backup.totals?.[name])) return fail('Formato ou totais do backup inválidos.');
  for (const name of names) {
    const ids = new Set();
    for (const row of backup.collections[name]) {
      if (!row || !/^[A-Za-z0-9_-]{1,128}$/.test(row.id) || ids.has(row.id) || (name.startsWith('freight') && (!row.record || typeof row.record !== 'object' || Array.isArray(row.record)))) return fail('Registros ou identificadores inválidos.');
      ids.add(row.id);
    }
  }
  return {backup,sha256:sha(serialized)};
}

const MAX_FREIGHTS = 500;
const MAX_EXPORT_BYTES = 2 * 1024 * 1024;
const binaryKeys = new Set(['dataUrl', 'binary', 'fileBuffer', 'relativePath', 'storagePath', 'absolutePath']);

function records(snapshot: DocumentSnapshot, field: string): unknown[] {
  if (!snapshot.exists) return [];
  const value = snapshot.data()?.[field];
  if (!Array.isArray(value)) {
    throw Object.assign(new Error('Uma coleção operacional está inconsistente. A exportação foi cancelada.'), { status: 409 });
  }
  return value;
}

export function registerOperationalBackup(app: Express, guard: RequestHandler, db: Firestore) {
  for (const action of ['preview','restore']) app.post('/api/cloud/admin/backups/operations/' + action, guard, async (req, res, next) => {
    try {
      const actor = actorOf(req);
      if (actor.accessLevel !== 'ADMINISTRADOR') throw requireAdmin();
      const {backup,sha256} = parseBackup(req.body?.serialized);
      const result = await db.runTransaction(async tx => {
        await requireProtectedAdmin(tx,db,actor);
        const exported = await tx.get(db.collection('audit_logs').where('sha256','==',sha256).limit(1));
        if (exported.docs[0]?.data().action !== 'OPERATIONS_BACKUP_EXPORTED') return fail('O arquivo não corresponde a uma exportação desta homologação.',404);
        const keyRef = db.collection('operation_keys').doc('backup_restore_' + sha(actor.id + ':' + sha256 + ':' + String(req.body?.planHash || '')));
        if (action === 'restore') {
          const previous = await tx.get(keyRef);
          if (previous.exists) return previous.data()!.response;
        }
        const [freights,details,agenda,mural,requests,sequence] = await Promise.all([
          tx.get(db.collection('freight_operations').limit(501)),tx.get(db.collection('freight_details').limit(501)),
          tx.get(db.collection('portal_modules').doc('agenda')),tx.get(db.collection('portal_modules').doc('mural')),
          tx.get(db.collection('portal_modules').doc('requests')),tx.get(db.collection('system_settings').doc('freight_sequence')),
        ]);
        if (freights.size > 500 || details.size > 500) return fail('Volume acima do limite de restauração desta homologação.',409);
        const current: Record<string,Map<string,any>> = {
          freights:new Map(freights.docs.map(doc=>[doc.id,doc.data()])),freightDetails:new Map(details.docs.map(doc=>[doc.id,doc.data()])),
          events:new Map(records(agenda,'events').map((row:any)=>[row.id,row])),announcements:new Map(records(mural,'announcements').map((row:any)=>[row.id,row])),
          requests:new Map(records(requests,'requests').map((row:any)=>[row.id,row])),
        };
        const missing: Record<string,any[]> = {}, conflicts: Record<string,number> = {}, unchanged: Record<string,number> = {};
        const protocols = new Set(freights.docs.map(doc=>doc.data().protocol));
        for (const name of Object.keys(current)) {
          missing[name]=[];conflicts[name]=0;unchanged[name]=0;
          for (const row of backup.collections[name]) {
            const data = name.startsWith('freight') ? row.record : row, live = current[name].get(row.id);
            if (live) { if(canonical(live)===canonical(data)) unchanged[name]++; else conflicts[name]++; }
            else if(name==='freights' && protocols.has(data.protocol)) conflicts[name]++;
            else missing[name].push(row);
          }
        }
        const total = Object.values(missing).reduce((n,rows)=>n+rows.length,0);
        const planHash = sha(canonical({sha256,missing,conflicts,unchanged,current:Object.fromEntries(Object.entries(current).map(([name,map])=>[name,[...map.entries()]]))}));
        const plan = {sha256,planHash,missing:Object.fromEntries(Object.entries(missing).map(([key,rows])=>[key,rows.length])),conflicts,unchanged,canRestore:total>0&&total<=440,total};
        if(action==='preview') return plan;
        if(req.body?.confirmation!=='RESTORE_MISSING_RECORDS' || req.body?.planHash!==planHash) return fail('Os dados mudaram ou a prévia não foi confirmada. Confira uma nova prévia.',409);
        if(total>440) return fail('Esta restauração excede o limite de 440 registros ausentes por operação. Nenhum registro foi alterado.',409);
        const moduleChanges: {snapshot:DocumentSnapshot;field:string;rows:any[]}[] = [
          {snapshot:agenda,field:'events',rows:missing.events},{snapshot:mural,field:'announcements',rows:missing.announcements},
          {snapshot:requests,field:'requests',rows:missing.requests},
        ];
        const moduleState = (snapshot:DocumentSnapshot) => snapshot.exists ? snapshot.data()! : {notifications:[],keys:{},audit:[],imported:true};
        for (const {snapshot,field,rows} of moduleChanges) {
          if(!rows.length)continue;
          const data = {...moduleState(snapshot),[field]:[...records(snapshot,field),...rows]};
          if(Buffer.byteLength(JSON.stringify(data))>850000) return fail('O módulo excederia o limite de persistência. Nenhum registro foi alterado.',409);
        }
        for (const row of missing.freights) tx.create(db.collection('freight_operations').doc(row.id),row.record);
        for (const row of missing.freightDetails) {
          if(!current.freights.has(row.id)&&!missing.freights.some(f=>f.id===row.id)) return fail('Há um histórico sem frete correspondente. Restauração cancelada.',409);
          tx.create(db.collection('freight_details').doc(row.id),row.record);
        }
        for (const {snapshot,field,rows} of moduleChanges) if(rows.length) tx.set(snapshot.ref,{...moduleState(snapshot),[field]:[...records(snapshot,field),...rows]});
        if(missing.freights.length) {
          const last = Math.max(Number(sequence.data()?.lastNumber||0),Number(backup.lastFreightNumber||0));
          if(!Number.isSafeInteger(last)||last<0) return fail('Contador de fretes inválido.',409);
          tx.set(sequence.ref,{...sequence.data(),lastNumber:last});
        }
        const response = {ok:true,restored:plan.missing,conflicts,restoredAtIso:new Date().toISOString()};
        tx.create(keyRef,{response});
        tx.create(db.collection('audit_logs').doc(),{actorId:actor.id,action:'OPERATIONS_BACKUP_RESTORED_MISSING',sha256,totals:plan.missing,conflicts,atIso:response.restoredAtIso});
        return response;
      });
      res.json(result);
    } catch(error) { next(error); }
  });
  app.post('/api/cloud/admin/backups/operations/export', guard, async (req, res, next) => {
    try {
      const actor = actorOf(req);
      if (actor.accessLevel !== 'ADMINISTRADOR') throw requireAdmin();
      const serialized = await db.runTransaction(async tx => {
        await requireProtectedAdmin(tx, db, actor);
        const modules = db.collection('portal_modules');
        const [freights, details, agenda, mural, queue, sequence] = await Promise.all([
          tx.get(db.collection('freight_operations').limit(MAX_FREIGHTS + 1)),
          tx.get(db.collection('freight_details').limit(MAX_FREIGHTS + 1)),
          tx.get(modules.doc('agenda')),
          tx.get(modules.doc('mural')),
          tx.get(modules.doc('requests')),
          tx.get(db.collection('system_settings').doc('freight_sequence')),
        ]);
        if (freights.size > MAX_FREIGHTS || details.size > MAX_FREIGHTS) {
          throw Object.assign(new Error('O volume de fretes excede o limite de exportação desta homologação. Nenhum arquivo parcial foi gerado.'), { status: 409 });
        }
        const collections = {
          freights: freights.docs.map(doc => ({ id: doc.id, record: doc.data() })),
          freightDetails: details.docs.map(doc => ({ id: doc.id, record: doc.data() })),
          events: records(agenda, 'events'),
          announcements: records(mural, 'announcements'),
          requests: records(queue, 'requests'),
        };
        const totals = Object.fromEntries(Object.entries(collections).map(([key, value]) => [key, value.length]));
        const exportedAtIso = new Date().toISOString();
        const backup = {
          format: 'rodovar-homologation-operations', schemaVersion: 1,
          exportedAtIso, scope: Object.keys(collections), totals,
          lastFreightNumber: sequence.data()?.lastNumber ?? null,
          collections,
        };
        const json = JSON.stringify(backup, (key, value) => {
          if (binaryKeys.has(key) || (typeof value === 'string' && /^data:[^,]*;base64,/i.test(value))) return undefined;
          return value;
        });
        if (Buffer.byteLength(json, 'utf8') > MAX_EXPORT_BYTES) {
          throw Object.assign(new Error('O arquivo excede o limite de exportação de 2 MB. Nenhum arquivo parcial foi gerado.'), { status: 409 });
        }
        tx.create(db.collection('audit_logs').doc(), {
          actorId: actor.id, action: 'OPERATIONS_BACKUP_EXPORTED', atIso: exportedAtIso,
          totals, sha256: createHash('sha256').update(json).digest('hex'),
        });
        return json;
      });
      res.type('application/json').attachment('rodovar-homologacao-operacoes.json').send(serialized);
    } catch (error) { next(error); }
  });

  app.post('/api/cloud/admin/backups/operations/validate', guard, async (req, res, next) => {
    try {
      const actor = actorOf(req);
      if (actor.accessLevel !== 'ADMINISTRADOR') throw requireAdmin();
      const sha256 = req.body?.sha256;
      if (typeof sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(sha256)) {
        res.status(400).json({ error: 'Código de integridade inválido.' });
        return;
      }
      const match = await db.runTransaction(async tx => {
        await requireProtectedAdmin(tx, db, actor);
        const found = await tx.get(db.collection('audit_logs').where('sha256', '==', sha256).limit(1));
        const record = found.docs[0]?.data();
        return record?.action === 'OPERATIONS_BACKUP_EXPORTED' ? record : null;
      });
      if (!match) {
        res.status(404).json({ error: 'O arquivo não corresponde a uma exportação operacional desta homologação.' });
        return;
      }
      res.json({ ok: true, exportedAtIso: match.atIso, totals: match.totals });
    } catch (error) { next(error); }
  });
}

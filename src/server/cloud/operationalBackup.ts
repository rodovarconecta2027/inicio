import { createHash } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { DocumentSnapshot, Firestore } from 'firebase-admin/firestore';
import { actorOf, requireAdmin, requireProtectedAdmin } from './protectedAdmin.js';

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

import crypto from 'node:crypto';
import type { Firestore } from 'firebase-admin/firestore';

const fail = (message: string, status = 409): never => { throw Object.assign(new Error(message), { status }); };
type FreightDocument = { id: string; protocol: string; revision: number; createdAtIso: string; [field: string]: unknown };
type Operation = { actorId: string; key: string; fingerprint: string };
function operationId(operation: Operation) {
  if (typeof operation.actorId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(operation.actorId) ||
      typeof operation.key !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(operation.key) ||
      typeof operation.fingerprint !== 'string' || !operation.fingerprint || operation.fingerprint.length > 256) {
    fail('Identificador de envio obrigatório e conteúdo da operação são necessários.', 400);
  }
  return crypto.createHash('sha256').update(JSON.stringify([operation.actorId, operation.key])).digest('hex');
}

/**
 * Persistence adapter only. The caller MUST reuse the operational engine's
 * authorization and validation before invoking it. It never infers approval,
 * marks a payment or advances a freight stage by itself.
 */
export class FirestoreFreightStore {
  constructor(private readonly db: Firestore) {}

  async create(operation: Operation, build: (identity: { id: string; protocol: string; createdAtIso: string }) => Record<string, unknown>) {
    const opId = operationId(operation);
    const keyRef = this.db.collection('operation_keys').doc(opId);
    const sequenceRef = this.db.collection('system_settings').doc('freight_sequence');
    const ref = this.db.collection('freight_operations').doc();
    return this.db.runTransaction(async tx => {
      const previous = await tx.get(keyRef);
      if (previous.exists) {
        if (previous.data()!.fingerprint !== operation.fingerprint) fail('Este envio já foi usado com outros dados.');
        return previous.data()!.result as FreightDocument;
      }
      const sequence = await tx.get(sequenceRef);
      const current = sequence.data()?.lastNumber;
      // A migration must explicitly initialize the counter from existing RDVs.
      // Never silently restart numbering when the counter is absent.
      if (!Number.isSafeInteger(current) || current < 0 || current >= Number.MAX_SAFE_INTEGER) fail('A sequência RDV ainda não foi provisionada pelo administrador.', 503);
      const protocol = `RDV-${current + 1}`, createdAtIso = new Date().toISOString();
      const identity = { id: ref.id, protocol, createdAtIso };
      const result: FreightDocument = { ...build(identity), ...identity, revision: 1 };
      tx.create(ref, result);
      tx.update(sequenceRef, { lastNumber: current + 1 });
      tx.create(keyRef, { actorId: operation.actorId, fingerprint: operation.fingerprint, targetId: ref.id, result });
      tx.create(this.db.collection('audit_logs').doc(), { actorId: operation.actorId, targetId: ref.id, action: 'FREIGHT_CREATED', atIso: createdAtIso });
      return result;
    });
  }

  async update(id: string, expectedRevision: number, operation: Operation,
    applyValidatedChange: (current: Readonly<FreightDocument>) => Record<string, unknown>) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id) || !Number.isSafeInteger(expectedRevision)) fail('Frete ou revisão inválida.', 400);
    const opId = operationId(operation);
    const keyRef = this.db.collection('operation_keys').doc(opId);
    const ref = this.db.collection('freight_operations').doc(id);
    return this.db.runTransaction(async tx => {
      const previous = await tx.get(keyRef);
      if (previous.exists) {
        if (previous.data()!.targetId !== id || previous.data()!.fingerprint !== operation.fingerprint) fail('Este envio já foi usado com outros dados.');
        return previous.data()!.result as FreightDocument;
      }
      const snapshot = await tx.get(ref);
      if (!snapshot.exists) fail('Frete não encontrado.', 404);
      const current = snapshot.data() as FreightDocument;
      if (current.revision !== expectedRevision) fail('O frete foi atualizado. Recarregue os dados antes de continuar.');
      const changed = applyValidatedChange(structuredClone(current));
      if ((changed.id !== undefined && changed.id !== id) ||
          (changed.protocol !== undefined && changed.protocol !== current.protocol) ||
          (changed.createdAtIso !== undefined && changed.createdAtIso !== current.createdAtIso)) fail('A identificação original do frete deve ser preservada.', 400);
      const atIso = new Date().toISOString();
      const result = { ...current, ...changed, id, protocol: current.protocol, createdAtIso: current.createdAtIso, revision: current.revision + 1 };
      tx.set(ref, result);
      tx.create(keyRef, { actorId: operation.actorId, fingerprint: operation.fingerprint, targetId: id, result });
      tx.create(this.db.collection('audit_logs').doc(), { actorId: operation.actorId, targetId: id, action: 'FREIGHT_UPDATED', atIso });
      return result;
    });
  }
}

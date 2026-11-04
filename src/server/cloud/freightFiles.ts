import { createHash } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';
import type { UnifiedFreightAttachment } from '../../types';
import { PREVIEW_FREIGHT_FILE_LIMIT } from '../../lib/freightFileLimits.js';

const CHUNK_SIZE = 512 * 1024;
const STORAGE_LIMIT = 128 * 1024 * 1024;
const mimeTypes = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp']);

const hash = (data: Buffer) => createHash('sha256').update(data).digest('hex');
const fail = (message: string, status: number): never => { throw Object.assign(new Error(message), { status }); };

export function validateFreightUpload(dataUrl: unknown) {
  if (typeof dataUrl !== 'string') return fail('Selecione um arquivo PDF, PNG, JPEG ou WebP.', 400);
  const header = /^data:(application\/(?:pdf|octet-stream)|image\/(?:png|jpeg|webp));base64,/.exec(dataUrl);
  if (!header) return fail('Selecione um arquivo PDF, PNG, JPEG ou WebP.', 400);
  const data = dataUrl.slice(header[0].length);
  if (data.length > Math.ceil(PREVIEW_FREIGHT_FILE_LIMIT / 3) * 4) return fail('O arquivo excede o limite de 3 MB da homologação.', 413);
  const decoded = Buffer.from(data, 'base64');
  if (decoded.length < 8 || decoded.length > PREVIEW_FREIGHT_FILE_LIMIT || decoded.toString('base64') !== data) {
    return fail('Arquivo inválido ou acima do limite de 3 MB.', 400);
  }
}

function fileRef(db: Firestore, name: string) {
  if (typeof name !== 'string' || !/^fdoc-[A-Za-z0-9_.-]{1,200}$/.test(name)) return fail('Arquivo privado indisponível.', 404);
  return db.collection('freight_private_files').doc(name);
}

export async function writeFreightFiles(
  tx: Transaction, db: Firestore, freightId: string,
  upload: { name: string; bytes: Buffer } | undefined, removed: UnifiedFreightAttachment[],
) {
  if (!upload && !removed.length) return;
  const usageRef = db.collection('system_settings').doc('freight_file_usage');
  const refs = removed.map(att => fileRef(db, att.storageName));
  const [usage, ...files] = await tx.getAll(usageRef, ...refs);
  let bytes = Number(usage.data()?.bytes ?? 0);
  if (!Number.isSafeInteger(bytes) || bytes < 0) return fail('A capacidade de arquivos precisa ser reconciliada.', 409);
  const pendingDeletes: { ref: typeof usageRef; parts: number }[] = [];
  for (const snapshot of files) {
    if (!snapshot.exists) continue; // Older metadata can point to local files only.
    const info = snapshot.data()!;
    if (info.freightId !== freightId || !validSize(info.size, info.parts)) return fail('Metadados do arquivo privado inconsistentes.', 409);
    bytes -= info.size;
    pendingDeletes.push({ ref: snapshot.ref, parts: info.parts });
  }
  if (upload) bytes += upload.bytes.length;
  if (bytes < 0) return fail('A capacidade de arquivos precisa ser reconciliada.', 409);
  if (bytes > STORAGE_LIMIT) return fail('Capacidade de anexos da homologação atingida.', 409);
  for (const { ref, parts } of pendingDeletes) {
    for (let i = 0; i < parts; i++) tx.delete(ref.collection('freight_file_parts').doc(String(i)));
    tx.delete(ref);
  }
  if (upload) {
    const ref = fileRef(db, upload.name);
    const parts = Math.ceil(upload.bytes.length / CHUNK_SIZE);
    tx.create(ref, { freightId, size: upload.bytes.length, sha256: hash(upload.bytes), parts });
    for (let i = 0; i < parts; i++) {
      tx.create(ref.collection('freight_file_parts').doc(String(i)), { bytes: upload.bytes.subarray(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE) });
    }
  }
  tx.set(usageRef, { bytes });
}

function validSize(size: number, parts: number) {
  return Number.isSafeInteger(size) && size > 0 && size <= PREVIEW_FREIGHT_FILE_LIMIT && parts === Math.ceil(size / CHUNK_SIZE);
}

export async function requireFreightFile(tx: Transaction, db: Firestore, att: UnifiedFreightAttachment) {
  const ref = fileRef(db, att.storageName);
  const info = (await tx.get(ref)).data();
  if (!info || info.freightId !== att.freightId || !validSize(info.size, info.parts) || info.size !== att.sizeBytes || !mimeTypes.has(att.mimeType)) {
    return fail('Arquivo privado não encontrado. Envie novamente o documento.', 404);
  }
  return { ref, info };
}

export async function readFreightFile(tx: Transaction, db: Firestore, att: UnifiedFreightAttachment) {
  const { ref, info } = await requireFreightFile(tx, db, att);
  const chunks = await tx.getAll(...Array.from({ length: info.parts }, (_, i) => ref.collection('freight_file_parts').doc(String(i))));
  const bytes = chunks.map(chunk => chunk.data()?.bytes);
  if (!bytes.every(Buffer.isBuffer)) return fail('Arquivo incompleto. Envie novamente o documento.', 409);
  const data = Buffer.concat(bytes);
  if (data.length !== info.size || hash(data) !== info.sha256) return fail('O arquivo não passou na verificação de integridade.', 409);
  return data;
}

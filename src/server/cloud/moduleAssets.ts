import { createHash } from 'node:crypto';
import type { Firestore, Transaction } from 'firebase-admin/firestore';

const MAX_FILE = 3 * 1024 * 1024;
const CHUNK = 512 * 1024;
const CAPACITY = 128 * 1024 * 1024;
const marker = '$rodovarPrivateFile';
const digest = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const fail = (message: string, status = 400): never => { throw Object.assign(Error(message), { status }); };
export interface AssetRef { scope: string; id: string; size: number; mime: string; sha256: string }

export function rejectAssetReferences(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  if (marker in value || 'privateAsset' in value) fail('Referência privada não pode ser fornecida pelo cliente.');
  for (const child of Object.values(value)) rejectAssetReferences(child);
}

export function validateAsset(bytes: Buffer, mime: string) {
  if (!bytes.length || bytes.length > MAX_FILE) fail('Cada arquivo deve ter até 3 MB na homologação.', 413);
  const starts = (value: string) => bytes.subarray(0, value.length).toString() === value;
  const officeZip = ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(mime);
  const valid = mime === 'application/pdf' ? starts('%PDF-')
    : mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : mime === 'image/webp' ? starts('RIFF') && bytes.subarray(8, 12).toString() === 'WEBP'
    : officeZip ? bytes[0] === 80 && bytes[1] === 75 && bytes[2] === 3 && bytes[3] === 4
    : ['application/msword', 'application/vnd.ms-excel'].includes(mime) ? bytes.subarray(0, 8).equals(Buffer.from([208, 207, 17, 224, 161, 177, 26, 225]))
    : ['audio/webm', 'video/webm'].includes(mime) ? bytes.subarray(0, 4).equals(Buffer.from([26,69,223,163]))
    : ['audio/mp4', 'video/mp4'].includes(mime) ? bytes.subarray(4, 8).toString() === 'ftyp'
    : ['audio/ogg', 'video/ogg'].includes(mime) ? starts('OggS')
    : ['audio/wav', 'audio/x-wav'].includes(mime) ? starts('RIFF') && bytes.subarray(8, 12).toString() === 'WAVE'
    : mime === 'audio/mpeg' ? starts('ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224)
    : false;
  if (!valid) fail('O conteúdo do arquivo não corresponde ao formato permitido.');
}

export function parseAssetDataUrl(value: unknown) {
  const match = typeof value === 'string' && /^data:([^;,]+)(?:;codecs=[^;,]+)?;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length > Math.ceil(MAX_FILE / 3) * 4) return fail('Envie um arquivo válido de até 3 MB.', 413);
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.toString('base64') !== match[2]) return fail('Arquivo base64 inválido.');
  validateAsset(bytes, match[1]);
  return { bytes, mime: match[1] };
}

/** Files never enter module documents or idempotency responses as base64. Access is
 * mediated by the original module handler before the response is materialized. */
export function moduleAssets(tx: Transaction, db: Firestore, scope: string) {
  const uploads = new Map<string, { ref: AssetRef; bytes: Buffer }>();
  const cache = new Map<string, Buffer>();
  const store = (bytes: Buffer, mime: string): AssetRef => {
    validateAsset(bytes, mime);
    const sha256 = digest(bytes), id = digest(scope + ':' + mime + ':' + sha256);
    const ref = { scope, id, size: bytes.length, mime, sha256 };
    uploads.set(id, { ref, bytes }); cache.set(id, bytes);
    return ref;
  };
  const read = async (ref: AssetRef) => {
    if (!ref || ref.scope !== scope || !/^[a-f0-9]{64}$/.test(ref.id) || !/^[a-f0-9]{64}$/.test(ref.sha256) || !Number.isSafeInteger(ref.size) || ref.size < 1 || ref.size > MAX_FILE) fail('Arquivo privado inválido.', 404);
    const cached = cache.get(ref.id); if (cached) return cached;
    const file = db.collection('portal_private_assets').doc(ref.id);
    const info = (await tx.get(file)).data();
    if (!info || info.scope !== scope || info.size !== ref.size || info.mime !== ref.mime || info.sha256 !== ref.sha256 || info.parts !== Math.ceil(ref.size / CHUNK)) return fail('Arquivo privado indisponível.', 404);
    const parts = await tx.getAll(...Array.from({ length: info.parts }, (_, i) => file.collection('parts').doc(String(i))));
    const chunks = parts.map(p => p.data()?.bytes);
    if (!chunks.every(Buffer.isBuffer)) fail('Arquivo privado incompleto.', 409);
    const bytes = Buffer.concat(chunks);
    if (bytes.length !== ref.size || digest(bytes) !== ref.sha256) fail('A integridade do arquivo não pôde ser confirmada.', 409);
    cache.set(ref.id, bytes); return bytes;
  };
  const encode = (value: any, field = ''): any => {
    if (typeof value === 'string' && /^(dataUrl|coverImage|bannerImage|avatar|image|imageUrl)$/.test(field) && value.startsWith('data:')) {
      const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
      if (!match || match[2].length > Math.ceil(MAX_FILE / 3) * 4) return fail('Arquivo inválido ou acima de 3 MB.', 413);
      const bytes = Buffer.from(match[2], 'base64');
      if (bytes.toString('base64') !== match[2]) fail('Arquivo base64 inválido.');
      return { [marker]: store(bytes, match[1]) };
    }
    if (Array.isArray(value)) return value.map(child => encode(child));
    if (value && typeof value === 'object') {
      if (marker in value) return value;
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, encode(child, key)]));
    }
    return value;
  };
  const decode = async (value: any): Promise<any> => {
    if (Array.isArray(value)) return Promise.all(value.map(decode));
    if (value && typeof value === 'object') {
      if (marker in value) {
        const ref = value[marker] as AssetRef;
        return `data:${ref.mime};base64,${(await read(ref)).toString('base64')}`;
      }
      return Object.fromEntries(await Promise.all(Object.entries(value).filter(([key]) => key !== 'privateAsset').map(async ([key, child]) => [key, await decode(child)])));
    }
    return value;
  };
  const persist = async () => {
    if (!uploads.size) return;
    const usageRef = db.collection('system_settings').doc('freight_file_usage');
    const snapshots = await tx.getAll(usageRef, ...[...uploads.keys()].map(id => db.collection('portal_private_assets').doc(id)));
    const used = Number(snapshots[0].data()?.bytes || 0);
    if (!Number.isSafeInteger(used) || used < 0) fail('A capacidade de arquivos precisa ser reconciliada.', 409);
    const pending = [...uploads.values()].filter((upload, i) => {
      const existing = snapshots[i + 1].data();
      if (!existing) return true;
      if (existing.scope !== scope || existing.sha256 !== upload.ref.sha256 || existing.mime !== upload.ref.mime || existing.size !== upload.ref.size) fail('Metadados privados inconsistentes.', 409);
      return false;
    });
    const total = used + pending.reduce((sum, upload) => sum + upload.bytes.length, 0);
    if (total > CAPACITY) fail('Capacidade de arquivos da homologação atingida.', 409);
    for (const { ref, bytes } of pending) {
      const doc = db.collection('portal_private_assets').doc(ref.id), parts = Math.ceil(bytes.length / CHUNK);
      tx.create(doc, { ...ref, parts });
      for (let i = 0; i < parts; i++) tx.create(doc.collection('parts').doc(String(i)), { bytes: bytes.subarray(i * CHUNK, (i + 1) * CHUNK) });
    }
    if (pending.length) tx.set(usageRef, { bytes: total });
  };
  return { store, read, encode, decode, persist, get hasUploads() { return uploads.size > 0; } };
}

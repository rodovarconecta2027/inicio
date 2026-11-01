import {financialProjection} from './financialProjection';
import {subscribeUnifiedFinance,unifiedFinanceFreights} from './unifiedFreightEngine';
import { Express, Request, Response } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  Employee,
  FreightDocumentFile,
  FreightRecord,
  PaymentAuditEventType,
  PaymentAuditHistoryEntry,
  PaymentInstallmentType,
  PaymentIntentRecord,
  PaymentReceiptOrigin,
  PaymentReceiptRecord,
  PaymentVerificationStatus,
  UserRole,
} from '../types';
import { INITIAL_FREIGHTS, formatFileSize } from '../lib/freightDatabase';
import {
  canAccessFinanceiroFreights,
  canConfirmFreightPayment,
} from '../lib/permissions';
import { formatSaoPauloDateTime } from './unifiedFreightEngine';

const ROOT_DIR = (process.env.RODOVAR_DATA_ROOT || process.cwd());
const PAYMENT_STORE_DIR = path.join(ROOT_DIR, 'data', 'payment-store');
const PAYMENT_RECEIPTS_DIR = path.join(ROOT_DIR, 'data', 'payment-receipts');

const FREIGHTS_FILE = path.join(PAYMENT_STORE_DIR, 'freights.json');
const INTENTS_FILE = path.join(PAYMENT_STORE_DIR, 'intents.json');
const RECEIPTS_FILE = path.join(PAYMENT_STORE_DIR, 'receipts.json');
const HISTORY_FILE = path.join(PAYMENT_STORE_DIR, 'history.json');
const STAGED_SHARES_FILE = path.join(PAYMENT_STORE_DIR, 'staged-shares.json');

export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024; // 10 MB conforme especificação
export const DEFAULT_INTENT_VALIDITY_MINUTES = 30;

export interface StagedShareTargetRecord {
  id: string;
  createdAtIso: string;
  expiresAtMs: number;
  textOnly: boolean;
  sharedTitle?: string;
  sharedText?: string;
  sharedUrl?: string;
  fileName?: string;
  mimeType?: 'application/pdf' | 'image/jpeg' | 'image/png';
  sizeBytes?: number;
  fileBase64?: string;
  errorMessage?: string;
}

interface PaymentStoreState {
  freights: FreightRecord[];
  intents: PaymentIntentRecord[];
  receipts: PaymentReceiptRecord[];
  history: PaymentAuditHistoryEntry[];
  stagedShares: StagedShareTargetRecord[];
}

const paymentStoreState: PaymentStoreState = {
  freights: [],
  intents: [],
  receipts: [],
  history: [],
  stagedShares: [],
};

function ensureDirectories(): void {
  if (!fs.existsSync(PAYMENT_STORE_DIR)) {
    fs.mkdirSync(PAYMENT_STORE_DIR, { recursive: true });
  }
  if (!fs.existsSync(PAYMENT_RECEIPTS_DIR)) {
    fs.mkdirSync(PAYMENT_RECEIPTS_DIR, { recursive: true });
  }
}

function createSamplePdfBuffer(title: string, subtitle: string): Buffer {
  const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 595 842] /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length 160 >> stream
BT
/F1 16 Tf
50 770 Td
(RODOVAR CONECTA - ${title.replace(/[()\\]/g, '')}) Tj
/F1 12 Tf
0 -28 Td
(${subtitle.replace(/[()\\]/g, '')}) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000229 00000 n 
0000000297 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
510
%%EOF`;
  return Buffer.from(content, 'utf8');
}

export function validatePaymentReceiptBinary(
  buf: Buffer,
  originalFileName?: string
): {
  valid: boolean;
  mimeType?: 'application/pdf' | 'image/jpeg' | 'image/png';
  extension?: 'pdf' | 'jpg' | 'png';
  error?: string;
  code?: string;
} {
  if (!buf || buf.length === 0) {
    return {
      valid: false,
      error: 'O arquivo de comprovante enviado está vazio.',
      code: 'EMPTY_FILE',
    };
  }

  if (buf.length > MAX_RECEIPT_BYTES) {
    return {
      valid: false,
      error: 'O arquivo excede o tamanho máximo permitido de 10 MB.',
      code: 'FILE_TOO_LARGE',
    };
  }

  const lowerName = String(originalFileName || '').toLowerCase();
  if (
    lowerName.endsWith('.svg') ||
    lowerName.endsWith('.exe') ||
    lowerName.endsWith('.bat') ||
    lowerName.endsWith('.sh') ||
    lowerName.endsWith('.js') ||
    lowerName.endsWith('.html')
  ) {
    return {
      valid: false,
      error: 'Formato de arquivo não permitido. Envie apenas PDF, JPEG ou PNG.',
      code: 'INVALID_FILE_TYPE',
    };
  }

  // Check for SVG or HTML/Script disguise in first 512 bytes
  const headText = buf.subarray(0, Math.min(512, buf.length)).toString('utf8').toLowerCase();
  if (headText.includes('<svg') || headText.includes('<script') || headText.includes('<!doctype html')) {
    return {
      valid: false,
      error: 'Conteúdo de arquivo rejeitado por segurança. Envie apenas PDF, JPEG ou PNG.',
      code: 'INVALID_FILE_TYPE',
    };
  }

  // 1. PDF magic bytes: %PDF- (25 50 44 46 2D)
  if (
    buf.length >= 5 &&
    buf[0] === 0x25 &&
    buf[1] === 0x50 &&
    buf[2] === 0x44 &&
    buf[3] === 0x46 &&
    buf[4] === 0x2d
  ) {
    return {
      valid: true,
      mimeType: 'application/pdf',
      extension: 'pdf',
    };
  }

  // 2. PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return {
      valid: true,
      mimeType: 'image/png',
      extension: 'png',
    };
  }

  // 3. JPEG magic bytes: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return {
      valid: true,
      mimeType: 'image/jpeg',
      extension: 'jpg',
    };
  }

  return {
    valid: false,
    error: 'Tipo real do arquivo inválido. O servidor aceita apenas comprovantes em PDF, JPEG ou PNG.',
    code: 'INVALID_FILE_TYPE',
  };
}

function savePaymentStore(): void {
  ensureDirectories();
  fs.writeFileSync(FREIGHTS_FILE, JSON.stringify(paymentStoreState.freights, null, 2), 'utf8');
  fs.writeFileSync(INTENTS_FILE, JSON.stringify(paymentStoreState.intents, null, 2), 'utf8');
  fs.writeFileSync(RECEIPTS_FILE, JSON.stringify(paymentStoreState.receipts, null, 2), 'utf8');
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(paymentStoreState.history, null, 2), 'utf8');
  fs.writeFileSync(STAGED_SHARES_FILE, JSON.stringify(paymentStoreState.stagedShares, null, 2), 'utf8');
}

function enrichFreightWithReceipts(freight: FreightRecord): FreightRecord {
  const freightReceipts = paymentStoreState.receipts.filter((r) => r.freightId === freight.id);
  const freightHistory = paymentStoreState.history.filter((h) => h.freightId === freight.id);

  // Latest active receipt for each installment
  const latestAdiantamento = freightReceipts.find((r) => r.installmentType === 'ADIANTAMENTO');
  const latestSaldo = freightReceipts.find((r) => r.installmentType === 'SALDO');

  const adiantamentoVerificacaoStatus: PaymentVerificationStatus =
    freight.adiantamentoPago
      ? 'PAGAMENTO_CONFIRMADO'
      : latestAdiantamento
        ? latestAdiantamento.verificationStatus
        : freight.adiantamentoVerificacaoStatus || 'SEM_COMPROVANTE';

  const saldoVerificacaoStatus: PaymentVerificationStatus =
    freight.saldoPago
      ? 'PAGAMENTO_CONFIRMADO'
      : latestSaldo
        ? latestSaldo.verificationStatus
        : freight.saldoVerificacaoStatus || 'SEM_COMPROVANTE';

  const docs = { ...freight.docs };
  if (latestAdiantamento) {
    docs.comprovanteAdiantamento = {
      id: latestAdiantamento.id,
      type: 'COMPROVANTE_ADIANTAMENTO',
      label: 'Comprovante de Adiantamento',
      fileName: latestAdiantamento.originalFileName,
      mimeType: latestAdiantamento.mimeType,
      sizeLabel: latestAdiantamento.sizeLabel,
      uploadedAt: latestAdiantamento.serverCreatedAtFormatted,
      uploadedBy: latestAdiantamento.uploadedByUserName,
      dataUrl: latestAdiantamento.downloadUrl,
    };
  }
  if (latestSaldo) {
    docs.comprovanteSaldo = {
      id: latestSaldo.id,
      type: 'COMPROVANTE_SALDO',
      label: 'Comprovante de Saldo',
      fileName: latestSaldo.originalFileName,
      mimeType: latestSaldo.mimeType,
      sizeLabel: latestSaldo.sizeLabel,
      uploadedAt: latestSaldo.serverCreatedAtFormatted,
      uploadedBy: latestSaldo.uploadedByUserName,
      dataUrl: latestSaldo.downloadUrl,
    };
  }

  return {
    ...freight,
    docs,
    adiantamentoVerificacaoStatus,
    adiantamentoComprovanteId: latestAdiantamento?.id || freight.adiantamentoComprovanteId,
    saldoVerificacaoStatus,
    saldoComprovanteId: latestSaldo?.id || freight.saldoComprovanteId,
    comprovantesList: freightReceipts,
    historicoPagamentos: freightHistory,
  };
}

function loadOrSeedPaymentStore(): void {
  ensureDirectories();

  let loadedFreights: FreightRecord[] | null = null;
  if (fs.existsSync(FREIGHTS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(FREIGHTS_FILE, 'utf8'));
      if (Array.isArray(parsed) && parsed.length > 0) {
        loadedFreights = parsed;
      }
    } catch {
      loadedFreights = null;
    }
  }

  if (fs.existsSync(INTENTS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(INTENTS_FILE, 'utf8'));
      if (Array.isArray(parsed)) paymentStoreState.intents = parsed;
    } catch {
      paymentStoreState.intents = [];
    }
  }

  if (fs.existsSync(RECEIPTS_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(RECEIPTS_FILE, 'utf8'));
      if (Array.isArray(parsed)) paymentStoreState.receipts = parsed;
    } catch {
      paymentStoreState.receipts = [];
    }
  }

  if (fs.existsSync(HISTORY_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
      if (Array.isArray(parsed)) paymentStoreState.history = parsed;
    } catch {
      paymentStoreState.history = [];
    }
  }

  if (fs.existsSync(STAGED_SHARES_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(STAGED_SHARES_FILE, 'utf8'));
      if (Array.isArray(parsed)) paymentStoreState.stagedShares = parsed;
    } catch {
      paymentStoreState.stagedShares = [];
    }
  }

  if (!loadedFreights) {
    paymentStoreState.freights = INITIAL_FREIGHTS.map((f) => ({
      ...f,
      adiantamentoVerificacaoStatus: f.adiantamentoPago ? 'PAGAMENTO_CONFIRMADO' : 'SEM_COMPROVANTE',
      saldoVerificacaoStatus: f.saldoPago ? 'PAGAMENTO_CONFIRMADO' : 'SEM_COMPROVANTE',
    }));

    // Seed initial confirmed receipt binaries on disk so existing freights (#0841, #0840, #0839) have real downloadable files
    for (const f of paymentStoreState.freights) {
      if (f.docs.comprovanteAdiantamento) {
        const doc = f.docs.comprovanteAdiantamento;
        const storageFileName = `seed-${f.id}-adiantamento.pdf`;
        const absPath = path.join(PAYMENT_RECEIPTS_DIR, storageFileName);
        const pdfBuf = createSamplePdfBuffer(
          `Comprovante de Adiantamento ${f.code}`,
          `Favorecido: ${f.favorecido} - Valor: R$ ${f.valorAdiantamento.toFixed(2)}`
        );
        if (!fs.existsSync(absPath)) {
          fs.writeFileSync(absPath, pdfBuf);
        }
        const sha256Hash = crypto.createHash('sha256').update(pdfBuf).digest('hex');
        const receiptRecord: PaymentReceiptRecord = {
          id: doc.id,
          freightId: f.id,
          freightCode: f.code,
          installmentId: `${f.id}:ADIANTAMENTO`,
          installmentType: 'ADIANTAMENTO',
          title: 'Comprovante de Adiantamento',
          expectedAmountCentavos: Math.round(f.valorAdiantamento * 100),
          expectedAmountBRL: f.valorAdiantamento,
          favorecido: f.favorecido,
          uploadedByUserId: 'emp-7',
          uploadedByUserName: doc.uploadedBy || 'Financeiro RODOVAR',
          uploadedByUserEmail: 'petronio.santos@rodovar.com.br',
          originalFileName: doc.fileName,
          storageFileName,
          storageRelativePath: `data/payment-receipts/${storageFileName}`,
          mimeType: 'application/pdf',
          sizeBytes: pdfBuf.length,
          sizeLabel: doc.sizeLabel || formatFileSize(pdfBuf.length),
          sha256Hash,
          idempotencyKey: `seed-idem-${doc.id}`,
          origin: 'ANEXACAO_MANUAL',
          transactionCode: f.codigoTransacaoAdiantamento,
          uploadStatus: 'SALVO_NO_SERVIDOR',
          verificationStatus: 'PAGAMENTO_CONFIRMADO',
          verifiedByUserId: 'emp-7',
          verifiedByUserName: 'Petrônio Santos',
          verifiedAtIso: f.createdAtIso,
          verifiedAtFormatted: f.adiantamentoPagoEm || doc.uploadedAt,
          serverCreatedAtIso: f.createdAtIso,
          serverCreatedAtFormatted: doc.uploadedAt,
          downloadUrl: `/api/pagamentos/comprovantes/${doc.id}/download`,
        };
        if (!paymentStoreState.receipts.some((r) => r.id === receiptRecord.id)) {
          paymentStoreState.receipts.push(receiptRecord);
        }
      }

      if (f.docs.comprovanteSaldo) {
        const doc = f.docs.comprovanteSaldo;
        const storageFileName = `seed-${f.id}-saldo.pdf`;
        const absPath = path.join(PAYMENT_RECEIPTS_DIR, storageFileName);
        const pdfBuf = createSamplePdfBuffer(
          `Comprovante de Saldo ${f.code}`,
          `Favorecido: ${f.favorecido} - Valor: R$ ${f.valorSaldo.toFixed(2)}`
        );
        if (!fs.existsSync(absPath)) {
          fs.writeFileSync(absPath, pdfBuf);
        }
        const sha256Hash = crypto.createHash('sha256').update(pdfBuf).digest('hex');
        const receiptRecord: PaymentReceiptRecord = {
          id: doc.id,
          freightId: f.id,
          freightCode: f.code,
          installmentId: `${f.id}:SALDO`,
          installmentType: 'SALDO',
          title: 'Comprovante de Saldo',
          expectedAmountCentavos: Math.round(f.valorSaldo * 100),
          expectedAmountBRL: f.valorSaldo,
          favorecido: f.favorecido,
          uploadedByUserId: 'emp-7',
          uploadedByUserName: doc.uploadedBy || 'Financeiro RODOVAR',
          uploadedByUserEmail: 'petronio.santos@rodovar.com.br',
          originalFileName: doc.fileName,
          storageFileName,
          storageRelativePath: `data/payment-receipts/${storageFileName}`,
          mimeType: 'application/pdf',
          sizeBytes: pdfBuf.length,
          sizeLabel: doc.sizeLabel || formatFileSize(pdfBuf.length),
          sha256Hash,
          idempotencyKey: `seed-idem-${doc.id}`,
          origin: 'ANEXACAO_MANUAL',
          transactionCode: f.codigoTransacaoSaldo,
          uploadStatus: 'SALVO_NO_SERVIDOR',
          verificationStatus: 'PAGAMENTO_CONFIRMADO',
          verifiedByUserId: 'emp-7',
          verifiedByUserName: 'Petrônio Santos',
          verifiedAtIso: f.createdAtIso,
          verifiedAtFormatted: f.saldoPagoEm || doc.uploadedAt,
          serverCreatedAtIso: f.createdAtIso,
          serverCreatedAtFormatted: doc.uploadedAt,
          downloadUrl: `/api/pagamentos/comprovantes/${doc.id}/download`,
        };
        if (!paymentStoreState.receipts.some((r) => r.id === receiptRecord.id)) {
          paymentStoreState.receipts.push(receiptRecord);
        }
      }
    }

    savePaymentStore();
  } else {
    // Fix frete-0841 rule consistency if loaded from older store
    paymentStoreState.freights = loadedFreights.map((f) => {
      if (f.id === 'frete-0841' && f.regraTipo === 'INTEGRAL_100' && f.percentualSaldo === 30) {
        return {
          ...f,
          regraTipo: '70_30',
          regraLabel: '70% / 30%',
          status: f.saldoPago ? 'Pago' : 'Pendente Saldo',
        };
      }
      return f;
    });
  }
}

function appendPaymentAuditHistory(params: {
  freightId: string;
  freightCode: string;
  installmentType: PaymentInstallmentType;
  eventType: PaymentAuditEventType;
  actorId: string;
  actorName: string;
  actorRole: string;
  summary: string;
  receiptId?: string;
  intentId?: string;
  previousReceiptId?: string;
  amountBRL?: number;
}): PaymentAuditHistoryEntry {
  const sp = formatSaoPauloDateTime();
  const entry: PaymentAuditHistoryEntry = {
    id: `payhist-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    freightId: params.freightId,
    freightCode: params.freightCode,
    installmentType: params.installmentType,
    eventType: params.eventType,
    actorId: params.actorId,
    actorName: params.actorName,
    actorRole: params.actorRole,
    timestampIso: sp.iso,
    timestampFormatted: sp.formatted,
    summary: params.summary,
    receiptId: params.receiptId,
    intentId: params.intentId,
    previousReceiptId: params.previousReceiptId,
    amountBRL: params.amountBRL,
  };
  paymentStoreState.history.unshift(entry);
  return entry;
}

function sweepExpiredIntents(): boolean {
  const nowMs = Date.now();
  let mutated = false;
  for (const intent of paymentStoreState.intents) {
    if (intent.status === 'AGUARDANDO_COMPROVANTE') {
      const expMs = Date.parse(intent.expiresAtIso);
      if (!Number.isNaN(expMs) && nowMs >= expMs) {
        intent.status = 'EXPIRADA';
        appendPaymentAuditHistory({
          freightId: intent.freightId,
          freightCode: intent.freightCode,
          installmentType: intent.installmentType,
          eventType: 'INTENCAO_EXPIRADA',
          actorId: intent.responsibleUserId,
          actorName: intent.responsibleUserName,
          actorRole: 'Sistema',
          summary: `Intenção de pagamento (${intent.installmentType === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'}) expirou após ${intent.validityMinutes} min. Associação automática encerrada sem cancelar o frete.`,
          intentId: intent.id,
          amountBRL: intent.expectedAmountBRL,
        });
        mutated = true;
      }
    }
  }
  return mutated;
}

// Parse multipart/form-data buffer without external dependencies
export function parseMultipartFormData(
  bodyBuffer: Buffer,
  contentTypeHeader: string
): {
  fields: Record<string, string>;
  files: Array<{
    fieldName: string;
    fileName: string;
    contentType: string;
    data: Buffer;
  }>;
} {
  const fields: Record<string, string> = {};
  const files: Array<{
    fieldName: string;
    fileName: string;
    contentType: string;
    data: Buffer;
  }> = [];

  const boundaryMatch = contentTypeHeader.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!boundaryMatch) {
    return { fields, files };
  }
  const boundary = boundaryMatch[1] || boundaryMatch[2];
  const delimiter = Buffer.from(`--${boundary}`);
  const crlfDelimiter = Buffer.from(`\r\n--${boundary}`);
  const headerEndMarker = Buffer.from('\r\n\r\n');

  let pos = bodyBuffer.indexOf(delimiter);
  if (pos === -1) return { fields, files };
  pos += delimiter.length;

  while (pos < bodyBuffer.length) {
    // Check for final "--"
    if (bodyBuffer[pos] === 0x2d && bodyBuffer[pos + 1] === 0x2d) {
      break;
    }
    if (bodyBuffer[pos] === 0x0d && bodyBuffer[pos + 1] === 0x0a) {
      pos += 2;
    }

    const nextBoundaryPos = bodyBuffer.indexOf(crlfDelimiter, pos);
    if (nextBoundaryPos === -1) break;

    const partBuffer = bodyBuffer.subarray(pos, nextBoundaryPos);
    const headerEndPos = partBuffer.indexOf(headerEndMarker);
    if (headerEndPos !== -1) {
      const rawHeaders = partBuffer.subarray(0, headerEndPos).toString('utf8');
      const contentBuffer = partBuffer.subarray(headerEndPos + 4);

      const nameMatch = rawHeaders.match(/name="([^"]+)"/i);
      const fileNameMatch = rawHeaders.match(/filename="([^"]*)"/i);
      const ctMatch = rawHeaders.match(/Content-Type:\s*([^\r\n;]+)/i);

      const fieldName = nameMatch ? nameMatch[1] : 'file';
      if (fileNameMatch && fileNameMatch[1] !== '') {
        files.push({
          fieldName,
          fileName: fileNameMatch[1],
          contentType: ctMatch ? ctMatch[1].trim() : 'application/octet-stream',
          data: Buffer.from(contentBuffer),
        });
      } else {
        fields[fieldName] = contentBuffer.toString('utf8').trim();
      }
    }

    pos = nextBoundaryPos + crlfDelimiter.length;
  }

  return { fields, files };
}

function readRawRequestBody(req: Request, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', (err) => reject(err));
  });
}

export function registerPaymentReceiptRoutes(
  app: Express,
  requireApprovedSession: any,
  appendServerAuditLog: (
    actorId: string,
    actorName: string,
    actorRole: UserRole | 'ANONIMO',
    action: string,
    details: string,
    ip?: string
  ) => void
): void {
  loadOrSeedPaymentStore();
  const syncUnified=(freight:any)=>{
    const index=paymentStoreState.freights.findIndex(f=>f.id===freight.id);
    const projected=financialProjection(freight,index<0?undefined:paymentStoreState.freights[index]);
    if(!projected)return;
    if(index>=0&&JSON.stringify(projected)===JSON.stringify(paymentStoreState.freights[index]))return;
    if(index<0)paymentStoreState.freights.push(projected);else paymentStoreState.freights[index]=projected;
    savePaymentStore();
  };
  unifiedFinanceFreights().forEach(syncUnified);
  subscribeUnifiedFinance(syncUnified);

  function requireFinanceiroPermission(req: any, res: Response): Employee | null {
    const user = req.sessionUser as Employee | undefined;
    if (!user || user.approvalStatus !== 'APROVADO' || user.active === false) {
      res.status(403).json({
        error: 'Sua conta não está aprovada ou ativa para acessar operações financeiras.',
        code: 'ACCOUNT_NOT_APPROVED',
      });
      return null;
    }
    if (!canAccessFinanceiroFreights(user)) {
      res.status(403).json({
        error: 'Acesso negado. Você não possui permissão para o módulo Financeiro de Pagamentos.',
        code: 'FORBIDDEN_FINANCEIRO',
      });
      return null;
    }
    return user;
  }

  // --------------------------------------------------------------------------
  // 1. WEB SHARE TARGET FALLBACK ROUTE: POST /receber-comprovante
  // (Handles Android Web Share Target POST if Service Worker did not intercept or on direct POST)
  // --------------------------------------------------------------------------
  app.post('/receber-comprovante', async (req: Request, res: Response) => {
    try {
      const contentType = String(req.headers['content-type'] || '');
      let staged: StagedShareTargetRecord;
      const shareId = `srvshare-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const nowIso = new Date().toISOString();

      if (contentType.toLowerCase().includes('multipart/form-data')) {
        const rawBuf = await readRawRequestBody(req, MAX_RECEIPT_BYTES + 2 * 1024 * 1024);
        const parsed = parseMultipartFormData(rawBuf, contentType);
        const fileItem = parsed.files[0];

        if (fileItem && fileItem.data.length > 0) {
          const validation = validatePaymentReceiptBinary(fileItem.data, fileItem.fileName);
          if (!validation.valid || !validation.mimeType) {
            staged = {
              id: shareId,
              createdAtIso: nowIso,
              expiresAtMs: Date.now() + 30 * 60 * 1000,
              textOnly: false,
              fileName: fileItem.fileName,
              errorMessage: validation.error || 'Arquivo inválido.',
            };
          } else {
            staged = {
              id: shareId,
              createdAtIso: nowIso,
              expiresAtMs: Date.now() + 30 * 60 * 1000,
              textOnly: false,
              sharedTitle: parsed.fields.title || parsed.fields.titulo || '',
              sharedText: parsed.fields.text || parsed.fields.texto || '',
              sharedUrl: parsed.fields.url || '',
              fileName: fileItem.fileName,
              mimeType: validation.mimeType,
              sizeBytes: fileItem.data.length,
              fileBase64: fileItem.data.toString('base64'),
            };
          }
        } else {
          // Requirement 3: "Se o banco compartilhar apenas texto ou link, informar que o arquivo não foi recebido, não baixar links externos automaticamente e oferecer anexação manual."
          staged = {
            id: shareId,
            createdAtIso: nowIso,
            expiresAtMs: Date.now() + 30 * 60 * 1000,
            textOnly: true,
            sharedTitle: parsed.fields.title || parsed.fields.titulo || '',
            sharedText: parsed.fields.text || parsed.fields.texto || '',
            sharedUrl: parsed.fields.url || '',
          };
        }
      } else {
        // URL-encoded or JSON fallback
        const body = req.body || {};
        staged = {
          id: shareId,
          createdAtIso: nowIso,
          expiresAtMs: Date.now() + 30 * 60 * 1000,
          textOnly: true,
          sharedTitle: String(body.title || ''),
          sharedText: String(body.text || ''),
          sharedUrl: String(body.url || ''),
        };
      }

      // Clean expired staged shares
      paymentStoreState.stagedShares = paymentStoreState.stagedShares.filter(
        (s) => s.expiresAtMs > Date.now()
      );
      paymentStoreState.stagedShares.unshift(staged);
      savePaymentStore();

      // If client explicitly wants JSON (e.g. automated test or API caller), return JSON; otherwise 303 redirect to SPA route
      if (String(req.headers.accept || '').includes('application/json') || req.query.format === 'json') {
        res.status(200).json({
          ok: true,
          shareId: staged.id,
          redirectUrl: `/receber-comprovante?shared=1&serverShareId=${staged.id}`,
          textOnly: staged.textOnly,
          fileName: staged.fileName,
          mimeType: staged.mimeType,
          sizeBytes: staged.sizeBytes,
          errorMessage: staged.errorMessage,
          notice: staged.textOnly
            ? 'O aplicativo do banco compartilhou apenas texto ou link externo. O arquivo do comprovante não foi recebido e links externos não são baixados automaticamente. Por favor, anexe o PDF ou imagem manualmente.'
            : undefined,
        });
        return;
      }

      res.redirect(303, `/receber-comprovante?shared=1&serverShareId=${staged.id}`);
    } catch (err: any) {
      if (err?.message === 'PAYLOAD_TOO_LARGE') {
        res.status(413).json({
          error: 'O arquivo compartilhado excede o limite máximo de 10 MB.',
          code: 'FILE_TOO_LARGE',
        });
        return;
      }
      res.redirect(303, `/receber-comprovante?shared=1&error=1`);
    }
  });

  // Retrieve server-staged share target payload
  app.get('/api/pagamentos/shared-staging/:shareId', (req: Request, res: Response) => {
    const shareId = String(req.params.shareId || '');
    const found = paymentStoreState.stagedShares.find(
      (s) => s.id === shareId && s.expiresAtMs > Date.now()
    );
    if (!found) {
      res.status(404).json({
        error: 'Compartilhamento temporário não encontrado ou expirado.',
        code: 'SHARE_NOT_FOUND',
      });
      return;
    }
    res.json({ ok: true, stagedShare: found });
  });

  // --------------------------------------------------------------------------
  // 2. LIST FREIGHTS, ACTIVE INTENTS & PAYMENT HISTORY
  // --------------------------------------------------------------------------
  app.get('/api/pagamentos/fretes', requireApprovedSession, (req: any, res: Response) => {
    const user = requireFinanceiroPermission(req, res);
    if (!user) return;

    if (sweepExpiredIntents()) {
      savePaymentStore();
    }

    const enrichedFreights = paymentStoreState.freights.map((f) => enrichFreightWithReceipts(f));
    const userActiveIntents = paymentStoreState.intents.filter(
      (i) => i.responsibleUserId === user.id && i.status === 'AGUARDANDO_COMPROVANTE'
    );

    res.json({
      ok: true,
      freights: enrichedFreights,
      activeIntents: userActiveIntents,
      canConfirmPayment: canConfirmFreightPayment(user),
    });
  });

  // Create or update a financial freight record (e.g. New Freight modal or Confirm Delivery)
  app.post('/api/pagamentos/fretes', requireApprovedSession, (req: any, res: Response) => {
    const user = requireFinanceiroPermission(req, res);
    if (!user) return;

    const incoming = req.body?.freight as FreightRecord | undefined;
    if (!incoming || !incoming.id || !incoming.code) {
      res.status(400).json({ error: 'Dados do frete inválidos.' });
      return;
    }

    const existingIdx = paymentStoreState.freights.findIndex((f) => f.id === incoming.id);
    if (existingIdx >= 0) {
      // Synchronization may not rewrite amounts, rules, receipts or bank-confirmed state.
      const current = paymentStoreState.freights[existingIdx];
      const immutable = ['valorTotal','valorAdiantamento','valorSaldo','regraTipo','percentualAdiantamento','percentualSaldo','adiantamentoPago','saldoPago','status'] as const;
      if (immutable.some(key => incoming[key] !== undefined && incoming[key] !== current[key])) {
        res.status(409).json({error:'O registro financeiro já existe. Valores e pagamentos devem ser tratados no fluxo autorizado.'});return;
      }
      res.status(200).json({ok:true,freight:enrichFreightWithReceipts(current)});return;
    }
    if (incoming.adiantamentoPago || incoming.saldoPago || incoming.status !== 'Pendente Adiantamento') {
      res.status(409).json({error:'Novas solicitações não podem registrar pagamento realizado.'});return;
    }
    const amounts=[incoming.valorTotal,incoming.valorAdiantamento,incoming.valorSaldo];
    if (amounts.some(value => !Number.isFinite(value) || value < 0) || incoming.valorTotal <= 0 || Math.round(incoming.valorTotal*100)!==Math.round(incoming.valorAdiantamento*100)+Math.round(incoming.valorSaldo*100) || incoming.percentualAdiantamento+incoming.percentualSaldo!==100) {
      res.status(400).json({error:'Valores ou percentuais financeiros inválidos.'});return;
    }
    const fresh={...incoming,adiantamentoPago:false,saldoPago:false,adiantamentoVerificacaoStatus:'SEM_COMPROVANTE' as const,saldoVerificacaoStatus:'SEM_COMPROVANTE' as const};
    for (const key of ['historicoPagamentos','comprovantesList','adiantamentoComprovanteId','saldoComprovanteId','adiantamentoConfirmadoPorId','saldoConfirmadoPorId','adiantamentoConfirmadoEm','saldoConfirmadoEm','codigoTransacaoAdiantamento','codigoTransacaoSaldo']) delete (fresh as any)[key];
    paymentStoreState.freights.unshift(fresh);
    savePaymentStore();

    res.status(201).json({
      ok: true,
      freight: enrichFreightWithReceipts(
        paymentStoreState.freights.find((f) => f.id === incoming.id)!
      ),
    });
  });

  app.put('/api/pagamentos/fretes/:freightId', requireApprovedSession, (req: any, res: Response) => {
    const user = requireFinanceiroPermission(req, res);
    if (!user) return;

    const freightId = String(req.params.freightId || '');
    const existingIdx = paymentStoreState.freights.findIndex((f) => f.id === freightId);
    if (existingIdx === -1) {
      res.status(404).json({ error: 'Frete não encontrado.' });
      return;
    }

    const patch = req.body || {};
    const current = paymentStoreState.freights[existingIdx];

    if (patch.status === 'Pago' && current.status !== 'Pago') {
      res.status(409).json({error:'A confirmação de pagamento exige o fluxo bancário autorizado.'});return;
    }
    // Prevent unverified automatic payment confirmation via generic PUT
    const updated: FreightRecord = {
      ...current,
      entregaConfirmada:
        typeof patch.entregaConfirmada === 'boolean'
          ? patch.entregaConfirmada
          : current.entregaConfirmada,
      entregaConfirmadaEm: patch.entregaConfirmadaEm ?? current.entregaConfirmadaEm,
      status: patch.status ?? current.status,
      observacoes: patch.observacoes ?? current.observacoes,
      docs: patch.docs ? { ...current.docs, ...patch.docs } : current.docs,
    };

    paymentStoreState.freights[existingIdx] = updated;
    savePaymentStore();

    res.json({
      ok: true,
      freight: enrichFreightWithReceipts(updated),
    });
  });

  // --------------------------------------------------------------------------
  // 3. PREPARE PAYMENT INTENT ("Preparar pagamento")
  // Requirement 2: Creates a payment intent linked to authenticated user with 30-min default TTL
  // --------------------------------------------------------------------------
  app.post('/api/pagamentos/intencoes', requireApprovedSession, (req: any, res: Response) => {
    const user = requireFinanceiroPermission(req, res);
    if (!user) return;

    if (sweepExpiredIntents()) {
      savePaymentStore();
    }

    const { freightId, installmentType, validityMinutes, validitySeconds } = req.body || {};
    const normalizedType: PaymentInstallmentType | null =
      installmentType === 'ADIANTAMENTO' || installmentType === 'SALDO' ? installmentType : null;

    if (!freightId || !normalizedType) {
      res.status(400).json({
        error: 'Informe o frete e a parcela (ADIANTAMENTO ou SALDO) para preparar o pagamento.',
        code: 'INVALID_INTENT_PARAMS',
      });
      return;
    }

    const freight = paymentStoreState.freights.find((f) => f.id === String(freightId));
    if (!freight) {
      res.status(404).json({
        error: 'Frete não encontrado.',
        code: 'FREIGHT_NOT_FOUND',
      });
      return;
    }

    const expectedAmountBRL =
      normalizedType === 'ADIANTAMENTO' ? freight.valorAdiantamento : freight.valorSaldo;
    const expectedAmountCentavos = Math.round(expectedAmountBRL * 100);

    if (expectedAmountCentavos <= 0) {
      res.status(400).json({
        error: `A parcela ${normalizedType === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'} possui valor R$ 0,00 neste frete.`,
        code: 'ZERO_INSTALLMENT_AMOUNT',
      });
      return;
    }

    // If the exact same user already has an active intent for the exact same freight + installment, cancel/supersede it cleanly
    for (const existing of paymentStoreState.intents) {
      if (
        existing.responsibleUserId === user.id &&
        existing.freightId === freight.id &&
        existing.installmentType === normalizedType &&
        existing.status === 'AGUARDANDO_COMPROVANTE'
      ) {
        existing.status = 'CANCELADA';
      }
    }

    const mins =
      typeof validityMinutes === 'number' && validityMinutes > 0
        ? Math.min(180, validityMinutes)
        : DEFAULT_INTENT_VALIDITY_MINUTES;

    const ttlMs =
      typeof validitySeconds === 'number'
        ? validitySeconds * 1000
        : mins * 60 * 1000;

    const nowDate = new Date();
    const expiresDate = new Date(nowDate.getTime() + ttlMs);
    const spNow = formatSaoPauloDateTime(nowDate);
    const spExp = formatSaoPauloDateTime(expiresDate);

    const intent: PaymentIntentRecord = {
      id: `pint-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      freightId: freight.id,
      freightCode: freight.code,
      installmentId: `${freight.id}:${normalizedType}`,
      installmentType: normalizedType,
      expectedAmountCentavos,
      expectedAmountBRL,
      favorecido: freight.favorecido,
      chavePix: freight.chavePix,
      banco: freight.banco,
      origem: freight.origem,
      destino: freight.destino,
      cliente: freight.cliente,
      responsibleUserId: user.id,
      responsibleUserName: user.name,
      responsibleUserEmail: user.email,
      createdAtIso: spNow.iso,
      createdAtFormatted: spNow.formatted,
      expiresAtIso: spExp.iso,
      expiresAtFormatted: spExp.formatted,
      validityMinutes: mins,
      status: 'AGUARDANDO_COMPROVANTE',
    };

    paymentStoreState.intents.unshift(intent);

    appendPaymentAuditHistory({
      freightId: freight.id,
      freightCode: freight.code,
      installmentType: normalizedType,
      eventType: 'INTENCAO_CRIADA',
      actorId: user.id,
      actorName: user.name,
      actorRole: user.roleTitle,
      summary: `Pagamento preparado para ${normalizedType === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'} (${expectedAmountBRL.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) — Aguardando comprovante até ${spExp.formatted}.`,
      intentId: intent.id,
      amountBRL: expectedAmountBRL,
    });

    appendServerAuditLog(
      user.id,
      user.name,
      user.accessLevel,
      'PREPARAR_PAGAMENTO_FRETE',
      `Intenção de pagamento ${intent.id} criada para o frete ${freight.code} (${normalizedType}) no valor de R$ ${expectedAmountBRL.toFixed(2)}.`,
      req.ip
    );

    savePaymentStore();

    res.status(201).json({
      ok: true,
      intent,
      guidance: 'Faça o pagamento no seu banco. Depois, compartilhe o comprovante com Rodovar Conecta.',
      disclaimer:
        'Preparar o pagamento não executa PIX, não acessa conta bancária e não significa pagamento realizado.',
    });
  });

  // --------------------------------------------------------------------------
  // 4. LIST ELIGIBLE PAYMENT INTENTS FOR AUTHENTICATED USER
  // Requirement 4: Determines 0, 1, or >1 eligible intents for the logged-in user
  // --------------------------------------------------------------------------
  app.get('/api/pagamentos/intencoes', requireApprovedSession, (req: any, res: Response) => {
    const user = requireFinanceiroPermission(req, res);
    if (!user) return;

    if (sweepExpiredIntents()) {
      savePaymentStore();
    }

    const eligibleIntents = paymentStoreState.intents.filter(
      (i) => i.responsibleUserId === user.id && i.status === 'AGUARDANDO_COMPROVANTE'
    );

    const recentUserIntents = paymentStoreState.intents
      .filter((i) => i.responsibleUserId === user.id)
      .slice(0, 20);

    res.json({
      ok: true,
      eligibleCount: eligibleIntents.length,
      associationMode:
        eligibleIntents.length === 1
          ? 'SINGLE_PREFILL'
          : eligibleIntents.length > 1
            ? 'MULTIPLE_CHOOSE'
            : 'MANUAL_SELECT',
      eligibleIntents,
      recentUserIntents,
    });
  });

  app.post(
    '/api/pagamentos/intencoes/:intentId/cancel',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = requireFinanceiroPermission(req, res);
      if (!user) return;

      const intentId = String(req.params.intentId || '');
      const intent = paymentStoreState.intents.find((i) => i.id === intentId);
      if (!intent) {
        res.status(404).json({ error: 'Intenção de pagamento não encontrada.' });
        return;
      }
      if (intent.responsibleUserId !== user.id && user.accessLevel !== 'ADMINISTRADOR') {
        res.status(403).json({
          error: 'Você não pode cancelar a intenção de pagamento de outro usuário.',
          code: 'FORBIDDEN_INTENT_OWNER',
        });
        return;
      }

      intent.status = 'CANCELADA';
      appendPaymentAuditHistory({
        freightId: intent.freightId,
        freightCode: intent.freightCode,
        installmentType: intent.installmentType,
        eventType: 'INTENCAO_CANCELADA',
        actorId: user.id,
        actorName: user.name,
        actorRole: user.roleTitle,
        summary: `Intenção de pagamento (${intent.installmentType === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'}) cancelada pelo usuário.`,
        intentId: intent.id,
        amountBRL: intent.expectedAmountBRL,
      });
      savePaymentStore();

      res.json({ ok: true, intent });
    }
  );

  // --------------------------------------------------------------------------
  // 5. UPLOAD & SAVE RECEIPT ON SERVER ("Conferir e salvar")
  // Requirement 5, 6, 7: Validates real file type (PDF/JPEG/PNG <= 10 MB), idempotency,
  // duplicate hash check, saves to private storage, sets status AGUARDANDO_CONFERENCIA
  // (never marks as Paid automatically!)
  // --------------------------------------------------------------------------
  app.post('/api/pagamentos/comprovantes', requireApprovedSession, async (req: any, res: Response) => {
    const user = requireFinanceiroPermission(req, res);
    if (!user) return;

    if (sweepExpiredIntents()) {
      savePaymentStore();
    }

    try {
      let freightId = '';
      let installmentTypeRaw = '';
      let intentId = '';
      let originRaw = '';
      let originalFileName = 'comprovante.pdf';
      let transactionCode = '';
      let observations = '';
      let isScheduledProof = false;
      let idempotencyKey = String(req.headers['x-idempotency-key'] || '').trim();
      let fileBuffer: Buffer | null = null;

      const contentType = String(req.headers['content-type'] || '');
      if (contentType.toLowerCase().includes('multipart/form-data')) {
        const rawBuf = await readRawRequestBody(req, MAX_RECEIPT_BYTES + 2 * 1024 * 1024);
        const parsed = parseMultipartFormData(rawBuf, contentType);
        freightId = String(parsed.fields.freightId || '');
        installmentTypeRaw = String(parsed.fields.installmentType || '');
        intentId = String(parsed.fields.intentId || '');
        originRaw = String(parsed.fields.origin || 'COMPARTILHAMENTO');
        transactionCode = String(parsed.fields.transactionCode || '');
        observations = String(parsed.fields.observations || '');
        isScheduledProof = parsed.fields.isScheduledProof === 'true';
        if (!idempotencyKey && parsed.fields.idempotencyKey) {
          idempotencyKey = String(parsed.fields.idempotencyKey).trim();
        }
        if (parsed.files[0]) {
          originalFileName = parsed.files[0].fileName || originalFileName;
          fileBuffer = parsed.files[0].data;
        }
      } else {
        const body = req.body || {};
        freightId = String(body.freightId || '');
        installmentTypeRaw = String(body.installmentType || '');
        intentId = String(body.intentId || '');
        originRaw = String(body.origin || 'ANEXACAO_MANUAL');
        originalFileName = String(body.fileName || originalFileName);
        transactionCode = String(body.transactionCode || '');
        observations = String(body.observations || '');
        isScheduledProof = Boolean(body.isScheduledProof);
        if (!idempotencyKey && body.idempotencyKey) {
          idempotencyKey = String(body.idempotencyKey).trim();
        }
        const rawBase64 = String(body.fileBase64 || body.dataUrl || '');
        if (rawBase64) {
          const cleanBase64 = rawBase64.includes(',') ? rawBase64.split(',')[1] : rawBase64;
          fileBuffer = Buffer.from(cleanBase64, 'base64');
        }
      }

      const installmentType: PaymentInstallmentType | null =
        installmentTypeRaw === 'ADIANTAMENTO' || installmentTypeRaw === 'SALDO'
          ? installmentTypeRaw
          : null;

      if (!freightId || !installmentType) {
        res.status(400).json({
          error: 'Selecione o frete e a parcela (Adiantamento ou Saldo) antes de salvar o comprovante.',
          code: 'MISSING_FREIGHT_OR_INSTALLMENT',
        });
        return;
      }

      const freightIdx = paymentStoreState.freights.findIndex((f) => f.id === freightId);
      if (freightIdx === -1) {
        res.status(404).json({
          error: 'Frete selecionado não foi encontrado no servidor.',
          code: 'FREIGHT_NOT_FOUND',
        });
        return;
      }
      const freight = paymentStoreState.freights[freightIdx];

      // If an intentId was provided, verify that the intent belongs to the logged-in user and matches the freight/installment
      let matchedIntent: PaymentIntentRecord | undefined;
      if (intentId) {
        matchedIntent = paymentStoreState.intents.find((i) => i.id === intentId);
        if (!matchedIntent) {
          res.status(400).json({
            error: 'A intenção de pagamento informada não existe.',
            code: 'INTENT_NOT_FOUND',
          });
          return;
        }
        // Requirement 7: "Se a conta tiver mudado, não reutilizar a intenção do usuário anterior."
        if (matchedIntent.responsibleUserId !== user.id) {
          res.status(403).json({
            error:
              'A intenção de pagamento pertence a outro usuário. Revalide o frete e a parcela com a sua conta atual.',
            code: 'INTENT_USER_MISMATCH',
          });
          return;
        }
        if (matchedIntent.status === 'EXPIRADA') {
          res.status(409).json({
            error:
              'A intenção de pagamento expirou. Confirme manualmente o frete e a parcela para salvar o comprovante.',
            code: 'INTENT_EXPIRED',
          });
          return;
        }
      }

      // Idempotency check: prevent duplicate creation on network retry
      if (idempotencyKey) {
        const existingIdempotent = paymentStoreState.receipts.find(
          (r) => r.idempotencyKey === idempotencyKey && r.uploadedByUserId === user.id
        );
        if (existingIdempotent) {
          res.status(200).json({
            ok: true,
            idempotentReplay: true,
            receipt: existingIdempotent,
            freight: enrichFreightWithReceipts(freight),
            message: 'Comprovante salvo no servidor (requisição idempotente confirmada).',
          });
          return;
        }
      } else {
        idempotencyKey = `idem-${user.id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      }

      if (!fileBuffer || fileBuffer.length === 0) {
        res.status(400).json({
          error: 'Nenhum arquivo de comprovante foi recebido. Anexe um PDF, JPEG ou PNG válido.',
          code: 'EMPTY_FILE',
        });
        return;
      }

      const validation = validatePaymentReceiptBinary(fileBuffer, originalFileName);
      if (!validation.valid || !validation.mimeType || !validation.extension) {
        const status = validation.code === 'FILE_TOO_LARGE' ? 413 : 400;
        res.status(status).json({
          error: validation.error || 'Arquivo inválido.',
          code: validation.code || 'INVALID_FILE_TYPE',
        });
        return;
      }

      // Compute SHA-256 hash to detect duplicate file uploads
      const sha256Hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
      const duplicateReceipt = paymentStoreState.receipts.find((r) => r.sha256Hash === sha256Hash);

      // Check if this freight + installment already has an attached receipt (for audit trail of replacement without silent overwrite)
      const previousInstallmentReceipt = paymentStoreState.receipts.find(
        (r) => r.freightId === freight.id && r.installmentType === installmentType
      );

      const receiptId = `rec-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      const safeStorageName = `comprovante-${freight.id}-${installmentType.toLowerCase()}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${validation.extension}`;
      const absStoragePath = path.join(PAYMENT_RECEIPTS_DIR, safeStorageName);

      fs.writeFileSync(absStoragePath, fileBuffer);

      const spNow = formatSaoPauloDateTime();
      const expectedAmountBRL =
        installmentType === 'ADIANTAMENTO' ? freight.valorAdiantamento : freight.valorSaldo;
      const expectedAmountCentavos = Math.round(expectedAmountBRL * 100);
      const origin: PaymentReceiptOrigin =
        originRaw === 'COMPARTILHAMENTO' ? 'COMPARTILHAMENTO' : 'ANEXACAO_MANUAL';

      // Auto-detect if filename or observations mention "agendamento"
      const scheduledDetected =
        isScheduledProof ||
        originalFileName.toLowerCase().includes('agendamento') ||
        observations.toLowerCase().includes('agendamento');

      const receiptRecord: PaymentReceiptRecord = {
        id: receiptId,
        freightId: freight.id,
        freightCode: freight.code,
        installmentId: `${freight.id}:${installmentType}`,
        installmentType,
        title:
          installmentType === 'ADIANTAMENTO'
            ? 'Comprovante de Adiantamento'
            : 'Comprovante de Saldo',
        expectedAmountCentavos,
        expectedAmountBRL,
        favorecido: freight.favorecido,
        uploadedByUserId: user.id,
        uploadedByUserName: user.name,
        uploadedByUserEmail: user.email,
        originalFileName: path.basename(originalFileName).replace(/[^\w.\-() ]+/g, '_'),
        storageFileName: safeStorageName,
        storageRelativePath: `data/payment-receipts/${safeStorageName}`,
        mimeType: validation.mimeType,
        sizeBytes: fileBuffer.length,
        sizeLabel: formatFileSize(fileBuffer.length),
        sha256Hash,
        idempotencyKey,
        origin,
        isScheduledProof: scheduledDetected,
        transactionCode: transactionCode || undefined,
        observations: observations || undefined,
        intentId: matchedIntent?.id,
        uploadStatus: 'SALVO_NO_SERVIDOR',
        verificationStatus: 'AGUARDANDO_CONFERENCIA',
        isDuplicateHashWarning: Boolean(duplicateReceipt),
        duplicateOfReceiptId: duplicateReceipt?.id,
        replacedReceiptId: previousInstallmentReceipt?.id,
        serverCreatedAtIso: spNow.iso,
        serverCreatedAtFormatted: spNow.formatted,
        downloadUrl: `/api/pagamentos/comprovantes/${receiptId}/download`,
      };

      paymentStoreState.receipts.unshift(receiptRecord);

      if (matchedIntent) {
        matchedIntent.status = 'COMPROVANTE_VINCULADO';
        matchedIntent.linkedReceiptId = receiptRecord.id;
      }

      // Update freight verification status to AGUARDANDO_CONFERENCIA (Requirement 6: Never mark as paid automatically!)
      if (installmentType === 'ADIANTAMENTO') {
        freight.adiantamentoVerificacaoStatus = 'AGUARDANDO_CONFERENCIA';
        freight.adiantamentoComprovanteId = receiptRecord.id;
        if (transactionCode) {
          freight.codigoTransacaoAdiantamento = transactionCode;
        }
      } else {
        freight.saldoVerificacaoStatus = 'AGUARDANDO_CONFERENCIA';
        freight.saldoComprovanteId = receiptRecord.id;
        if (transactionCode) {
          freight.codigoTransacaoSaldo = transactionCode;
        }
      }

      const eventType: PaymentAuditEventType = previousInstallmentReceipt
        ? 'COMPROVANTE_SUBSTITUIDO'
        : 'COMPROVANTE_ANEXADO';

      const scheduledNote = scheduledDetected
        ? ' [Atenção: Comprovante de Agendamento — exige conferência de liquidação]'
        : '';
      const duplicateNote = duplicateReceipt
        ? ` [Aviso: Hash de arquivo idêntico ao comprovante ${duplicateReceipt.id} (${duplicateReceipt.freightCode})]`
        : '';

      appendPaymentAuditHistory({
        freightId: freight.id,
        freightCode: freight.code,
        installmentType,
        eventType,
        actorId: user.id,
        actorName: user.name,
        actorRole: user.roleTitle,
        summary: `${previousInstallmentReceipt ? 'Comprovante substituído' : 'Comprovante anexado'} (${receiptRecord.title} — ${receiptRecord.originalFileName}) via ${origin === 'COMPARTILHAMENTO' ? 'compartilhamento do banco' : 'anexação manual'}. Situação: Aguardando conferência.${scheduledNote}${duplicateNote}`,
        receiptId: receiptRecord.id,
        intentId: matchedIntent?.id,
        previousReceiptId: previousInstallmentReceipt?.id,
        amountBRL: expectedAmountBRL,
      });

      appendServerAuditLog(
        user.id,
        user.name,
        user.accessLevel,
        eventType === 'COMPROVANTE_SUBSTITUIDO'
          ? 'SUBSTITUICAO_COMPROVANTE_PAGAMENTO'
          : 'UPLOAD_COMPROVANTE_PAGAMENTO',
        `Comprovante ${receiptRecord.id} (${receiptRecord.originalFileName}, ${receiptRecord.sizeLabel}) salvo no servidor para o frete ${freight.code} (${installmentType}). Status: AGUARDANDO_CONFERENCIA.`,
        req.ip
      );

      savePaymentStore();

      res.status(201).json({
        ok: true,
        receipt: receiptRecord,
        freight: enrichFreightWithReceipts(freight),
        message:
          'Comprovante salvo no servidor com sucesso. A parcela encontra-se Aguardando conferência.',
      });
    } catch (err: any) {
      if (err?.message === 'PAYLOAD_TOO_LARGE') {
        res.status(413).json({
          error: 'O arquivo excede o tamanho máximo permitido de 10 MB.',
          code: 'FILE_TOO_LARGE',
        });
        return;
      }
      res.status(500).json({
        error: 'Falha ao salvar o comprovante no servidor.',
        code: 'UPLOAD_FAILED',
      });
    }
  });

  // --------------------------------------------------------------------------
  // 6. CONFIRM PAYMENT SETTLEMENT ("Confirmar pagamento")
  // Requirement 6: Separates "Comprovante recebido / Aguardando conferência" from
  // "Pagamento confirmado por usuário autorizado" (requires 'financeiro_confirmar')
  // --------------------------------------------------------------------------
  app.post(
    '/api/pagamentos/comprovantes/:receiptId/confirmar',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = requireFinanceiroPermission(req, res);
      if (!user) return;

      if (!canConfirmFreightPayment(user)) {
        res.status(403).json({
          error:
            'Acesso negado. Apenas usuários com permissão de "Confirmar Liquidação de Pagamentos" (Coordenador Financeiro, Diretoria ou Administrador) podem confirmar a liquidação bancária.',
          code: 'FORBIDDEN_CONFIRM_PAYMENT',
        });
        return;
      }

      const receiptId = String(req.params.receiptId || '');
      const receipt = paymentStoreState.receipts.find((r) => r.id === receiptId);
      if (!receipt) {
        res.status(404).json({
          error: 'Comprovante não encontrado no servidor.',
          code: 'RECEIPT_NOT_FOUND',
        });
        return;
      }

      const freight = paymentStoreState.freights.find((f) => f.id === receipt.freightId);
      if (!freight) {
        res.status(404).json({
          error: 'Frete vinculado ao comprovante não foi encontrado.',
          code: 'FREIGHT_NOT_FOUND',
        });
        return;
      }

      const { transactionCode, acknowledgeScheduledProof } = req.body || {};

      // Requirement 6: "Comprovantes de agendamento também devem passar por conferência."
      if (receipt.isScheduledProof && !acknowledgeScheduledProof) {
        res.status(400).json({
          error:
            'Este arquivo foi identificado como comprovante de agendamento. Para confirmar a liquidação, ateste que a compensação bancária efetiva foi conferida no extrato.',
          code: 'SCHEDULED_PROOF_ACK_REQUIRED',
        });
        return;
      }

      const spNow = formatSaoPauloDateTime();
      receipt.verificationStatus = 'PAGAMENTO_CONFIRMADO';
      receipt.verifiedByUserId = user.id;
      receipt.verifiedByUserName = user.name;
      receipt.verifiedAtIso = spNow.iso;
      receipt.verifiedAtFormatted = spNow.formatted;
      if (transactionCode) {
        receipt.transactionCode = String(transactionCode).trim();
      }

      if (receipt.intentId) {
        const linkedIntent = paymentStoreState.intents.find((i) => i.id === receipt.intentId);
        if (linkedIntent) {
          linkedIntent.status = 'CONCLUIDA';
        }
      }

      if (receipt.installmentType === 'ADIANTAMENTO') {
        freight.adiantamentoPago = true;
        freight.adiantamentoPagoEm = spNow.formatted;
        freight.adiantamentoVerificacaoStatus = 'PAGAMENTO_CONFIRMADO';
        freight.adiantamentoConfirmadoPorId = user.id;
        freight.adiantamentoConfirmadoPorNome = user.name;
        freight.adiantamentoConfirmadoEm = spNow.formatted;
        if (receipt.transactionCode) {
          freight.codigoTransacaoAdiantamento = receipt.transactionCode;
        }

        const isIntegralNoBalance =
          freight.regraTipo === 'INTEGRAL_100' && freight.valorSaldo === 0;
        if (isIntegralNoBalance) {
          freight.saldoPago = true;
          freight.saldoPagoEm = spNow.formatted;
          freight.saldoVerificacaoStatus = 'PAGAMENTO_CONFIRMADO';
          freight.status = 'Pago';
        } else {
          freight.status = freight.entregaConfirmada ? 'Pendente Saldo' : 'Adiantamento Pago';
        }
      } else {
        freight.saldoPago = true;
        freight.saldoPagoEm = spNow.formatted;
        freight.saldoVerificacaoStatus = 'PAGAMENTO_CONFIRMADO';
        freight.saldoConfirmadoPorId = user.id;
        freight.saldoConfirmadoPorNome = user.name;
        freight.saldoConfirmadoEm = spNow.formatted;
        if (receipt.transactionCode) {
          freight.codigoTransacaoSaldo = receipt.transactionCode;
        }
        freight.status = 'Pago';
      }

      appendPaymentAuditHistory({
        freightId: freight.id,
        freightCode: freight.code,
        installmentType: receipt.installmentType,
        eventType: 'PAGAMENTO_CONFIRMADO',
        actorId: user.id,
        actorName: user.name,
        actorRole: user.roleTitle,
        summary: `Pagamento de ${receipt.installmentType === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'} (${receipt.expectedAmountBRL.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) conferido e confirmado por ${user.name}.`,
        receiptId: receipt.id,
        intentId: receipt.intentId,
        amountBRL: receipt.expectedAmountBRL,
      });

      appendServerAuditLog(
        user.id,
        user.name,
        user.accessLevel,
        'CONFIRMACAO_PAGAMENTO_FRETE',
        `Pagamento de ${receipt.installmentType} do frete ${freight.code} confirmado por ${user.name} (Comprovante ${receipt.id}).`,
        req.ip
      );

      savePaymentStore();

      res.json({
        ok: true,
        receipt,
        freight: enrichFreightWithReceipts(freight),
        message: `Pagamento de ${receipt.installmentType === 'ADIANTAMENTO' ? 'Adiantamento' : 'Saldo'} confirmado com sucesso por ${user.name}.`,
      });
    }
  );

  // --------------------------------------------------------------------------
  // 7. PROTECTED PRIVATE DOWNLOAD ROUTE
  // Requirement 7: "Não usar links públicos permanentes para comprovantes."
  // --------------------------------------------------------------------------
  app.get(
    '/api/pagamentos/comprovantes/:receiptId/download',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = requireFinanceiroPermission(req, res);
      if (!user) return;

      const receiptId = String(req.params.receiptId || '');
      const receipt = paymentStoreState.receipts.find((r) => r.id === receiptId);
      if (!receipt) {
        res.status(404).json({
          error: 'Comprovante não encontrado.',
          code: 'RECEIPT_NOT_FOUND',
        });
        return;
      }

      const absPath = path.join(PAYMENT_RECEIPTS_DIR, path.basename(receipt.storageFileName));
      if (!fs.existsSync(absPath)) {
        res.status(404).json({
          error: 'Arquivo binário do comprovante não encontrado no armazenamento privado.',
          code: 'BINARY_NOT_FOUND',
        });
        return;
      }

      res.setHeader('Content-Type', receipt.mimeType);
      res.setHeader('Cache-Control', 'private, no-store, max-age=0');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(receipt.originalFileName)}"`
      );
      fs.createReadStream(absPath).pipe(res);
    }
  );

  // List audit history & receipts for a specific freight
  app.get(
    '/api/pagamentos/fretes/:freightId/historico',
    requireApprovedSession,
    (req: any, res: Response) => {
      const user = requireFinanceiroPermission(req, res);
      if (!user) return;

      const freightId = String(req.params.freightId || '');
      const receipts = paymentStoreState.receipts.filter((r) => r.freightId === freightId);
      const history = paymentStoreState.history.filter((h) => h.freightId === freightId);
      const intents = paymentStoreState.intents.filter((i) => i.freightId === freightId);

      res.json({
        ok: true,
        receipts,
        history,
        intents,
      });
    }
  );
}

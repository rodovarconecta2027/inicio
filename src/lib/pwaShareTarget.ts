import { PaymentInstallmentType, PaymentReceiptOrigin } from '../types';

const IDB_NAME = 'rodovar_shared_receipts_idb';
const IDB_VERSION = 1;
const IDB_SHARED_STORE = 'shared_receipts';
const OFFLINE_QUEUE_KEY = 'rodovar_offline_receipt_queue_v1';
const ACTIVE_SHARED_DRAFT_KEY = 'rodovar_active_shared_draft_v1';

export interface SharedReceiptDraft {
  id: string;
  createdAtIso: string;
  textOnly: boolean;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  dataUrl?: string;
  fileBase64?: string;
  sharedTitle?: string;
  sharedText?: string;
  sharedUrl?: string;
  errorMessage?: string;
  origin: PaymentReceiptOrigin;
}

export interface OfflinePendingReceiptItem {
  id: string;
  idempotencyKey: string;
  userId: string;
  freightId: string;
  freightCode: string;
  installmentType: PaymentInstallmentType;
  intentId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  fileBase64: string;
  origin: PaymentReceiptOrigin;
  transactionCode?: string;
  observations?: string;
  isScheduledProof?: boolean;
  createdAtIso: string;
  lastError?: string;
}

function openSharedReceiptsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB indisponível'));
      return;
    }
    const req = window.indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_SHARED_STORE)) {
        db.createObjectStore(IDB_SHARED_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(sub));
  }
  return window.btoa(binary);
}

export async function readSharedReceiptFromIdb(
  shareId?: string | null
): Promise<SharedReceiptDraft | null> {
  try {
    const db = await openSharedReceiptsDb();
    return await new Promise<SharedReceiptDraft | null>((resolve, reject) => {
      const tx = db.transaction(IDB_SHARED_STORE, 'readonly');
      const store = tx.objectStore(IDB_SHARED_STORE);

      if (shareId) {
        const req = store.get(shareId);
        req.onsuccess = () => {
          const item = req.result;
          if (!item) {
            resolve(null);
            return;
          }
          resolve(convertIdbItemToDraft(item));
        };
        req.onerror = () => reject(req.error);
      } else {
        const req = store.getAll();
        req.onsuccess = () => {
          const list = Array.isArray(req.result) ? req.result : [];
          if (list.length === 0) {
            resolve(null);
            return;
          }
          list.sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
          resolve(convertIdbItemToDraft(list[0]));
        };
        req.onerror = () => reject(req.error);
      }
    });
  } catch {
    return null;
  }
}

function convertIdbItemToDraft(item: any): SharedReceiptDraft {
  let fileBase64 = item.fileBase64 || '';
  if (!fileBase64 && item.arrayBuffer) {
    fileBase64 = arrayBufferToBase64(item.arrayBuffer);
  }
  const mimeType = item.mimeType || 'application/pdf';
  const dataUrl = fileBase64 ? `data:${mimeType};base64,${fileBase64}` : undefined;
  return {
    id: item.id,
    createdAtIso: item.createdAtIso || new Date().toISOString(),
    textOnly: Boolean(item.textOnly),
    fileName: item.fileName,
    mimeType,
    sizeBytes: item.sizeBytes,
    fileBase64,
    dataUrl,
    sharedTitle: item.sharedTitle,
    sharedText: item.sharedText,
    sharedUrl: item.sharedUrl,
    errorMessage: item.errorMessage,
    origin: 'COMPARTILHAMENTO',
  };
}

export async function saveSharedDraftToDevice(draft: SharedReceiptDraft): Promise<void> {
  try {
    sessionStorage.setItem(ACTIVE_SHARED_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // ignore storage quota errors on sessionStorage
  }
  try {
    const db = await openSharedReceiptsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_SHARED_STORE, 'readwrite');
      const store = tx.objectStore(IDB_SHARED_STORE);
      store.put({
        ...draft,
        createdAtMs: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore IDB fallback
  }
}

export function getSavedSessionDraft(): SharedReceiptDraft | null {
  try {
    const raw = sessionStorage.getItem(ACTIVE_SHARED_DRAFT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SharedReceiptDraft;
  } catch {
    return null;
  }
}

export async function clearSharedReceiptDraft(shareId?: string): Promise<void> {
  try {
    sessionStorage.removeItem(ACTIVE_SHARED_DRAFT_KEY);
  } catch {
    // ignore
  }
  try {
    const db = await openSharedReceiptsDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_SHARED_STORE, 'readwrite');
      const store = tx.objectStore(IDB_SHARED_STORE);
      if (shareId) {
        store.delete(shareId);
      } else {
        store.clear();
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
}

// Offline pending upload queue (when device has no internet connection)
export function loadOfflinePendingReceipts(userId?: string): OfflinePendingReceiptItem[] {
  try {
    const raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflinePendingReceiptItem[];
    if (!Array.isArray(parsed)) return [];
    if (userId) {
      return parsed.filter((item) => item.userId === userId);
    }
    return parsed;
  } catch {
    return [];
  }
}

export function enqueueOfflinePendingReceipt(item: OfflinePendingReceiptItem): void {
  try {
    const current = loadOfflinePendingReceipts();
    const filtered = current.filter((x) => x.idempotencyKey !== item.idempotencyKey);
    filtered.unshift(item);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(filtered));
  } catch {
    // ignore quota error
  }
}

export function removeOfflinePendingReceipt(idempotencyKey: string): void {
  try {
    const current = loadOfflinePendingReceipts();
    const next = current.filter((x) => x.idempotencyKey !== idempotencyKey);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function clearOfflinePendingReceiptsForUser(userId?: string): void {
  try {
    if (!userId) {
      localStorage.removeItem(OFFLINE_QUEUE_KEY);
      return;
    }
    const current = loadOfflinePendingReceipts();
    const next = current.filter((x) => x.userId !== userId);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export { usePWAInstall } from '../hooks/usePWA';
